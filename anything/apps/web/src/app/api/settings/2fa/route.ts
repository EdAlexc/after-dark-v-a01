import QRCode from 'qrcode';
import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { TwoFactorActionSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';
import { SecretBox } from '@/app/api/utils/crypto-box';
import { buildOtpauthUrl, generateTotpSecret, verifyTotp } from '@/app/api/utils/totp';
import { logger } from '@/app/api/utils/logger';

/**
 * TOTP 2FA (hardened — CLAUDE.md §7.3):
 *  - secrets are encrypted at rest (SecretBox, AES-256-GCM);
 *  - QR codes are rendered locally — the otpauth URI (which embeds the
 *    secret) never leaves the server (previously it was sent to
 *    api.qrserver.com);
 *  - once enrolled, the secret is never returned to any session;
 *  - verification is rate-limited and constant-time.
 *
 * Full better-auth twoFactor-plugin migration (recovery codes) is tracked in
 * DEV_TIMELINE → Technical Backlog.
 */

const statusLimiter = getRateLimiter('2fa-status', { windowMs: 15 * 60 * 1000, max: 10 });
const verifyLimiter = getRateLimiter('2fa-verify', { windowMs: 15 * 60 * 1000, max: 5 });

const log = logger.child('2fa');

function secretBoxOrThrow(): SecretBox {
  try {
    return SecretBox.fromEnv();
  } catch (error) {
    log.error('2FA encryption key missing/invalid', { error });
    throw new ApiError(500, '2FA is not configured on this server');
  }
}

/** Decrypts a stored secret; tolerates legacy plaintext rows (pre-encryption). */
function readStoredSecret(stored: string, box: SecretBox): string {
  if (SecretBox.isEncrypted(stored)) return box.decrypt(stored);
  log.warn('legacy plaintext TOTP secret encountered — will re-encrypt on next enrollment');
  return stored;
}

// GET /api/settings/2fa — status; setup material only when NOT yet enrolled.
export const GET = withRoute('settings.2fa.status', async (request) => {
  const user = await authGuard.requireSession();
  enforceRateLimit(statusLimiter, clientKey(request, user.id));

  const rows = await sql`
    SELECT totp_enabled FROM "user" WHERE id = ${user.id} LIMIT 1
  `;
  const enabled = rows[0]?.totp_enabled ?? false;

  if (enabled) {
    // Never re-disclose the secret to an authenticated session (hijack ≠ clone).
    return Response.json({ enabled: true });
  }

  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpauthUrl(user.email, secret);
  const qrUrl = await QRCode.toDataURL(otpauthUrl, { width: 200, margin: 1 });
  return Response.json({ enabled: false, secret, qrUrl });
});

// POST /api/settings/2fa — enable or disable, both verified by a live token.
export const POST = withRoute('settings.2fa.update', async (request) => {
  const user = await authGuard.requireSession();
  enforceRateLimit(verifyLimiter, clientKey(request, user.id));

  const body = await parseBody(request, TwoFactorActionSchema);
  const box = secretBoxOrThrow();

  if (body.action === 'enable') {
    if (!verifyTotp(body.secret, body.token)) {
      throw ApiError.badRequest('Invalid verification code');
    }
    await sql`
      UPDATE "user"
      SET totp_secret = ${box.encrypt(body.secret)}, totp_enabled = true
      WHERE id = ${user.id}
    `;
    await auditLogger.record({
      actorId: user.id,
      action: '2fa.enable',
      entityType: 'user',
      entityId: user.id,
    });
    return Response.json({ success: true, enabled: true });
  }

  // action === 'disable'
  const rows = await sql`
    SELECT totp_secret FROM "user" WHERE id = ${user.id} LIMIT 1
  `;
  const stored = rows[0]?.totp_secret;
  if (!stored || !verifyTotp(readStoredSecret(stored, box), body.token)) {
    throw ApiError.badRequest('Invalid verification code');
  }
  await sql`
    UPDATE "user" SET totp_secret = null, totp_enabled = false WHERE id = ${user.id}
  `;
  await auditLogger.record({
    actorId: user.id,
    action: '2fa.disable',
    entityType: 'user',
    entityId: user.id,
  });
  return Response.json({ success: true, enabled: false });
});
