import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';

/**
 * GET /api/talent/shifts (P7) — the talent's bookings ("Upcoming Bookings" +
 * Check In on the dashboard, wireframe p8), own rows only, with the venue
 * card and each shift's payout status once one exists.
 */
export const GET = withRoute('talent.shifts', async () => {
  const user = await authGuard.requireRole('TALENT');

  // RLS (S2): shifts_talent_own + payouts_participant_read via context.
  const shifts = await withRlsContext<Record<string, unknown>[]>(
    user,
    sql`
      SELECT s.id, s.status, s.call_time, s.check_in_at, s.check_out_at,
             s.agreed_rate_cents, s.shift_pay_cents,
             g.title AS gig_title, g.id AS gig_id, g.start_time, g.end_time,
             vp.venue_name, vp.neighborhood AS venue_neighborhood,
             p.status AS payout_status, p.net_cents AS payout_net_cents
      FROM shifts s
      JOIN gigs g ON g.id = s.gig_id
      JOIN venue_profiles vp ON vp.id = g.venue_id
      JOIN talent_profiles tp ON tp.id = s.talent_id
      LEFT JOIN payouts p ON p.shift_id = s.id
      WHERE tp.user_id = ${user.id}
      ORDER BY s.call_time DESC NULLS LAST
      LIMIT 50
    `
  );
  return Response.json({ shifts });
});
