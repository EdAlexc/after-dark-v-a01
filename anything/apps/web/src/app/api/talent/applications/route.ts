import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';

/**
 * GET /api/talent/applications (P3.3) — the calling talent's own applications
 * with the gig card fields the "My Applications" list renders. Tenant-scoped
 * from the session; no filter can reach anyone else's rows.
 */
export const GET = withRoute('talent.applications', async () => {
  const user = await authGuard.requireRole('TALENT');

  // RLS (S2): own-rows read via applications_talent_own + gig carve-outs.
  const applications = await withRlsContext<Record<string, unknown>[]>(
    user,
    sql`
      SELECT a.id, a.gig_id, a.status, a.proposed_rate_cents, a.cover_message,
             a.created_at, a.updated_at,
             g.title AS gig_title, g.role_needed, g.start_time, g.end_time,
             g.base_rate, g.status AS gig_status,
             vp.venue_name, vp.neighborhood AS venue_neighborhood
      FROM applications a
      JOIN talent_profiles tp ON tp.id = a.talent_id
      JOIN gigs g ON g.id = a.gig_id
      JOIN venue_profiles vp ON vp.id = g.venue_id
      WHERE tp.user_id = ${user.id}
      ORDER BY a.created_at DESC
      LIMIT 100
    `
  );
  return Response.json({ applications });
});
