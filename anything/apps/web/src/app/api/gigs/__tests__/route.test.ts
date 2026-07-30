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

const SESSION = { user: { id: 'venue-user', email: 'v@example.com', name: 'V' } };

const VALID_GIG = {
  title: 'Saturday Deep House',
  role_needed: 'Headliner DJ',
  description: 'Peak time set',
  start_time: '2026-08-01T22:00:00',
  end_time: '2026-08-02T04:00:00',
  base_rate: 450,
  tips_included: true,
  status: 'PUBLISHED',
};

function post(body: unknown): Request {
  return new Request('http://test.local/api/gigs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function sqlWithRole(role: string | null, extra?: (text: string) => unknown[] | undefined) {
  mocks.sql.mockImplementation(async (first: unknown, ..._rest: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role FROM "user"')) return [{ role }];
    if (text.includes('SELECT id FROM venue_profiles')) return [{ id: 'vp-1' }];
    if (text.includes('INSERT INTO gigs')) return [{ id: 'g-1', status: 'PUBLISHED' }];
    return extra?.(text) ?? [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getRateLimiter('gigs-create', { windowMs: 1, max: 1 }).reset();
  mocks.getSession.mockResolvedValue(SESSION);
  sqlWithRole('VENUE');
});

describe('GET /api/gigs (public listing)', () => {
  it('serves only PUBLISHED gigs even when a status filter is smuggled in', async () => {
    const res = await GET(
      new Request('http://test.local/api/gigs?status=DRAFT&neighborhood=Bushwick'),
      {}
    );
    expect(res.status).toBe(200);
    const [text, values] = mocks.sql.mock.calls[0] as [string, unknown[]];
    expect(text).toContain('g.status = $1');
    expect(values[0]).toBe('PUBLISHED');
    expect(JSON.stringify(values)).not.toContain('DRAFT');
  });

  it('parameterizes SQLi payloads instead of interpolating them', async () => {
    const payload = "x'; DROP TABLE gigs; --";
    const res = await GET(
      new Request(`http://test.local/api/gigs?role=${encodeURIComponent(payload)}`),
      {}
    );
    expect(res.status).toBe(200);
    const [text, values] = mocks.sql.mock.calls[0] as [string, unknown[]];
    expect(text).not.toContain(payload);
    expect(values).toContain(`%${payload}%`);
  });

  it('rejects invalid filters with 400 (minRate > maxRate)', async () => {
    const res = await GET(new Request('http://test.local/api/gigs?minRate=300&maxRate=10'), {});
    expect(res.status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('works with no filters and requires no auth', async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await GET(new Request('http://test.local/api/gigs'), {});
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      gigs: [],
      page: 1,
      pageSize: 12,
      hasMore: false,
    });
  });
});

describe('POST /api/gigs (venue-only create)', () => {
  it('401 when signed out', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(post(VALID_GIG), {})).status).toBe(401);
  });

  it('403 when a TALENT tries to post a gig (authZ matrix)', async () => {
    sqlWithRole('TALENT');
    const res = await POST(post(VALID_GIG), {});
    expect(res.status).toBe(403);
    expect(mocks.sql.mock.calls.every(([first]) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      return !text.includes('INSERT INTO gigs');
    })).toBe(true);
  });

  it('403 when the user has no role yet; PARTY also denied', async () => {
    sqlWithRole(null);
    expect((await POST(post(VALID_GIG), {})).status).toBe(403);
    sqlWithRole('PARTY');
    expect((await POST(post(VALID_GIG), {})).status).toBe(403);
  });

  it('ADMIN may create (passes every gate)', async () => {
    sqlWithRole('ADMIN');
    expect((await POST(post(VALID_GIG), {})).status).toBe(201);
  });

  it('creates for the session venue and audits; venue id comes from DB, not body', async () => {
    const res = await POST(post({ ...VALID_GIG, venue_id: 'spoofed-venue' }), {});
    expect(res.status).toBe(201);
    const insert = mocks.sql.mock.calls.find(([first]) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      return text.includes('INSERT INTO gigs');
    })!;
    const values = insert.slice(1);
    expect(values).toContain('vp-1'); // derived venue id
    expect(values).not.toContain('spoofed-venue'); // schema stripped it
    const texts = mocks.sql.mock.calls.map(([first]) =>
      Array.isArray(first) ? (first as string[]).join('') : String(first)
    );
    expect(texts.some((t) => t.includes('INSERT INTO audit_logs'))).toBe(true);
  });

  it('400 when the venue user has no venue profile', async () => {
    mocks.sql.mockImplementation(async (first: unknown) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      if (text.includes('SELECT role FROM "user"')) return [{ role: 'VENUE' }];
      if (text.includes('SELECT id FROM venue_profiles')) return [];
      return [];
    });
    const res = await POST(post(VALID_GIG), {});
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'No venue profile found' });
  });

  it('accepts an incomplete draft but rejects an incomplete publish', async () => {
    const draft = { ...VALID_GIG, role_needed: '', status: 'DRAFT' };
    expect((await POST(post(draft), {})).status).toBe(201);
    const badPublish = { ...VALID_GIG, role_needed: '', status: 'PUBLISHED' };
    expect((await POST(post(badPublish), {})).status).toBe(400);
  });

  it('rejects negative and absurd rates', async () => {
    expect((await POST(post({ ...VALID_GIG, base_rate: -50 }), {})).status).toBe(400);
    expect((await POST(post({ ...VALID_GIG, base_rate: 10_000_000 }), {})).status).toBe(400);
  });
});
