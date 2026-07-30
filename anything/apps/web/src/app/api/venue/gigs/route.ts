import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRoute } from '@/app/api/utils/route-kit';

/**
 * The calling venue's own gigs, every status included (venue dashboard
 * "Open Gigs", P1.3). Tenant-scoped by the session user — the venue id is
 * always derived server-side, never taken from the client (§6.3).
 */
export const GET = withRoute('venue.gigs', async () => {
  const user = await authGuard.requireRole('VENUE');

  const venueRows = await sql`
    SELECT id FROM venue_profiles WHERE user_id = ${user.id} LIMIT 1
  `;
  if (venueRows.length === 0) return Response.json({ gigs: [] });

  const gigs = await sql`
    SELECT id, title, role_needed, description, start_time, end_time,
           base_rate, tips_included, status, created_at
    FROM gigs
    WHERE venue_id = ${venueRows[0].id}
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return Response.json({ gigs });
});
