import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';
import { APDEX_T_MS } from '@/app/api/utils/telemetry';
import { stripeEnabled } from '@/lib/stripe';

/**
 * GET /api/admin/overview (P9) — the wireframe-p1 KPI cards, from real
 * aggregates in one round trip batch. ADMIN only; read-only, so it is not
 * audited (every admin WRITE is).
 */
export const GET = withRoute('admin.overview', async () => {
  const admin = await authGuard.requireRole('ADMIN');

  // RLS (S2): the tenant-table aggregates need ADMIN context (platform_all
  // policies); "user" is not RLS-governed and stays outside the batch.
  const [users, [reports, gigs, payouts, shiftsTonight, heartbeats, traffic, endpointApdex, webVitals]] =
    await Promise.all([
    sql`
      SELECT COALESCE(role, 'UNASSIGNED') AS role,
             COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE suspended_at IS NOT NULL)::int AS suspended
      FROM "user" GROUP BY role
    `,
    withRlsContext<
      [unknown[], unknown[], unknown[], unknown[], unknown[], unknown[], unknown[], unknown[]]
    >(admin, [
      sql`
        SELECT status, severity, COUNT(*)::int AS count
        FROM reports GROUP BY status, severity
      `,
      sql`SELECT status, COUNT(*)::int AS count FROM gigs GROUP BY status`,
      sql`
        SELECT status, COUNT(*)::int AS count, COALESCE(SUM(net_cents), 0)::bigint AS net_cents
        FROM payouts GROUP BY status
      `,
      sql`
        SELECT COUNT(*)::int AS count FROM shifts
        WHERE status IN ('IN_TRANSIT', 'CHECKED_IN')
      `,
      // S14 (A5): last scheduled run per job, from the cron.heartbeat trail —
      // a schedule that stops firing (or never could, CRON_SECRET unset)
      // shows up here as "never" / stale instead of staying invisible.
      sql`
        SELECT entity_id AS job, MAX(created_at) AS last_run
        FROM audit_logs
        WHERE action = 'cron.heartbeat'
        GROUP BY entity_id
      `,
      // S18 (Q5/D6): traffic + API health from the route-kit timing capture.
      sql`
        SELECT COUNT(*)::int AS day_count,
               COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS hour_count,
               COUNT(*) FILTER (WHERE status >= 500)::int AS errors
        FROM api_timings
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `,
      // Per-endpoint Apdex at the §3 scorecard bar (T=300 ms, tolerating ≤4T).
      sql`
        SELECT route,
               COUNT(*)::int AS count,
               ((COUNT(*) FILTER (WHERE duration_ms <= ${APDEX_T_MS})
                 + COUNT(*) FILTER (WHERE duration_ms > ${APDEX_T_MS}
                                      AND duration_ms <= ${APDEX_T_MS * 4}) * 0.5)
                / COUNT(*))::float8 AS apdex
        FROM api_timings
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY route
        ORDER BY count DESC
        LIMIT 10
      `,
      // First-party CWV p75 over the scorecard window (7 days).
      sql`
        SELECT metric,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value)::float8 AS p75,
               COUNT(*)::int AS samples
        FROM rum_events
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY metric
      `,
    ]),
  ]);

  const heartbeatRows = heartbeats as Array<{ job: string; last_run: string }>;
  const lastRun = (job: string) =>
    heartbeatRows.find((row) => row.job === job)?.last_run ?? null;

  return Response.json({
    users,
    reports,
    gigs,
    payouts,
    activeShifts: (shiftsTonight as Array<{ count: number }>)[0]?.count ?? 0,
    stripeConfigured: stripeEnabled(),
    cronHealth: {
      payoutsRelease: lastRun('payouts-release'),
      retentionPurge: lastRun('retention-purge'),
    },
    // S18 (Q5/D6): the RUM/traffic cards. apdexT names the REAL scorecard
    // bar so the UI can label it honestly.
    telemetry: {
      apdexT: APDEX_T_MS,
      traffic: (traffic as Array<{ day_count: number; hour_count: number; errors: number }>)[0] ?? {
        day_count: 0,
        hour_count: 0,
        errors: 0,
      },
      endpointApdex: endpointApdex as Array<{ route: string; count: number; apdex: number }>,
      webVitals: webVitals as Array<{ metric: string; p75: number; samples: number }>,
    },
  });
});
