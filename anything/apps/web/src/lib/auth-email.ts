/**
 * better-auth email handlers (S13) — additive config consumed by
 * src/lib/auth.ts (the platform file stays a thin wiring site; the behavior
 * lives here where it is unit-testable without constructing the auth
 * instance).
 *
 * Contract notes:
 *  - NONE of these handlers may throw. /request-password-reset answers
 *    identically whether or not the account exists (no user enumeration);
 *    a throw here would 500 that request and break the uniform response.
 *    sendEmail already never throws; auditLogger already never throws.
 *  - Key-gating: with RESEND_API_KEY/EMAIL_FROM unset the sends no-op
 *    loudly. auth.ts ties requireEmailVerification to emailConfigured(), so
 *    verification is only ENFORCED when mail can actually be delivered —
 *    and enforcement self-heals for accounts created while unkeyed, because
 *    better-auth re-sends the verification email on an unverified sign-in
 *    attempt.
 */

import { auditLogger } from '@/app/api/utils/audit';
import {
  emailConfigured,
  passwordResetMessage,
  sendEmail,
  verifyEmailMessage,
} from '@/app/api/utils/email';

export { emailConfigured };

interface AuthEmailUser {
  id: string;
  email: string;
}

/** emailAndPassword.sendResetPassword — audit the request, send the link. */
export async function sendResetPasswordEmail({
  user,
  url,
}: {
  user: AuthEmailUser;
  url: string;
}): Promise<void> {
  await auditLogger.record({
    actorId: user.id,
    action: 'auth.password.reset_requested',
    entityType: 'user',
    entityId: user.id,
  });
  await sendEmail({ to: user.email, ...passwordResetMessage(url) });
}

/** emailAndPassword.onPasswordReset — the completion is a security event. */
export async function auditPasswordReset({ user }: { user: AuthEmailUser }): Promise<void> {
  await auditLogger.record({
    actorId: user.id,
    action: 'auth.password.reset_completed',
    entityType: 'user',
    entityId: user.id,
  });
}

/** emailVerification.sendVerificationEmail — audit the send, send the link. */
export async function sendVerificationEmailTo({
  user,
  url,
}: {
  user: AuthEmailUser;
  url: string;
}): Promise<void> {
  await auditLogger.record({
    actorId: user.id,
    action: 'auth.email.verification_sent',
    entityType: 'user',
    entityId: user.id,
  });
  await sendEmail({ to: user.email, ...verifyEmailMessage(url) });
}
