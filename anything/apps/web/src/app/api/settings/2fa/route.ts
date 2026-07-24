import crypto from 'crypto';
import sql from '@/app/api/utils/sql';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// ─── TOTP helpers ─────────────────────────────────────────────────────────────

const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(str: string): Buffer {
  const s = str.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of s) {
    const idx = B32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
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

function generateTOTP(secret: string, step?: number): string {
  const t = step ?? Math.floor(Date.now() / 1000 / 30);
  const key = base32Decode(secret);
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeBigInt64BE(BigInt(t));
  const hmac = crypto.createHmac('sha1', key).update(timeBuf).digest();
  const offset = hmac[19] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

function verifyTOTP(secret: string, token: string): boolean {
  const now = Math.floor(Date.now() / 1000 / 30);
  for (let i = -1; i <= 1; i++) {
    if (generateTOTP(secret, now + i) === token) return true;
  }
  return false;
}

function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/settings/2fa — returns 2FA status + fresh secret (for setup)
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT totp_enabled, totp_secret FROM "user" WHERE id = ${session.user.id} LIMIT 1
  `;
  const user = rows[0];
  const secret = user?.totp_secret || generateSecret();

  const otpauthUrl = `otpauth://totp/AfterDark:${encodeURIComponent(session.user.email)}?secret=${secret}&issuer=AfterDark`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;

  return Response.json({
    enabled: user?.totp_enabled ?? false,
    secret,
    qrUrl,
  });
}

// POST /api/settings/2fa — enable or disable 2FA
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { action, secret, token } = body;

    if (action === 'enable') {
      if (!secret || !token) {
        return Response.json({ error: 'Secret and token are required' }, { status: 400 });
      }
      if (!verifyTOTP(secret, String(token))) {
        return Response.json({ error: 'Invalid verification code' }, { status: 400 });
      }
      await sql`
        UPDATE "user"
        SET totp_secret = ${secret}, totp_enabled = true
        WHERE id = ${session.user.id}
      `;
      return Response.json({ success: true, enabled: true });
    }

    if (action === 'disable') {
      if (!token) {
        return Response.json(
          { error: 'Verification code required to disable 2FA' },
          { status: 400 }
        );
      }
      const rows = await sql`
        SELECT totp_secret FROM "user" WHERE id = ${session.user.id} LIMIT 1
      `;
      const storedSecret = rows[0]?.totp_secret;
      if (!storedSecret || !verifyTOTP(storedSecret, String(token))) {
        return Response.json({ error: 'Invalid verification code' }, { status: 400 });
      }
      await sql`
        UPDATE "user" SET totp_secret = null, totp_enabled = false WHERE id = ${session.user.id}
      `;
      return Response.json({ success: true, enabled: false });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('2FA error:', error);
    return Response.json({ error: 'Failed to update 2FA' }, { status: 500 });
  }
}
