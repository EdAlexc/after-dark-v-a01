import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseQuery } from '@/app/api/utils/validation';
import { AdminAuditQuerySchema } from '@/app/api/utils/schemas';
import { withRoute } from '@/app/api/utils/route-kit';

const PAGE_SIZE = 50;
/** CSV export cap — keeps the handler bounded (<1s, §6.3) instead of async. */
const CSV_LIMIT = 10_000;

function csvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * GET /api/admin/audit-logs (P9.2) — the wireframe-p1 audit viewer + "Export
 * Audit Log". JSON is paginated (50/page, filters on actor/action/entity);
 * `?format=csv` streams the same filtered view capped at 10k newest rows —
 * bounded instead of a background job so the handler stays under a second
 * (DEV_TIMELINE P9.2). Exports are themselves audited.
 */
export const GET = withRoute('admin.audit.list', async (request) => {
  const admin = await authGuard.requireRole('ADMIN');
  const { actor, action, entity_type, page, format } = parseQuery(
    request.url,
    AdminAuditQuerySchema
  );

  const actorLike = actor ? `%${actor}%` : null;
  const actionLike = action ? `%${action}%` : null;

  if (format === 'csv') {
    const rows = (await sql`
      SELECT id, actor_id, action, entity_type, entity_id, metadata, created_at
      FROM audit_logs
      WHERE (${actorLike}::text IS NULL OR actor_id ILIKE ${actorLike})
        AND (${actionLike}::text IS NULL OR action ILIKE ${actionLike})
        AND (${entity_type ?? null}::text IS NULL OR entity_type = ${entity_type ?? null})
      ORDER BY created_at DESC
      LIMIT ${CSV_LIMIT}
    `) as Array<Record<string, unknown>>;

    await auditLogger.record({
      actorId: admin.id,
      action: 'admin.audit.export',
      entityType: 'audit_logs',
      metadata: { rows: rows.length, filters: { actor, action, entity_type } },
    });

    const header = 'id,actor_id,action,entity_type,entity_id,metadata,created_at';
    const lines = rows.map((row) =>
      [
        row.id,
        row.actor_id,
        row.action,
        row.entity_type,
        row.entity_id,
        JSON.stringify(row.metadata ?? {}),
        row.created_at,
      ]
        .map(csvField)
        .join(',')
    );
    return new Response([header, ...lines].join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="afterdark-audit-${
          new Date().toISOString().slice(0, 10)
        }.csv"`,
        'Cache-Control': 'no-store, private',
      },
    });
  }

  const offset = (page - 1) * PAGE_SIZE;
  const rows = (await sql`
    SELECT id, actor_id, action, entity_type, entity_id, metadata, created_at
    FROM audit_logs
    WHERE (${actorLike}::text IS NULL OR actor_id ILIKE ${actorLike})
      AND (${actionLike}::text IS NULL OR action ILIKE ${actionLike})
      AND (${entity_type ?? null}::text IS NULL OR entity_type = ${entity_type ?? null})
    ORDER BY created_at DESC
    LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
  `) as Array<Record<string, unknown>>;

  const hasMore = rows.length > PAGE_SIZE;
  return Response.json({ logs: rows.slice(0, PAGE_SIZE), page, hasMore });
});
