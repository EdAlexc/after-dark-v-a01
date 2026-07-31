/**
 * /api/venue/stats (S6) — KPI aggregates. AuthZ is covered by the matrix
 * suite; this file covers the tenant scoping and the response shape.
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

import { GET as statsGet } from '../route';

const SESSION = { user: { id: 'venue-user', email: 'v@example.com', name: 'V' } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(SESSION);
});

function wire({ hasVenue = true, kpiRow = null as Record<string, unknown> | null } = {}) {
  mocks.sql.mockImplementation(async (first: unknown, ...rest: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) return [{ role: 'VENUE' }];
    if (text.includes('venue_profiles')) return hasVenue ? [{ id: 'vp-1' }] : [];
    if (text.includes('FROM events')) {
      // The events query must be scoped to the caller's venue id.
      expect(rest).toContain('vp-1');
      return kpiRow ? [kpiRow] : [];
    }
    return [];
  });
}

describe('GET /api/venue/stats', () => {
  it('returns null stats before a venue profile exists', async () => {
    wire({ hasVenue: false });
    const res = await statsGet(new Request('http://t.local/api/venue/stats'), {});
    expect(res.status).toBe(200);
    expect((await res.json()).stats).toBeNull();
  });

  it('shapes the KPI response and coerces the hour average', async () => {
    wire({
      kpiRow: {
        avg_time_to_hire_hours: '36.5',
        published_30d: 4,
        filled_30d: 3,
        published_prev_30d: 5,
        filled_prev_30d: 2,
        applications_30d: 17,
        applications_prev_30d: 9,
      },
    });
    const res = await statsGet(new Request('http://t.local/api/venue/stats'), {});
    const { stats } = await res.json();
    expect(stats.avgTimeToHireHours).toBeCloseTo(36.5);
    expect(stats.window30d).toEqual({ published: 4, filled: 3, applications: 17 });
    expect(stats.previous30d).toEqual({ published: 5, filled: 2, applications: 9 });
  });

  it('reports null time-to-hire when no pair has closed yet', async () => {
    wire({
      kpiRow: {
        avg_time_to_hire_hours: null,
        published_30d: 2,
        filled_30d: 0,
        published_prev_30d: 0,
        filled_prev_30d: 0,
        applications_30d: 1,
        applications_prev_30d: 0,
      },
    });
    const res = await statsGet(new Request('http://t.local/api/venue/stats'), {});
    const { stats } = await res.json();
    expect(stats.avgTimeToHireHours).toBeNull();
    expect(stats.window30d.published).toBe(2);
  });
});
