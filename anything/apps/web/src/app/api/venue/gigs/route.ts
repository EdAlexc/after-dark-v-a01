import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';

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

  // RLS (S2): drafts are only visible to the owner's context — an unwrapped
  // read here is the runbook's "dashboard silently half-empty" failure mode.
  const gigs = await withRlsContext<Record<string, unknown>[]>(
    user,
    sql`
      SELECT g.id, g.title, g.role_needed, g.description, g.start_time, g.end_time,
             g.base_rate, g.tips_included, g.age_requirement, g.status, g.created_at,
             COUNT(a.id) FILTER (WHERE a.status <> 'WITHDRAWN')::int AS applicant_count,
             COUNT(a.id) FILTER (WHERE a.status = 'SHORTLISTED')::int AS shortlisted_count,
             COUNT(a.id) FILTER (WHERE a.status = 'PENDING')::int AS pending_count
      FROM gigs g
      LEFT JOIN applications a ON a.gig_id = g.id
      WHERE g.venue_id = ${venueRows[0].id}
      GROUP BY g.id
      ORDER BY g.created_at DESC
      LIMIT 100
    `
  );
  return Response.json({ gigs });
});
