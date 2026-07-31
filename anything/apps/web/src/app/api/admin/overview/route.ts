import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRoute } from '@/app/api/utils/route-kit';
import { stripeEnabled } from '@/lib/stripe';

/**
 * GET /api/admin/overview (P9) — the wireframe-p1 KPI cards, from real
 * aggregates in one round trip batch. ADMIN only; read-only, so it is not
 * audited (every admin WRITE is).
 */
export const GET = withRoute('admin.overview', async () => {
  await authGuard.requireRole('ADMIN');

  const [users, reports, gigs, payouts, shiftsTonight] = await Promise.all([
    sql`
      SELECT COALESCE(role, 'UNASSIGNED') AS role,
             COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE suspended_at IS NOT NULL)::int AS suspended
      FROM "user" GROUP BY role
    `,
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
  ]);

  return Response.json({
    users,
    reports,
    gigs,
    payouts,
    activeShifts: (shiftsTonight as Array<{ count: number }>)[0]?.count ?? 0,
    stripeConfigured: stripeEnabled(),
  });
});
