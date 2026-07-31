import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { parseQuery } from '@/app/api/utils/validation';
import { AdminUsersQuerySchema } from '@/app/api/utils/schemas';
import { withRoute } from '@/app/api/utils/route-kit';

const PAGE_SIZE = 25;

/**
 * GET /api/admin/users (P9.2) — the wireframe-p1 "User & Gig Management"
 * table: identity, role, standing (suspended / open reports against them),
 * paginated with search + role/flagged filters. Read-only; the write is
 * PATCH /api/admin/users/[id].
 */
export const GET = withRoute('admin.users.list', async (request) => {
  await authGuard.requireRole('ADMIN');
  const { q, role, flagged, page } = parseQuery(request.url, AdminUsersQuerySchema);
  const offset = (page - 1) * PAGE_SIZE;

  // One filtered query built from optional predicates. Parameterized — the
  // text fragments below are constants, only values travel as params.
  const like = q ? `%${q}%` : null;
  const rows = (await sql`
    SELECT u.id, u.name, u.email, u.role, u."createdAt" AS created_at,
           u.suspended_at, u.suspended_reason,
           COALESCE(r.open_reports, 0)::int AS open_reports
    FROM "user" u
    LEFT JOIN (
      SELECT entity_id, COUNT(*) AS open_reports
      FROM reports
      WHERE entity_type = 'user' AND status <> 'CLOSED'
      GROUP BY entity_id
    ) r ON r.entity_id = u.id
    WHERE (${like}::text IS NULL OR u.email ILIKE ${like} OR u.name ILIKE ${like})
      AND (${role ?? null}::text IS NULL OR u.role = ${role ?? null})
      AND (
        ${flagged ?? null}::boolean IS NOT TRUE
        OR u.suspended_at IS NOT NULL
        OR COALESCE(r.open_reports, 0) > 0
      )
    ORDER BY u."createdAt" DESC
    LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
  `) as Array<Record<string, unknown>>;

  const hasMore = rows.length > PAGE_SIZE;
  return Response.json({ users: rows.slice(0, PAGE_SIZE), page, hasMore });
});
