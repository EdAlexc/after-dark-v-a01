import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { AdminReportUpdateSchema, ReportIdSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';

interface ReportRow {
  id: number;
  reporter_id: string | null;
  entity_type: string;
  entity_id: string;
  reason: string;
  severity: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  resolution_note: string | null;
}

async function loadReport(id: number): Promise<ReportRow | null> {
  const rows = (await sql`
    SELECT id, reporter_id, entity_type, entity_id, reason, severity, status,
           created_at, reviewed_at, resolution_note
    FROM reports WHERE id = ${id} LIMIT 1
  `) as ReportRow[];
  return rows[0] ?? null;
}

/**
 * GET /api/admin/reports/[id] (P9.1) — full report detail with the reported
 * entity's context. When the entity is a conversation, the last messages are
 * included so the moderator can judge the report — **that read is recorded as
 * a moderation event** (`admin.moderation.messages_read`, the security gate's
 * "admin reads of private messages are logged" requirement).
 */
export const GET = withRoute('admin.reports.detail', async (_request, context) => {
  const admin = await authGuard.requireRole('ADMIN');
  const params = await context.params;
  const parsed = ReportIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();

  const report = await loadReport(parsed.data);
  if (!report) throw ApiError.notFound();

  let conversation: Record<string, unknown> | null = null;
  let messages: Array<Record<string, unknown>> = [];
  if (report.entity_type === 'conversation') {
    const conversationRows = (await sql`
      SELECT c.id, c.kind, c.gig_id, g.title AS gig_title,
             vu.email AS venue_email, cu.email AS counterpart_email
      FROM conversations c
      LEFT JOIN gigs g ON g.id = c.gig_id
      LEFT JOIN "user" vu ON vu.id = c.venue_user_id
      LEFT JOIN "user" cu ON cu.id = c.counterpart_user_id
      WHERE c.id = ${report.entity_id}
      LIMIT 1
    `) as Array<Record<string, unknown>>;
    conversation = conversationRows[0] ?? null;

    if (conversation) {
      messages = (await sql`
        SELECT m.id, m.kind, m.content, m.rate_cents, m.created_at,
               u.email AS sender_email
        FROM messages m
        LEFT JOIN "user" u ON u.id = m.sender_id
        WHERE m.conversation_id = ${report.entity_id}
        ORDER BY m.created_at DESC
        LIMIT 20
      `) as Array<Record<string, unknown>>;

      // Security gate: reading private messages for moderation leaves a trail.
      await auditLogger.record({
        actorId: admin.id,
        action: 'admin.moderation.messages_read',
        entityType: 'conversation',
        entityId: report.entity_id,
        metadata: { reportId: report.id, messageCount: messages.length },
      });
    }
  }

  return Response.json({ report, conversation, messages });
});

/**
 * PATCH /api/admin/reports/[id] — triage transition (OPEN|REVIEWING →
 * REVIEWING|CLOSED). Idempotent on re-sending the current status; audited
 * with the acting admin.
 */
export const PATCH = withRoute('admin.reports.update', async (request, context) => {
  const admin = await authGuard.requireRole('ADMIN');
  const params = await context.params;
  const parsed = ReportIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();
  const body = await parseBody(request, AdminReportUpdateSchema);

  const report = await loadReport(parsed.data);
  if (!report) throw ApiError.notFound();
  if (report.status === body.status) return Response.json({ report }); // no-op
  if (report.status === 'CLOSED') {
    throw ApiError.badRequest('Report is closed — reopen is not supported');
  }

  const updated = (await sql`
    UPDATE reports
    SET status = ${body.status},
        reviewed_by = ${admin.id},
        reviewed_at = NOW(),
        resolution_note = COALESCE(${body.resolution_note ?? null}, resolution_note)
    WHERE id = ${parsed.data} AND status = ${report.status}
    RETURNING id, entity_type, entity_id, reason, severity, status, created_at,
              reviewed_at, resolution_note
  `) as ReportRow[];
  if (updated.length === 0) {
    throw new ApiError(409, 'Report changed underneath you — reload');
  }

  await auditLogger.record({
    actorId: admin.id,
    action: 'admin.report.transition',
    entityType: 'report',
    entityId: String(report.id),
    metadata: { from: report.status, to: body.status, hasNote: Boolean(body.resolution_note) },
  });

  return Response.json({ report: updated[0] });
});
