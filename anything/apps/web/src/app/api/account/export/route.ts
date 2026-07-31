import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { collectAccountExport } from '@/app/api/utils/account-data';
import { withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

/**
 * Right of access / portability — `GET /api/account/export`
 * (TENANT_GUARDRAIL §4.2 G4, GDPR Art. 15/20).
 *
 * Self-serve and immediate: the user downloads their own data as JSON. Scoped
 * strictly to the session user — there is no id parameter, so there is nothing
 * to tamper with. Rate-limited because it is the single largest PII egress
 * point in the app.
 */

const exportLimiter = getRateLimiter('account-export', { windowMs: 60 * 60 * 1000, max: 5 });

export const GET = withRoute('account.export', async (request) => {
  // Data-subject rights survive suspension (P9): allowSuspended is only here.
  const user = await authGuard.requireSession({ allowSuspended: true });
  await enforceRateLimit(exportLimiter, clientKey(request, user.id));

  const data = await collectAccountExport(user.id);

  await auditLogger.record({
    actorId: user.id,
    action: 'account.export',
    entityType: 'user',
    entityId: user.id,
    metadata: { gigs: data.gigs.length, auditRows: data.audit_log.length },
  });

  const filename = `afterdark-data-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // This is the user's own PII — never let a shared cache hold it.
      'Cache-Control': 'no-store, private',
    },
  });
});
