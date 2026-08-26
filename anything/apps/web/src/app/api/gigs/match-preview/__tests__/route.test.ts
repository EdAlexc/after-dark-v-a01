/**
 * /api/gigs/match-preview (S7, Q8) — the create-gig Live Analysis. AuthZ
 * rows live in the matrix suite; this file covers behavior: the response
 * shape (counts × candidates × pricing percentiles), server-computed match
 * scores, the privacy stance of the availability probe (the SECURITY
 * DEFINER function, never the availabilities table), param validation, and
 * the non-VENUE denial.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), sql: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => {
  const fn = mocks.sql as unknown as Record<string, unknown>;
  fn.transaction = async (queries: Promise<unknown>[]) => Promise.all(queries);
  return { default: mocks.sql };
});

import { GET } from '../route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';
import { MATCH_CANDIDATE_LIMIT } from '@/app/api/utils/match-query';

const SESSION = { user: { id: 'venue-user', email: 'v@example.com', name: 'V' } };

const CANDIDATES = [
  {
    id: 'tp-1',
    stage_name: 'DJ Nova',
    primary_role: 'DJ',
    neighborhood: 'Bushwick',
    avatar_url: null,
    hourly_rate_min: 150,
    hourly_rate_max: 300,
    profile_completion_pct: 80,
    available_tonight: false,
    available_on_date: true,
  },
  {
    id: 'tp-2',
    stage_name: 'Sable',
    primary_role: 'DJ / Producer',
    neighborhood: 'Lower East Side',
    avatar_url: null,
    hourly_rate_min: 400,
    hourly_rate_max: null,
    profile_completion_pct: null,
    available_tonight: true,
    available_on_date: false,
  },
];

function callText(call: unknown[]): string {
  return Array.isArray(call[0]) ? (call[0] as string[]).join('') : String(call[0]);
}

function wire({
  role = 'VENUE',
  counts = { total: 5, tonight: 2, on_date: 3 } as Record<string, unknown> | null,
  candidates = CANDIDATES as unknown[],
  pricing = { sample: 12, p25: 100, p50: 150, p75: 200 } as Record<string, unknown> | null,
} = {}) {
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) {
      return [{ role, suspended_at: null, suspended_reason: null }];
    }
    if (text.includes('AS total')) return counts ? [counts] : [];
    if (text.includes('SELECT id, stage_name')) return candidates;
    if (text.includes('PERCENTILE_CONT')) return pricing ? [pricing] : [];
    return [];
  });
}

function preview(params: string): Promise<Response> {
  return GET(new Request(`http://test.local/api/gigs/match-preview${params}`), {});
}

beforeEach(() => {
  vi.clearAllMocks();
  wire();
  mocks.getSession.mockResolvedValue(SESSION);
  getRateLimiter('match-preview', { windowMs: 1, max: 1 }).reset();
});

describe('GET /api/gigs/match-preview', () => {
  it('shapes counts, scored candidate cards, and the pricing hint', async () => {
    const res = await preview('?role=DJ&rate=200&date=2026-09-01');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.matches).toEqual({ total: 5, availableTonight: 2, availableOnDate: 3 });
    expect(body.pricing).toEqual({ sample: 12, p25: 100, median: 150, p75: 200 });

    // Server-computed, transparent scoring: role bar 60, +20 on-date OR +10
    // tonight, +10 rate-band overlap, +completion/10.
    expect(body.candidates).toHaveLength(2);
    expect(body.candidates[0]).toMatchObject({
      id: 'tp-1',
      stage_name: 'DJ Nova',
      match_score: 98, // 60 + 20 (on date) + 10 (150 ≤ 200 ≤ 300) + 8 (80%)
    });
    expect(body.candidates[1]).toMatchObject({
      id: 'tp-2',
      match_score: 70, // 60 + 10 (tonight); min ask 400 > 200 → no rate bonus
    });
  });

  it('reports availableOnDate as null when no gig date is set yet', async () => {
    const res = await preview('?role=DJ');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches.availableOnDate).toBeNull();
    expect(body.matches.total).toBe(5);
    // Without a rate the band bonus is off: 60 + 20 + 8 = 88.
    expect(body.candidates[0].match_score).toBe(88);
  });

  it('probes availability ONLY via the SECURITY DEFINER function — never the availabilities table', async () => {
    const res = await preview('?role=DJ&date=2026-09-01');
    expect(res.status).toBe(200);

    const texts = mocks.sql.mock.calls.map(callText);
    const countText = texts.find((text) => text.includes('AS total'));
    const candidatesText = texts.find((text) => text.includes('SELECT id, stage_name'));
    expect(countText).toContain('app_talent_available_on');
    expect(candidatesText).toContain('app_talent_available_on');
    // Slot details and notes stay in the talent's private calendar.
    for (const text of texts) {
      expect(text).not.toMatch(/FROM\s+availabilities/i);
    }
  });

  it('parameterizes the role pattern and bounds the candidate LIMIT server-side', async () => {
    await preview("?role=DJ%20'%3B%20DROP%20TABLE%20gigs%3B--&date=2026-09-01");
    const candidateCall = mocks.sql.mock.calls.find((call) =>
      callText(call).includes('SELECT id, stage_name')
    );
    expect(candidateCall).toBeDefined();
    const values = candidateCall![1] as unknown[];
    // Hostile input rides values, lowercased into a LIKE pattern — never text.
    expect(values).toContain("%dj '; drop table gigs;--%");
    expect(values).toContain('2026-09-01');
    expect(values).toContain(MATCH_CANDIDATE_LIMIT);
    expect(callText(candidateCall!)).not.toContain('DROP TABLE');
  });

  it('answers zeroed shapes from an empty database', async () => {
    wire({ counts: null, candidates: [], pricing: null });
    const res = await preview('?role=Mixologist');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toEqual({ total: 0, availableTonight: 0, availableOnDate: null });
    expect(body.candidates).toEqual([]);
    expect(body.pricing).toEqual({ sample: 0, p25: null, median: null, p75: null });
  });

  it('denies non-VENUE callers with 403', async () => {
    wire({ role: 'TALENT' });
    expect((await preview('?role=DJ')).status).toBe(403);
  });

  it('rejects invalid query params with 400', async () => {
    expect((await preview('')).status).toBe(400); // role required
    expect((await preview('?role=x')).status).toBe(400); // below the 2-char floor
    expect((await preview('?role=DJ&date=09/01/2026')).status).toBe(400); // not YYYY-MM-DD
    expect((await preview('?role=DJ&rate=abc')).status).toBe(400); // non-numeric rate
    const texts = mocks.sql.mock.calls.map(callText);
    expect(texts.some((text) => text.includes('AS total'))).toBe(false);
  });
});
