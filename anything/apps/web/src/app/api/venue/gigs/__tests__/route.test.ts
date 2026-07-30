import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { GET } from '../route';

const SESSION = { user: { id: 'venue-user', email: 'v@example.com', name: 'V' } };

function wireSql(role: string | null, venueProfile: boolean, gigs: unknown[] = []) {
  mocks.sql.mockImplementation(async (first: unknown, ..._rest: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role FROM "user"')) return [{ role }];
    if (text.includes('SELECT id FROM venue_profiles')) return venueProfile ? [{ id: 'vp-1' }] : [];
    if (text.includes('FROM gigs')) return gigs;
    return [];
  });
}

const request = new Request('http://test.local/api/venue/gigs');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(SESSION);
});

describe('GET /api/venue/gigs', () => {
  it('401s anonymous callers', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(request, {})).status).toBe(401);
  });

  it('403s talent (authZ matrix)', async () => {
    wireSql('TALENT', true);
    expect((await GET(request, {})).status).toBe(403);
  });

  it('scopes the query to the session venue — client cannot pick a venue id', async () => {
    wireSql('VENUE', true, [{ id: 'g-1', status: 'DRAFT', title: 'Test' }]);
    const res = await GET(new Request('http://test.local/api/venue/gigs?venue_id=someone-else'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gigs).toHaveLength(1);
    // The venue lookup ran off the session user id, not the query string.
    const profileCall = mocks.sql.mock.calls.find((call) => {
      const text = Array.isArray(call[0]) ? (call[0] as string[]).join('') : String(call[0]);
      return text.includes('venue_profiles');
    });
    expect(profileCall).toBeDefined();
    expect(JSON.stringify(profileCall)).toContain('venue-user');
    expect(JSON.stringify(mocks.sql.mock.calls)).not.toContain('someone-else');
  });

  it('returns an empty list (not an error) when the venue has no profile yet', async () => {
    wireSql('VENUE', false);
    const res = await GET(request, {});
    expect(res.status).toBe(200);
    expect((await res.json()).gigs).toEqual([]);
  });
});
