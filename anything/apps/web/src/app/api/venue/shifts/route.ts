import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';

/**
 * GET /api/venue/shifts (P7) — the venue's live-ops board ("Active
 * Operations", wireframe p10): shifts on own gigs with the talent's public
 * card, plus the Payouts Pending aggregate the dashboard KPI shows.
 */
export const GET = withRoute('venue.shifts', async () => {
  const user = await authGuard.requireRole('VENUE');

  // RLS (S2): both reads carry the venue's context (shifts_venue_own,
  // payouts_participant_read); batched in one context transaction.
  const [shifts, pending] = await withRlsContext<[
    Record<string, unknown>[],
    Array<{ pending_cents: number; pending_count: number }>,
  ]>(user, [
    sql`
      SELECT s.id, s.status, s.call_time, s.check_in_at, s.check_out_at,
             s.agreed_rate_cents, s.shift_pay_cents,
             g.title AS gig_title, g.id AS gig_id,
             tp.stage_name, tp.primary_role, tp.avatar_url
      FROM shifts s
      JOIN gigs g ON g.id = s.gig_id
      JOIN venue_profiles vp ON vp.id = g.venue_id
      JOIN talent_profiles tp ON tp.id = s.talent_id
      WHERE vp.user_id = ${user.id}
      ORDER BY s.call_time DESC NULLS LAST
      LIMIT 50
    `,
    sql`
      SELECT COALESCE(SUM(gross_cents), 0)::int AS pending_cents,
             COUNT(*)::int AS pending_count
      FROM payouts
      WHERE venue_user_id = ${user.id} AND status IN ('PENDING', 'HELD')
    `,
  ]);

  const aggregate = (pending as Array<{ pending_cents: number; pending_count: number }>)[0];
  return Response.json({
    shifts,
    payoutsPendingCents: aggregate?.pending_cents ?? 0,
    payoutsPendingCount: aggregate?.pending_count ?? 0,
  });
});
