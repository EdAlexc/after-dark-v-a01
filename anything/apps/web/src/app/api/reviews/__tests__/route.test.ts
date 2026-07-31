/**
 * /api/reviews (S8) — the write gates the matrix suite can't express:
 * post-checkout only, one per direction, server-derived direction,
 * server-side aggregation, and no reviewer ids in the public listing.
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

import { GET as reviewsGet, POST as reviewsPost } from '../route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';

const SHIFT_ID = '9c1d2e3f-4a5b-4c6d-8e7f-0123456789ab';
const VENUE_ID = '4b4b1c2e-8f6a-4f7e-9d2a-1234567890ab';
const TALENT_USER = { user: { id: 'talent-user', email: 't@example.com', name: 'T' } };

function post(body: unknown): Request {
  return new Request('http://t.local/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function executed(): string[] {
  return mocks.sql.mock.calls.map(([first]) =>
    Array.isArray(first) ? (first as string[]).join('') : String(first)
  );
}

function wire({
  role = 'TALENT',
  shiftStatus = 'CHECKED_OUT',
  callerSide = 'talent' as 'talent' | 'venue' | 'stranger',
  insertFails = null as string | null,
} = {}) {
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) return [{ role }];
    if (text.includes('FROM shifts review_shift')) {
      return [
        {
          id: SHIFT_ID,
          status: shiftStatus,
          talent_id: 'tp-1',
          venue_id: VENUE_ID,
          gig_title: 'Test Gig',
          venue_user_id: callerSide === 'venue' ? 'talent-user' : 'venue-user',
          talent_user_id: callerSide === 'talent' ? 'talent-user' : 'other-talent',
        },
      ];
    }
    if (text.includes('INSERT INTO reviews')) {
      if (insertFails) throw new Error(insertFails);
      return [{ id: 'rev-1', shift_id: SHIFT_ID, direction: 'X', rating: 5 }];
    }
    if (text.includes('AVG(rating)')) return [{ avg_rating: '4.50', review_count: 2 }];
    if (text.includes("status IN ('CHECKED_OUT', 'PAID')")) return [{ completed: 3 }];
    if (text.includes('profile_completion_pct FROM talent_profiles'))
      return [{ profile_completion_pct: 80 }];
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getRateLimiter('reviews-create', { windowMs: 1, max: 1000 }).reset();
  mocks.getSession.mockResolvedValue(TALENT_USER);
});

describe('POST /api/reviews', () => {
  it('400s before checkout — reviews open when the shift completes', async () => {
    wire({ shiftStatus: 'CHECKED_IN' });
    const res = await reviewsPost(post({ shift_id: SHIFT_ID, rating: 5 }), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('checked out');
  });

  it('derives direction from the caller side — client cannot choose it', async () => {
    wire({ callerSide: 'talent' });
    const res = await reviewsPost(
      post({ shift_id: SHIFT_ID, rating: 5, direction: 'VENUE_TO_TALENT' }),
      {}
    );
    expect(res.status).toBe(201);
    const insert = executed().find((text) => text.includes('INSERT INTO reviews'));
    expect(insert).toBeTruthy();
    // The talent-side caller always writes TALENT_TO_VENUE, whatever the body said.
    const insertCall = mocks.sql.mock.calls.find(([first]) =>
      (Array.isArray(first) ? (first as string[]).join('') : String(first)).includes(
        'INSERT INTO reviews'
      )
    )!;
    expect(insertCall.slice(1)).toContain('TALENT_TO_VENUE');
  });

  it('maps the UNIQUE violation to a friendly 400 (one review per direction)', async () => {
    wire({ insertFails: 'duplicate key value violates unique constraint "reviews_one_per_direction"' });
    const res = await reviewsPost(post({ shift_id: SHIFT_ID, rating: 4 }), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('already reviewed');
  });

  it('recomputes the venue aggregate server-side in the same request', async () => {
    wire({ callerSide: 'talent' });
    const res = await reviewsPost(post({ shift_id: SHIFT_ID, rating: 5 }), {});
    expect(res.status).toBe(201);
    expect(executed().some((text) => text.includes('UPDATE venue_profiles'))).toBe(true);
  });

  it('recomputes talent rating AND trust score when the venue reviews', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'talent-user', email: 'v@example.com', name: 'V' },
    });
    wire({ role: 'VENUE', callerSide: 'venue' });
    const res = await reviewsPost(post({ shift_id: SHIFT_ID, rating: 5 }), {});
    expect(res.status).toBe(201);
    const updates = executed().filter((text) => text.includes('UPDATE talent_profiles'));
    expect(updates.length).toBe(1);
    expect(updates[0]).toContain('trust_score');
  });

  it('rejects out-of-band ratings at the schema layer', async () => {
    wire();
    expect((await reviewsPost(post({ shift_id: SHIFT_ID, rating: 0 }), {})).status).toBe(400);
    expect((await reviewsPost(post({ shift_id: SHIFT_ID, rating: 6 }), {})).status).toBe(400);
    expect(
      (await reviewsPost(post({ shift_id: SHIFT_ID, rating: 5, comment: 'x'.repeat(1001) }), {}))
        .status
    ).toBe(400);
  });
});

describe('GET /api/reviews', () => {
  it('requires exactly one subject', async () => {
    wire();
    expect((await reviewsGet(new Request('http://t.local/api/reviews'), {})).status).toBe(400);
    expect(
      (
        await reviewsGet(
          new Request(`http://t.local/api/reviews?venue_id=${VENUE_ID}&talent_id=${VENUE_ID}`),
          {}
        )
      ).status
    ).toBe(400);
  });

  it('never selects reviewer_user_id into the public listing', async () => {
    wire();
    await reviewsGet(new Request(`http://t.local/api/reviews?venue_id=${VENUE_ID}`), {});
    const selects = executed().filter((text) => text.includes('FROM reviews r'));
    expect(selects.length).toBeGreaterThan(0);
    for (const text of selects) {
      expect(text).not.toContain('reviewer_user_id');
    }
  });
});
