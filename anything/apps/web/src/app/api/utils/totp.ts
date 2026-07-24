/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30 s step) + RFC 4648 base32.
 *
 * Extracted from the 2FA route so the logic is reusable and testable against
 * the RFC test vectors. Verification uses a constant-time comparison and a
 * bounded ±1-step window (TENANT_GUARDRAIL §5 A07).
 */

import crypto from 'crypto';

const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of normalized) {
    const index = B32_CHARS.indexOf(char);
    if (index === -1) continue; // ignore non-alphabet chars (spaces, dashes)
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_CHARS[(value << (5 - bits)) & 31];
  return output;
}

/** 160-bit random secret, base32-encoded. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

interface TotpOptions {
  /** Override the counter step (tests / window scanning). */
  step?: number;
  /** Unix time in seconds; defaults to now. */
  atSeconds?: number;
}

export function generateTotp(secret: string, options: TotpOptions = {}): string {
  const atSeconds = options.atSeconds ?? Math.floor(Date.now() / 1000);
  const step = options.step ?? Math.floor(atSeconds / TOTP_STEP_SECONDS);
  const key = base32Decode(secret);
  if (key.length === 0) throw new Error('TOTP secret decodes to zero bytes');

  const counter = Buffer.alloc(8);
  counter.writeBigInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * Verifies a 6-digit token within ±`window` steps of now, in constant time
 * per candidate. Malformed tokens are rejected before any crypto work.
 */
export function verifyTotp(
  secret: string,
  token: string,
  options: { window?: number; atSeconds?: number } = {}
): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const window = options.window ?? 1;
  const atSeconds = options.atSeconds ?? Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(atSeconds / TOTP_STEP_SECONDS);

  const tokenBuffer = Buffer.from(token, 'utf8');
  let matched = false;
  for (let offset = -window; offset <= window; offset++) {
    const candidate = Buffer.from(generateTotp(secret, { step: currentStep + offset }), 'utf8');
    // No early exit: every candidate is compared to keep timing uniform.
    if (crypto.timingSafeEqual(candidate, tokenBuffer)) matched = true;
  }
  return matched;
}

export function buildOtpauthUrl(email: string, secret: string, issuer = 'AfterDark'): string {
  const label = `${issuer}:${email}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}
