import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { ReportCreateSchema } from '@/app/api/utils/schemas';
import { withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

const reportLimiter = getRateLimiter('reports-create', { windowMs: 60 * 60 * 1000, max: 10 });

/**
 * POST /api/reports (P5.3) — "Report conversation" and friends. Any signed-in
 * user may file one; only ADMIN reads them (P9 triage). Deliberately no GET
 * here — the moderation queue is an admin surface.
 */
export const POST = withRoute('reports.create', async (request) => {
  const user = await authGuard.requireSession();
  await enforceRateLimit(reportLimiter, clientKey(request, user.id));

  const body = await parseBody(request, ReportCreateSchema);

  // RLS (S2): reports_create WITH CHECKs reporter_id = request context.
  const inserted = await withRlsContext<Array<Record<string, unknown>>>(
    user,
    sql`
      INSERT INTO reports (reporter_id, entity_type, entity_id, reason, severity)
      VALUES (${user.id}, ${body.entity_type}, ${body.entity_id}, ${body.reason}, ${body.severity})
      RETURNING id, status, severity, created_at
    `
  );

  await auditLogger.record({
    actorId: user.id,
    action: 'report.create',
    entityType: body.entity_type,
    entityId: body.entity_id,
    metadata: { severity: body.severity, reportId: inserted[0].id },
  });

  return Response.json({ report: inserted[0] }, { status: 201 });
});
