import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { GET, POST } from '../route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';

const SESSION = { user: { id: 'u1', email: 'u1@example.com', name: 'U One' } };

function post(body: unknown, ip = '1.1.1.1'): Request {
  return new Request('http://test.local/api/user/role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

function executedSql(): string[] {
  return mocks.sql.mock.calls.map(([first]) =>
    Array.isArray(first) ? (first as string[]).join('') : String(first)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getRateLimiter('user-role', { windowMs: 1, max: 1 }).reset();
  mocks.getSession.mockResolvedValue(SESSION);
  // requireSession verifies the account still exists (see auth-guard).
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    return text.includes('SELECT role FROM "user"') ? [{ role: null }] : [];
  });
});

describe('POST /api/user/role', () => {
  it('rejects unauthenticated callers with 401 and touches nothing', async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await POST(post({ role: 'TALENT' }), {});
    expect(res.status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('REJECTS ADMIN self-assignment with 400 and never writes (escalation regression)', async () => {
    const res = await POST(post({ role: 'ADMIN' }), {});
    expect(res.status).toBe(400);
    expect(executedSql().some((text) => text.includes('UPDATE "user"'))).toBe(false);
  });

  it.each(['admin', 'Admin', 'SUPERUSER', '', null, 42, ['ADMIN']])(
    'rejects invalid role %j with 400',
    async (role) => {
      const res = await POST(post({ role }), {});
      expect(res.status).toBe(400);
      expect(executedSql().some((text) => text.includes('UPDATE "user"'))).toBe(false);
    }
  );

  it('sets TALENT, creates the profile, and audits', async () => {
    const res = await POST(post({ role: 'TALENT', stageName: 'DJ X', neighborhood: 'Bushwick' }), {});
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, role: 'TALENT' });
    const texts = executedSql();
    expect(texts.some((t) => t.includes('UPDATE "user"') && t.includes('SET role ='))).toBe(true);
    expect(texts.some((t) => t.includes('INSERT INTO talent_profiles'))).toBe(true);
    expect(texts.some((t) => t.includes('INSERT INTO audit_logs'))).toBe(true);
  });

  it('sets VENUE and upserts the venue profile when one already exists', async () => {
    mocks.sql.mockImplementation(async (first: unknown) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      if (text.includes('SELECT role FROM "user"')) return [{ role: null }];
      if (text.includes('SELECT id FROM venue_profiles')) return [{ id: 'vp1' }];
      return [];
    });
    const res = await POST(post({ role: 'VENUE', venueName: 'Nebula' }), {});
    expect(res.status).toBe(200);
    const texts = executedSql();
    expect(texts.some((t) => t.includes('UPDATE venue_profiles'))).toBe(true);
    expect(texts.some((t) => t.includes('INSERT INTO venue_profiles'))).toBe(false);
  });

  it('sets PARTY without creating any marketplace profile', async () => {
    const res = await POST(post({ role: 'PARTY' }), {});
    expect(res.status).toBe(200);
    const texts = executedSql();
    expect(texts.some((t) => t.includes('talent_profiles'))).toBe(false);
    expect(texts.some((t) => t.includes('venue_profiles'))).toBe(false);
  });

  it('rate-limits repeated role changes with 429 + Retry-After', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await POST(post({ role: 'TALENT' }), {})).status).toBe(200);
    }
    const blocked = await POST(post({ role: 'VENUE' }), {});
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('rejects malformed JSON with 400, not 500', async () => {
    const res = await POST(
      new Request('http://test.local/api/user/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{oops',
      }),
      {}
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/user/role', () => {
  it('returns the caller row', async () => {
    mocks.sql.mockResolvedValue([{ id: 'u1', name: 'U', email: 'u1@example.com', role: 'TALENT' }]);
    const res = await GET(new Request('http://test.local/api/user/role'), {});
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: { id: 'u1', name: 'U', email: 'u1@example.com', role: 'TALENT' },
    });
  });

  it('401 when signed out', async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await GET(new Request('http://test.local/api/user/role'), {});
    expect(res.status).toBe(401);
  });
});
