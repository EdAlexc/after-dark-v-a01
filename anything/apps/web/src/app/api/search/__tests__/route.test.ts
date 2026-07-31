/**
 * /api/search (S5) — public FTS endpoint. AuthZ (public) is covered by the
 * generated matrix suite; this file covers validation, the type filter,
 * rate limiting, and that the term reaches SQL only as a parameter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { GET as searchGet } from '../route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';

function req(qs: string, ip = '198.51.100.7'): Request {
  return new Request(`http://t.local/api/search${qs}`, {
    headers: { 'x-forwarded-for': ip },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getRateLimiter('search', { windowMs: 60_000, max: 60 }).reset();
  mocks.sql.mockImplementation(async (text: string) => {
    if (String(text).includes('FROM gigs g')) return [{ id: 'g1', title: 'Deep House Night' }];
    if (String(text).includes('FROM talent_profiles')) return [{ id: 't1', stage_name: 'Kira' }];
    return [];
  });
});

describe('GET /api/search', () => {
  it('400 on a missing or too-short query', async () => {
    expect((await searchGet(req(''), {})).status).toBe(400);
    expect((await searchGet(req('?q=a'), {})).status).toBe(400);
  });

  it('returns both entity groups by default', async () => {
    const res = await searchGet(req('?q=deep house'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gigs).toHaveLength(1);
    expect(body.talent).toHaveLength(1);
  });

  it('type=gigs skips the talent query entirely (and vice versa)', async () => {
    const res = await searchGet(req('?q=deep&type=gigs'), {});
    const body = await res.json();
    expect(body.gigs).toHaveLength(1);
    expect(body.talent).toEqual([]);
    const texts = mocks.sql.mock.calls.map(([text]) => String(text));
    expect(texts.some((text) => text.includes('FROM talent_profiles'))).toBe(false);
  });

  it('passes the term as a parameter, never in the SQL text', async () => {
    const hostile = "kira'; DROP TABLE gigs; --";
    await searchGet(req(`?q=${encodeURIComponent(hostile)}`), {});
    for (const [text, values] of mocks.sql.mock.calls) {
      expect(String(text)).not.toContain(hostile);
      expect((values as unknown[])[0]).toBe(hostile);
    }
  });

  it('429s past the per-client limit, with Retry-After', async () => {
    for (let i = 0; i < 60; i++) {
      expect((await searchGet(req('?q=dj', '203.0.113.9'), {})).status).toBe(200);
    }
    const limited = await searchGet(req('?q=dj', '203.0.113.9'), {});
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
    // A different client is unaffected.
    expect((await searchGet(req('?q=dj', '203.0.113.10'), {})).status).toBe(200);
  });
});
