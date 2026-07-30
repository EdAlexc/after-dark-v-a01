import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRoute } from '@/app/api/utils/route-kit';

/**
 * GET /api/venue/applications (P3.2) — every application to the calling
 * venue's gigs, joined with the talent's PUBLIC profile card only (stage
 * name, role, rates, avatar — never email or auth linkage; the §6.1 matrix
 * asserts this shape).
 */
export const GET = withRoute('venue.applications', async () => {
  const user = await authGuard.requireRole('VENUE');

  const applications = await sql`
    SELECT a.id, a.gig_id, a.status, a.proposed_rate_cents, a.cover_message,
           a.created_at,
           g.title AS gig_title, g.start_time, g.base_rate,
           tp.stage_name, tp.primary_role, tp.neighborhood AS talent_neighborhood,
           tp.hourly_rate_min, tp.hourly_rate_max, tp.avatar_url, tp.genres_vibes
    FROM applications a
    JOIN gigs g ON g.id = a.gig_id
    JOIN venue_profiles vp ON vp.id = g.venue_id
    JOIN talent_profiles tp ON tp.id = a.talent_id
    WHERE vp.user_id = ${user.id}
    ORDER BY (a.status = 'PENDING') DESC, a.created_at DESC
    LIMIT 200
  `;
  return Response.json({ applications });
});
