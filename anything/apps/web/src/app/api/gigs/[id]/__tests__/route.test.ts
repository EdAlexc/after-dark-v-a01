import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({
  default: Object.assign(mocks.sql, {
    // Neon's transaction API (used via withRlsContext, S2): array of
    // already-pending queries → array of results.
    transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  }),
}));

import { GET, PATCH } from '../route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';

const GIG_ID = '4b4b1c2e-8f6a-4f7e-9d2a-1234567890ab';
const OWNER = { user: { id: 'venue-user', email: 'v@example.com', name: 'V' } };
const STRANGER = { user: { id: 'other-user', email: 'o@example.com', name: 'O' } };

interface DbState {
  role?: string | null;
  gig?: Record<string, unknown> | null;
  updateReturns?: Record<string, unknown>[] | null;
  /** Row returned for the caller's own-application lookup (TALENT sessions). */
  application?: Record<string, unknown> | null;
}

function gigRow(overrides: Record<string, unknown> = {}) {
  return {
    id: GIG_ID,
    venue_id: 'vp-1',
    title: 'Deep House Saturday',
    status: 'PUBLISHED',
    base_rate: '450',
    venue_user_id: 'venue-user',
    venue_name: 'Nebula NYC',
    venue_gigs_hosted: 3,
    ...overrides,
  };
}

function wireSql(state: DbState) {
  mocks.sql.mockImplementation(async (first: unknown, ..._rest: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) {
      // A signed-in user always has a row; role may be null (pre-onboarding).
      // Returning [] would now mean "account deleted" → 401.
      return [{ role: state.role ?? null }];
    }
    if (text.includes('FROM gigs g')) return state.gig ? [state.gig] : [];
    if (text.includes('FROM applications a')) return state.application ? [state.application] : [];
    if (text.includes('UPDATE gigs SET status')) {
      return state.updateReturns ?? [{ ...state.gig, status: 'CHANGED' }];
    }
    if (text.includes('INSERT INTO audit_logs')) return [];
    return [];
  });
}

function patch(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://test.local/api/gigs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

function get(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://test.local/api/gigs/${id}`),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  getRateLimiter('gigs-status', { windowMs: 1, max: 1 }).reset();
  mocks.getSession.mockResolvedValue(null);
});

describe('GET /api/gigs/[id]', () => {
  it('serves PUBLISHED gigs to anonymous visitors without leaking the owner id', async () => {
    wireSql({ gig: gigRow() });
    const res = await GET(...get(GIG_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gig.title).toBe('Deep House Saturday');
    expect(body.isOwner).toBe(false);
    expect(JSON.stringify(body)).not.toContain('venue_user_id');
  });

  it('404s a non-UUID id before touching the database', async () => {
    wireSql({ gig: gigRow() });
    const res = await GET(...get("1;DROP TABLE gigs"));
    expect(res.status).toBe(404);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('hides DRAFT gigs from anonymous visitors and strangers (404, not 403)', async () => {
    wireSql({ gig: gigRow({ status: 'DRAFT' }) });
    expect((await GET(...get(GIG_ID))).status).toBe(404);

    mocks.getSession.mockResolvedValue(STRANGER);
    wireSql({ gig: gigRow({ status: 'DRAFT' }), role: 'TALENT' });
    expect((await GET(...get(GIG_ID))).status).toBe(404);
  });

  it('shows the owner their own DRAFT gig with isOwner set', async () => {
    mocks.getSession.mockResolvedValue(OWNER);
    wireSql({ gig: gigRow({ status: 'DRAFT' }), role: 'VENUE' });
    const res = await GET(...get(GIG_ID));
    expect(res.status).toBe(200);
    expect((await res.json()).isOwner).toBe(true);
  });

  it('keeps a FILLED gig visible to the talent who applied (deep links survive hire)', async () => {
    // E2E find: hiring flips the gig to FILLED; without the applicant
    // carve-out the hired talent's dashboard links all started 404ing.
    mocks.getSession.mockResolvedValue(STRANGER);
    wireSql({
      gig: gigRow({ status: 'FILLED' }),
      role: 'TALENT',
      application: { id: 'app-1', status: 'HIRED', proposed_rate_cents: 16000 },
    });
    const res = await GET(...get(GIG_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.myApplication.status).toBe('HIRED');
    expect(body.isOwner).toBe(false);

    // Same talent without an application still gets a 404.
    wireSql({ gig: gigRow({ status: 'FILLED' }), role: 'TALENT', application: null });
    expect((await GET(...get(GIG_ID))).status).toBe(404);
  });

  it('lets ADMIN view any status', async () => {
    mocks.getSession.mockResolvedValue(STRANGER);
    wireSql({ gig: gigRow({ status: 'CANCELLED' }), role: 'ADMIN' });
    expect((await GET(...get(GIG_ID))).status).toBe(200);
  });
});

describe('PATCH /api/gigs/[id] (status transitions)', () => {
  it('401s anonymous and 403s talent (authZ matrix)', async () => {
    wireSql({ gig: gigRow() });
    expect((await PATCH(...patch(GIG_ID, { status: 'FILLED' }))).status).toBe(401);

    mocks.getSession.mockResolvedValue(STRANGER);
    wireSql({ gig: gigRow(), role: 'TALENT' });
    expect((await PATCH(...patch(GIG_ID, { status: 'FILLED' }))).status).toBe(403);
  });

  it("404s another venue's gig (tenant isolation — existence stays hidden)", async () => {
    mocks.getSession.mockResolvedValue(STRANGER);
    wireSql({ gig: gigRow(), role: 'VENUE' });
    const res = await PATCH(...patch(GIG_ID, { status: 'FILLED' }));
    expect(res.status).toBe(404);
  });

  it('applies a legal transition, audits it, and scopes the UPDATE by prior status', async () => {
    mocks.getSession.mockResolvedValue(OWNER);
    wireSql({ gig: gigRow(), role: 'VENUE', updateReturns: [gigRow({ status: 'FILLED' })] });
    const res = await PATCH(...patch(GIG_ID, { status: 'FILLED' }));
    expect(res.status).toBe(200);
    expect((await res.json()).gig.status).toBe('FILLED');

    const updateCall = mocks.sql.mock.calls.find((call) => {
      const text = Array.isArray(call[0]) ? (call[0] as string[]).join('') : String(call[0]);
      return text.includes('UPDATE gigs SET status');
    });
    expect(updateCall).toBeDefined();
    const auditCall = mocks.sql.mock.calls.find((call) => {
      const text = Array.isArray(call[0]) ? (call[0] as string[]).join('') : String(call[0]);
      return text.includes('audit_logs');
    });
    expect(auditCall).toBeDefined();
  });

  it('rejects illegal transitions with 400 and never updates', async () => {
    mocks.getSession.mockResolvedValue(OWNER);
    wireSql({ gig: gigRow({ status: 'DRAFT' }), role: 'VENUE' });
    const res = await PATCH(...patch(GIG_ID, { status: 'COMPLETED' }));
    expect(res.status).toBe(400);
    const updateCall = mocks.sql.mock.calls.find((call) => {
      const text = Array.isArray(call[0]) ? (call[0] as string[]).join('') : String(call[0]);
      return text.includes('UPDATE gigs');
    });
    expect(updateCall).toBeUndefined();
  });

  it('treats a same-status PATCH as an idempotent no-op', async () => {
    mocks.getSession.mockResolvedValue(OWNER);
    wireSql({ gig: gigRow({ status: 'PUBLISHED' }), role: 'VENUE' });
    const res = await PATCH(...patch(GIG_ID, { status: 'PUBLISHED' }));
    expect(res.status).toBe(200);
    const updateCall = mocks.sql.mock.calls.find((call) => {
      const text = Array.isArray(call[0]) ? (call[0] as string[]).join('') : String(call[0]);
      return text.includes('UPDATE gigs');
    });
    expect(updateCall).toBeUndefined();
  });

  it('rejects statuses outside the enum with 400', async () => {
    mocks.getSession.mockResolvedValue(OWNER);
    wireSql({ gig: gigRow(), role: 'VENUE' });
    const res = await PATCH(...patch(GIG_ID, { status: 'HACKED' }));
    expect(res.status).toBe(400);
  });

  it('400s when the row changed between read and write (lost-update guard)', async () => {
    mocks.getSession.mockResolvedValue(OWNER);
    wireSql({ gig: gigRow(), role: 'VENUE', updateReturns: [] });
    const res = await PATCH(...patch(GIG_ID, { status: 'FILLED' }));
    expect(res.status).toBe(400);
  });
});
