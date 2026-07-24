import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { GET, PUT } from '../route';

const SESSION = { user: { id: 'talent-1', email: 't@example.com', name: 'T' } };

function put(body: unknown): Request {
  return new Request('http://t.local/api/talent/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function sqlWithRole(role: string | null, hasProfile = false) {
  mocks.sql.mockImplementation(async (first: unknown, ...rest: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role FROM "user"')) return role ? [{ role }] : [];
    if (text.includes('SELECT id FROM talent_profiles')) return hasProfile ? [{ id: 'tp1' }] : [];
    if (text.startsWith('UPDATE "talent_profiles"')) {
      return [{ id: 'tp1', ...(rest[0] ? {} : {}) }];
    }
    if (text.includes('INSERT INTO talent_profiles')) return [{ id: 'tp1' }];
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(SESSION);
  sqlWithRole('TALENT');
});

describe('GET /api/talent/profile', () => {
  it('401 signed out; null profile when none exists', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(new Request('http://t.local'), {})).status).toBe(401);

    mocks.getSession.mockResolvedValue(SESSION);
    mocks.sql.mockResolvedValue([]);
    const res = await GET(new Request('http://t.local'), {});
    await expect(res.json()).resolves.toEqual({ profile: null });
  });
});

describe('PUT /api/talent/profile', () => {
  it('403 for VENUE and PARTY roles (authZ matrix)', async () => {
    sqlWithRole('VENUE');
    expect((await PUT(put({ stage_name: 'X' }), {})).status).toBe(403);
    sqlWithRole('PARTY');
    expect((await PUT(put({ stage_name: 'X' }), {})).status).toBe(403);
  });

  it('inserts a new profile with server-computed completion pct', async () => {
    sqlWithRole('TALENT', false);
    const res = await PUT(
      put({ stage_name: 'DJ Echo', bio: 'NYC underground', profile_completion_pct: 100 }),
      {}
    );
    expect(res.status).toBe(200);
    const insert = mocks.sql.mock.calls.find(([first]) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      return text.includes('INSERT INTO talent_profiles');
    })!;
    // 2 of 9 segments filled → 22%; the client's fake 100 is ignored.
    expect(insert.slice(1)).toContain(22);
    expect(insert.slice(1)).not.toContain(100);
  });

  it('updates an existing profile through the shared builder (parameterized)', async () => {
    sqlWithRole('TALENT', true);
    const res = await PUT(put({ stage_name: "Robert'); DROP TABLE talent_profiles;--" }), {});
    expect(res.status).toBe(200);
    const update = mocks.sql.mock.calls.find(([first]) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      return text.startsWith('UPDATE "talent_profiles"');
    })!;
    const [text, values] = update as [string, unknown[]];
    expect(text).not.toContain('DROP TABLE');
    expect(values).toContain("Robert'); DROP TABLE talent_profiles;--");
    expect(values[values.length - 1]).toBe('talent-1'); // scoped to session user
  });

  it('rejects a 501-char bio and >5 portfolio images (wireframe caps)', async () => {
    expect((await PUT(put({ bio: 'x'.repeat(501) }), {})).status).toBe(400);
    expect((await PUT(put({ portfolio_images: Array(6).fill('img') }), {})).status).toBe(400);
  });

  it('audits with changed-field names only', async () => {
    sqlWithRole('TALENT', true);
    await PUT(put({ pronouns: 'they/them' }), {});
    const audit = mocks.sql.mock.calls.find(([first]) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      return text.includes('INSERT INTO audit_logs');
    })!;
    const metadata = JSON.parse(audit[5] as string);
    expect(metadata.changed).toEqual(['pronouns']);
    expect(JSON.stringify(metadata)).not.toContain('they/them');
  });
});
