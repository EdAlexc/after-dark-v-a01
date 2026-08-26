/**
 * /api/venue/saved-talent (S20 F4) — the venue user's private bookmark list.
 * AuthZ outcomes per actor ride the generated matrix suite; this file covers
 * the owner scoping, the no-user-id projection, the idempotent PUT toggle,
 * and the SQLi-regression guarantee that ids ride as parameters.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), sql: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => {
  const fn = mocks.sql as unknown as Record<string, unknown>;
  // Neon's transaction API (used via withRlsContext, S2): array of
  // already-pending queries → array of results.
  fn.transaction = async (queries: Promise<unknown>[]) => Promise.all(queries);
  return { default: mocks.sql };
});

import { GET as listSaved, PUT as putSaved } from '../route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';

const VENUE_USER_ID = 'venue-user';
const TALENT_ID = '4b4b1c2e-8f6a-4f7e-9d2a-1234567890ab';
const SESSION = { user: { id: VENUE_USER_ID, email: 'v@example.com', name: 'V' } };

interface DbState {
  role?: string;
  savedRows?: Array<Record<string, unknown>>;
  /** Rows for the PUT existence check against talent_profiles. */
  listedRows?: Array<{ id: string }>;
}

function wire({ role = 'VENUE', savedRows = [], listedRows = [{ id: TALENT_ID }] }: DbState = {}) {
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) return [{ role }];
    if (text.includes('FROM saved_talent st')) return savedRows;
    if (text.includes('FROM talent_profiles')) return listedRows;
    return [];
  });
}

/** All recorded sql calls as (text, params) pairs. */
function calls(): Array<{ text: string; params: unknown[] }> {
  return mocks.sql.mock.calls.map((call) => {
    const [first, ...params] = call as [unknown, ...unknown[]];
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    return { text, params };
  });
}

function findCall(fragment: string): { text: string; params: unknown[] } | undefined {
  return calls().find((call) => call.text.includes(fragment));
}

function put(body: unknown): Request {
  return new Request('http://test.local/api/venue/saved-talent', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.7' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(SESSION);
  getRateLimiter('saved-talent-write', { windowMs: 1, max: 1000 }).reset();
});

describe('GET /api/venue/saved-talent', () => {
  it('returns the joined rows, scoped to the session user (never a client id)', async () => {
    wire({
      savedRows: [
        { id: TALENT_ID, stage_name: 'DJ Nova', primary_role: 'DJ', saved_at: '2026-08-01' },
      ],
    });
    const res = await listSaved(new Request('http://test.local/api/venue/saved-talent'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.savedTalent).toHaveLength(1);
    expect(body.savedTalent[0].stage_name).toBe('DJ Nova');

    const listCall = findCall('FROM saved_talent st');
    expect(listCall).toBeDefined();
    expect(listCall!.text).toContain('st.venue_user_id =');
    // The scoping value is the SESSION user id, parameterized.
    expect(listCall!.params).toContain(VENUE_USER_ID);
  });

  it("never selects the talent's auth user id (outreach resolves it server-side)", async () => {
    wire();
    await listSaved(new Request('http://test.local/api/venue/saved-talent'), {});
    const listCall = findCall('FROM saved_talent st');
    expect(listCall).toBeDefined();
    expect(listCall!.text).not.toContain('tp.user_id');
    // Public directory columns only — spot-check the projection.
    expect(listCall!.text).toContain('tp.stage_name');
  });
});

describe('PUT /api/venue/saved-talent', () => {
  it('save=true inserts with ON CONFLICT DO NOTHING and replays idempotently', async () => {
    wire();
    const first = await putSaved(put({ talent_id: TALENT_ID, saved: true }), {});
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ talent_id: TALENT_ID, saved: true });

    const insert = findCall('INSERT INTO saved_talent');
    expect(insert).toBeDefined();
    expect(insert!.text).toContain('ON CONFLICT (venue_user_id, talent_id) DO NOTHING');
    expect(insert!.params).toContain(VENUE_USER_ID);
    expect(insert!.params).toContain(TALENT_ID);

    // Replay: the row already exists — still 200, still the same shape.
    const replay = await putSaved(put({ talent_id: TALENT_ID, saved: true }), {});
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ talent_id: TALENT_ID, saved: true });
  });

  it('404s a save of an unknown or unlisted talent, before any INSERT', async () => {
    wire({ listedRows: [] });
    const res = await putSaved(put({ talent_id: TALENT_ID, saved: true }), {});
    expect(res.status).toBe(404);
    expect(findCall('INSERT INTO saved_talent')).toBeUndefined();
  });

  it('save=false issues a DELETE scoped to the session user and that talent', async () => {
    wire();
    const res = await putSaved(put({ talent_id: TALENT_ID, saved: false }), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ talent_id: TALENT_ID, saved: false });

    const del = findCall('DELETE FROM saved_talent');
    expect(del).toBeDefined();
    expect(del!.text).toContain('venue_user_id =');
    expect(del!.params).toContain(VENUE_USER_ID);
    expect(del!.params).toContain(TALENT_ID);
    // Unsave never needs the existence probe or an INSERT.
    expect(findCall('FROM talent_profiles')).toBeUndefined();
    expect(findCall('INSERT INTO saved_talent')).toBeUndefined();
  });

  it('rejects extra body keys (strictObject) and non-uuid talent ids with 400', async () => {
    wire();
    const extra = await putSaved(
      put({ talent_id: TALENT_ID, saved: true, role: 'ADMIN' }),
      {}
    );
    expect(extra.status).toBe(400);

    const nonUuid = await putSaved(put({ talent_id: 'not-a-uuid', saved: true }), {});
    expect(nonUuid.status).toBe(400);

    // Neither invalid body reached saved_talent.
    expect(findCall('INSERT INTO saved_talent')).toBeUndefined();
    expect(findCall('DELETE FROM saved_talent')).toBeUndefined();
  });

  it('parameterizes the talent id instead of interpolating it (SQLi regression)', async () => {
    wire();
    await putSaved(put({ talent_id: TALENT_ID, saved: true }), {});
    for (const fragment of ['FROM talent_profiles', 'INSERT INTO saved_talent']) {
      const call = findCall(fragment);
      expect(call).toBeDefined();
      expect(call!.text).not.toContain(TALENT_ID);
      expect(call!.params).toContain(TALENT_ID);
    }
  });
});
