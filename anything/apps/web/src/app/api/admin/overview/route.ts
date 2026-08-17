import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';
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
  const [users, [reports, gigs, payouts, shiftsTonight, heartbeats]] = await Promise.all([
    sql`
      SELECT COALESCE(role, 'UNASSIGNED') AS role,
             COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE suspended_at IS NOT NULL)::int AS suspended
      FROM "user" GROUP BY role
    `,
    withRlsContext<[unknown[], unknown[], unknown[], unknown[], unknown[]]>(admin, [
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
  });
});
