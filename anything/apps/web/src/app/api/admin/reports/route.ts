import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { parseQuery } from '@/app/api/utils/validation';
import { AdminReportsQuerySchema } from '@/app/api/utils/schemas';
import { withRoute } from '@/app/api/utils/route-kit';

/**
 * GET /api/admin/reports (P9.1) — the moderation triage queue (wireframe p1).
 * Open-first, HIGH severity on top, with just enough reporter/entity context
 * to act. Reading the queue is not itself audited; opening a report's detail
 * (which may expose message content) and every transition are.
 */
export const GET = withRoute('admin.reports.list', async (request) => {
  await authGuard.requireRole('ADMIN');
  const { status } = parseQuery(request.url, AdminReportsQuerySchema);

  const reports = status
    ? await sql`
        SELECT r.id, r.entity_type, r.entity_id, r.reason, r.severity, r.status,
               r.created_at, r.reviewed_at, r.resolution_note,
               ru.email AS reporter_email, ru.name AS reporter_name,
               rv.email AS reviewed_by_email
        FROM reports r
        LEFT JOIN "user" ru ON ru.id = r.reporter_id
        LEFT JOIN "user" rv ON rv.id = r.reviewed_by
        WHERE r.status = ${status}
        ORDER BY CASE r.severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
                 r.created_at DESC
        LIMIT 100
      `
    : await sql`
        SELECT r.id, r.entity_type, r.entity_id, r.reason, r.severity, r.status,
               r.created_at, r.reviewed_at, r.resolution_note,
               ru.email AS reporter_email, ru.name AS reporter_name,
               rv.email AS reviewed_by_email
        FROM reports r
        LEFT JOIN "user" ru ON ru.id = r.reporter_id
        LEFT JOIN "user" rv ON rv.id = r.reviewed_by
        ORDER BY CASE r.status WHEN 'OPEN' THEN 0 WHEN 'REVIEWING' THEN 1 ELSE 2 END,
                 CASE r.severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
                 r.created_at DESC
        LIMIT 100
      `;

  return Response.json({ reports });
});
