import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  changePassword: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mocks.getSession, changePassword: mocks.changePassword } },
}));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { GET as settingsGet, PUT as settingsPut } from '../route';
import { POST as changePassword } from '../change-password/route';
import { GET as twoFaGet, POST as twoFaPost } from '../2fa/route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';
import { SecretBox } from '@/app/api/utils/crypto-box';
import { generateTotp, generateTotpSecret } from '@/app/api/utils/totp';

const SESSION = { user: { id: 'u1', email: 'u1@example.com', name: 'U One' } };
const ENC_KEY = 'unit-test-encryption-key-material';

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function executedSql(): Array<{ text: string; values: unknown[] }> {
  return mocks.sql.mock.calls.map(([first, ...rest]) => {
    if (Array.isArray(first)) return { text: (first as string[]).join(''), values: rest };
    return { text: String(first), values: (rest[0] as unknown[]) ?? [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  for (const name of ['change-password', '2fa-status', '2fa-verify']) {
    getRateLimiter(name, { windowMs: 1, max: 1 }).reset();
  }
  mocks.getSession.mockResolvedValue(SESSION);
  mocks.sql.mockResolvedValue([]);
  vi.stubEnv('AUTH_SECRET_ENCRYPTION_KEY', ENC_KEY);
});

describe('GET/PUT /api/settings', () => {
  it('GET 401 signed out; 404 when user row is missing', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await settingsGet(jsonRequest('http://t.local/api/settings', 'GET'), {})).status).toBe(
      401
    );
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.sql.mockResolvedValue([]);
    expect((await settingsGet(jsonRequest('http://t.local/api/settings', 'GET'), {})).status).toBe(
      404
    );
  });

  it('PUT updates whitelisted fields only and audits with keys, not values', async () => {
    mocks.sql.mockResolvedValue([{ id: 'u1', name: 'New Name' }]);
    const res = await settingsPut(
      jsonRequest('http://t.local/api/settings', 'PUT', {
        name: 'New Name',
        recovery_email: 'safe@example.com',
        role: 'ADMIN', // must be stripped — not a settings field
        totp_enabled: true, // must be stripped
      }),
      {}
    );
    expect(res.status).toBe(200);
    const update = executedSql().find((call) => call.text.includes('UPDATE "user"'))!;
    const setClause = update.text.slice(0, update.text.indexOf(' WHERE '));
    expect(setClause).not.toContain('role');
    expect(setClause).not.toContain('totp_enabled');
    const audit = executedSql().find((call) => call.text.includes('INSERT INTO audit_logs'))!;
    const metadata = JSON.parse(audit.values[4] as string);
    expect(metadata.changed).toEqual(['name', 'recovery_email']);
    expect(JSON.stringify(metadata)).not.toContain('safe@example.com');
  });

  it('PUT rejects invalid email/phone and empty bodies', async () => {
    expect(
      (
        await settingsPut(
          jsonRequest('http://t.local/api/settings', 'PUT', { recovery_email: 'nope' }),
          {}
        )
      ).status
    ).toBe(400);
    expect(
      (
        await settingsPut(
          jsonRequest('http://t.local/api/settings', 'PUT', { phone: 'call me maybe' }),
          {}
        )
      ).status
    ).toBe(400);
    expect(
      (await settingsPut(jsonRequest('http://t.local/api/settings', 'PUT', {}), {})).status
    ).toBe(400);
  });
});

describe('POST /api/settings/change-password', () => {
  const good = { currentPassword: 'old-password-1', newPassword: 'new-password-2' };

  it('changes the password via better-auth and audits', async () => {
    mocks.changePassword.mockResolvedValue({ ok: true });
    const res = await changePassword(
      jsonRequest('http://t.local/api/settings/change-password', 'POST', good),
      {}
    );
    expect(res.status).toBe(200);
    expect(mocks.changePassword).toHaveBeenCalledOnce();
    expect(executedSql().some((call) => call.text.includes('INSERT INTO audit_logs'))).toBe(true);
  });

  it('maps better-auth failures to a generic 400 (no oracle)', async () => {
    mocks.changePassword.mockRejectedValue(new Error('INVALID_PASSWORD: detail leak'));
    const res = await changePassword(
      jsonRequest('http://t.local/api/settings/change-password', 'POST', good),
      {}
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toContain('detail leak');
  });

  it('rejects short and unchanged passwords before touching better-auth', async () => {
    const short = { currentPassword: 'old-password-1', newPassword: 'short' };
    const same = { currentPassword: 'same-password-9', newPassword: 'same-password-9' };
    for (const body of [short, same]) {
      const res = await changePassword(
        jsonRequest('http://t.local/api/settings/change-password', 'POST', body),
        {}
      );
      expect(res.status).toBe(400);
    }
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it('rate-limits after 5 attempts (brute-force guard)', async () => {
    mocks.changePassword.mockRejectedValue(new Error('wrong'));
    for (let i = 0; i < 5; i++) {
      await changePassword(
        jsonRequest('http://t.local/api/settings/change-password', 'POST', good),
        {}
      );
    }
    const res = await changePassword(
      jsonRequest('http://t.local/api/settings/change-password', 'POST', good),
      {}
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('GET /api/settings/2fa', () => {
  it('when not enrolled: fresh secret + locally generated data-URL QR', async () => {
    mocks.sql.mockResolvedValue([{ totp_enabled: false }]);
    const res = await twoFaGet(jsonRequest('http://t.local/api/settings/2fa', 'GET'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(body.qrUrl.startsWith('data:image/png;base64,')).toBe(true); // no third-party QR service
  });

  it('when enrolled: returns status ONLY — never the secret (clone-prevention)', async () => {
    mocks.sql.mockResolvedValue([{ totp_enabled: true, totp_secret: 'v1.whatever' }]);
    const res = await twoFaGet(jsonRequest('http://t.local/api/settings/2fa', 'GET'), {});
    const body = await res.json();
    expect(body).toEqual({ enabled: true });
  });
});

describe('POST /api/settings/2fa', () => {
  it('enable: verifies the live token and stores the secret ENCRYPTED', async () => {
    const secret = generateTotpSecret();
    const token = generateTotp(secret);
    const res = await twoFaPost(
      jsonRequest('http://t.local/api/settings/2fa', 'POST', { action: 'enable', secret, token }),
      {}
    );
    expect(res.status).toBe(200);
    const update = executedSql().find((call) => call.text.includes('SET totp_secret ='))!;
    const stored = update.values[0] as string;
    expect(stored).not.toBe(secret); // never plaintext
    expect(SecretBox.isEncrypted(stored)).toBe(true);
    expect(new SecretBox(ENC_KEY).decrypt(stored)).toBe(secret); // round-trips
  });

  it('enable: rejects a wrong token with 400 and writes nothing', async () => {
    const res = await twoFaPost(
      jsonRequest('http://t.local/api/settings/2fa', 'POST', {
        action: 'enable',
        secret: generateTotpSecret(),
        token: '000000',
      }),
      {}
    );
    expect(res.status).toBe(400);
    expect(executedSql().some((call) => call.text.includes('SET totp_secret ='))).toBe(false);
  });

  it('disable: verifies against the decrypted stored secret', async () => {
    const secret = generateTotpSecret();
    const encrypted = new SecretBox(ENC_KEY).encrypt(secret);
    mocks.sql.mockImplementation(async (first: unknown) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      if (text.includes('SELECT totp_secret')) return [{ totp_secret: encrypted }];
      return [];
    });
    const res = await twoFaPost(
      jsonRequest('http://t.local/api/settings/2fa', 'POST', {
        action: 'disable',
        token: generateTotp(secret),
      }),
      {}
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, enabled: false });
  });

  it('disable: still verifies legacy plaintext rows (migration path)', async () => {
    const secret = generateTotpSecret();
    mocks.sql.mockImplementation(async (first: unknown) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      if (text.includes('SELECT totp_secret')) return [{ totp_secret: secret }];
      return [];
    });
    const res = await twoFaPost(
      jsonRequest('http://t.local/api/settings/2fa', 'POST', {
        action: 'disable',
        token: generateTotp(secret),
      }),
      {}
    );
    expect(res.status).toBe(200);
  });

  it('fails closed (500, no write) when the encryption key is not configured', async () => {
    vi.stubEnv('AUTH_SECRET_ENCRYPTION_KEY', '');
    const secret = generateTotpSecret();
    const res = await twoFaPost(
      jsonRequest('http://t.local/api/settings/2fa', 'POST', {
        action: 'enable',
        secret,
        token: generateTotp(secret),
      }),
      {}
    );
    expect(res.status).toBe(500);
    expect(executedSql().some((call) => call.text.includes('SET totp_secret ='))).toBe(false);
  });

  it('rejects malformed actions/tokens via schema', async () => {
    for (const body of [
      { action: 'reset', token: '123456' },
      { action: 'enable', secret: 'not-base32!!', token: '123456' },
      { action: 'disable', token: '12345' },
      {},
    ]) {
      const res = await twoFaPost(jsonRequest('http://t.local/api/settings/2fa', 'POST', body), {});
      expect(res.status).toBe(400);
    }
  });

  it('rate-limits verification attempts (guessing guard)', async () => {
    const secret = generateTotpSecret();
    for (let i = 0; i < 5; i++) {
      await twoFaPost(
        jsonRequest('http://t.local/api/settings/2fa', 'POST', {
          action: 'enable',
          secret,
          token: '111111',
        }),
        {}
      );
    }
    const res = await twoFaPost(
      jsonRequest('http://t.local/api/settings/2fa', 'POST', {
        action: 'enable',
        secret,
        token: '111111',
      }),
      {}
    );
    expect(res.status).toBe(429);
  });
});
