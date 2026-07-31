import { auth } from '@/lib/auth';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { AccountDeleteSchema } from '@/app/api/utils/schemas';
import { deleteAccountData, pseudonymizeActorId } from '@/app/api/utils/account-data';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

/**
 * Right to erasure — `DELETE /api/account`
 * (TENANT_GUARDRAIL §4.2 G4, GDPR Art. 17).
 *
 * Irreversible, so it is gated on a **fresh password re-authentication** even
 * though the caller already holds a session: a hijacked session must not be
 * able to destroy the account. Scoped to the session user; no id parameter
 * exists, so one user can never delete another.
 */

const deleteLimiter = getRateLimiter('account-delete', { windowMs: 60 * 60 * 1000, max: 5 });

export const DELETE = withRoute('account.delete', async (request) => {
  // Data-subject rights survive suspension (P9): allowSuspended is only here.
  const user = await authGuard.requireSession({ allowSuspended: true });
  await enforceRateLimit(deleteLimiter, clientKey(request, user.id));

  const { password, confirm } = await parseBody(request, AccountDeleteSchema);

  // Typed confirmation — guards against a mis-click or a CSRF-shaped mistake
  // reaching an irreversible operation.
  if (confirm !== 'DELETE') {
    throw ApiError.badRequest('Type DELETE to confirm account deletion');
  }

  // Re-authenticate. signInEmail throws on a bad password; we never surface why.
  try {
    const verified = await auth.api.signInEmail({
      body: { email: user.email, password },
    });
    if (!verified) throw new Error('verification failed');
  } catch {
    throw ApiError.badRequest('Password is incorrect');
  }

  // Audit BEFORE deleting: this record must survive, already pseudonymized, so
  // the trail shows the erasure happened without naming who was erased.
  await auditLogger.record({
    actorId: pseudonymizeActorId(user.id),
    action: 'account.delete',
    entityType: 'user',
    entityId: pseudonymizeActorId(user.id),
    metadata: { reason: 'user-requested erasure (GDPR Art. 17)' },
  });

  const result = await deleteAccountData(user.id);
  if (!result.userDeleted) {
    throw ApiError.notFound('Account not found');
  }

  return Response.json({
    deleted: true,
    auditRowsPseudonymized: result.auditRowsPseudonymized,
  });
});
