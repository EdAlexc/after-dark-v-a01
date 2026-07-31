import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { ChangePasswordSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

/** Credential change is brute-forceable — keep this tight (A07). */
const passwordLimiter = getRateLimiter('change-password', {
  windowMs: 15 * 60 * 1000,
  max: 5,
});

export const POST = withRoute('settings.change-password', async (request) => {
  const user = await authGuard.requireSession();
  await enforceRateLimit(passwordLimiter, clientKey(request, user.id));

  const { currentPassword, newPassword } = await parseBody(request, ChangePasswordSchema);

  let result: unknown;
  try {
    result = await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: false },
      headers: await headers(),
    });
  } catch {
    // better-auth throws on wrong current password — keep the message generic.
    throw ApiError.badRequest('Current password is incorrect or another error occurred');
  }
  if (!result) {
    throw ApiError.badRequest('Failed to change password — check your current password');
  }

  await auditLogger.record({
    actorId: user.id,
    action: 'password.change',
    entityType: 'user',
    entityId: user.id,
  });

  return Response.json({ success: true });
});
