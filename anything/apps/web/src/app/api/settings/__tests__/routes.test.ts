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
import { getRateLimiter } from '@/app/api/utils/rate-limit';

const SESSION = { user: { id: 'u1', email: 'u1@example.com', name: 'U One' } };

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
  getRateLimiter('change-password', { windowMs: 1, max: 1 }).reset();
  mocks.getSession.mockResolvedValue(SESSION);
  // requireSession verifies the account still exists, so the role lookup must
  // return a row; `[]` now means "deleted account" → 401.
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    return text.includes('SELECT role, suspended_at') ? [{ role: 'TALENT' }] : [];
  });
});

describe('GET/PUT /api/settings', () => {
  it('GET 401 signed out, and 401 (not 404) when the account row is gone', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await settingsGet(jsonRequest('http://t.local/api/settings', 'GET'), {})).status).toBe(
      401
    );
    // A valid cookie for a deleted account is signed out by the guard before the
    // route runs — it is an authentication failure, not a missing resource.
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.sql.mockResolvedValue([]);
    expect((await settingsGet(jsonRequest('http://t.local/api/settings', 'GET'), {})).status).toBe(
      401
    );
  });

  it('GET exposes twoFactorEnabled (plugin column) but never 2FA secrets', async () => {
    mocks.sql.mockResolvedValue([{ id: 'u1', twoFactorEnabled: true }]);
    const res = await settingsGet(jsonRequest('http://t.local/api/settings', 'GET'), {});
    expect(res.status).toBe(200);
    const select = executedSql().find((call) => call.text.includes('FROM "user"') &&
      call.text.includes('recovery_email'))!.text;
    expect(select).toContain('"twoFactorEnabled"');
    expect(select).not.toContain('secret');
    expect(select).not.toContain('backupCodes');
  });

  it('PUT updates whitelisted fields only and audits with keys, not values', async () => {
    mocks.sql.mockResolvedValue([{ id: 'u1', name: 'New Name' }]);
    const res = await settingsPut(
      jsonRequest('http://t.local/api/settings', 'PUT', {
        name: 'New Name',
        recovery_email: 'safe@example.com',
        role: 'ADMIN', // must be stripped — not a settings field
        twoFactorEnabled: true, // must be stripped — plugin-managed, read-only here
      }),
      {}
    );
    expect(res.status).toBe(200);
    const update = executedSql().find((call) => call.text.includes('UPDATE "user"'))!;
    const setClause = update.text.slice(0, update.text.indexOf(' WHERE '));
    expect(setClause).not.toContain('role');
    expect(setClause).not.toContain('twoFactorEnabled');
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
