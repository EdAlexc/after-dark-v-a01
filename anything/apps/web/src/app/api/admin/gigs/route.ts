import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { parseQuery } from '@/app/api/utils/validation';
import { AdminGigsQuerySchema } from '@/app/api/utils/schemas';
import { withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';

const PAGE_SIZE = 25;

/**
 * GET /api/admin/gigs (P9.2) — cross-tenant gig management view (wireframe
 * p1): every gig regardless of status, with venue identity and application
 * pressure. Admin is the one role allowed to see all tenants at once.
 */
export const GET = withRoute('admin.gigs.list', async (request) => {
  const admin = await authGuard.requireRole('ADMIN');
  const { status, page } = parseQuery(request.url, AdminGigsQuerySchema);
  const offset = (page - 1) * PAGE_SIZE;

  // RLS (S2): cross-tenant read via the ADMIN context policies.
  const rows = await withRlsContext<Array<Record<string, unknown>>>(admin, sql`
    SELECT g.id, g.title, g.role_needed, g.status, g.start_time, g.base_rate,
           g.age_requirement, g.created_at,
           vp.venue_name, vu.email AS venue_email,
           COALESCE(a.applicant_count, 0)::int AS applicant_count,
           COALESCE(r.open_reports, 0)::int AS open_reports
    FROM gigs g
    JOIN venue_profiles vp ON vp.id = g.venue_id
    JOIN "user" vu ON vu.id = vp.user_id
    LEFT JOIN (
      SELECT gig_id, COUNT(*) AS applicant_count
      FROM applications WHERE status <> 'WITHDRAWN' GROUP BY gig_id
    ) a ON a.gig_id = g.id
    LEFT JOIN (
      SELECT entity_id, COUNT(*) AS open_reports
      FROM reports WHERE entity_type = 'gig' AND status <> 'CLOSED'
      GROUP BY entity_id
    ) r ON r.entity_id = g.id::text
    WHERE (${status ?? null}::text IS NULL OR g.status = ${status ?? null})
    ORDER BY g.created_at DESC
    LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
  `);

  const hasMore = rows.length > PAGE_SIZE;
  return Response.json({ gigs: rows.slice(0, PAGE_SIZE), page, hasMore });
});
