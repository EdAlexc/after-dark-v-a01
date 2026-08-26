/**
 * Generated authZ suite — TENANT_GUARDRAIL §6.1 / DEV_TIMELINE P2.3.
 *
 * Two guarantees:
 *
 *  1. **Coverage gate** — every `route.ts` under `src/app/api` must appear in
 *     AUTHZ_MATRIX. Ship an endpoint without declaring who may call it and CI
 *     fails here, not in production.
 *  2. **Behavioral matrix** — each non-platform row is invoked once per actor
 *     (anon / TALENT / VENUE / PARTY / ADMIN), against both its own resource
 *     and another tenant's, asserting the declared outcome class.
 *
 * The DB and better-auth are mocked: this suite is about *decisions*, not
 * storage. Live tenant isolation under a real enforcing DB role is covered by
 * the RLS procedure in TESTING.md §7.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  changePassword: vi.fn(),
  signInEmail: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
      changePassword: mocks.changePassword,
      signInEmail: mocks.signInEmail,
    },
  },
}));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import {
  ACTORS,
  AUTHZ_MATRIX,
  MATRIX_EXEMPT_ROUTES,
  declaredRoutes,
  type Actor,
  type MatrixRow,
  type Outcome,
} from '../authz-matrix';
import { getRateLimiter } from '../rate-limit';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SELF_ID = 'user-self';
const OTHER_ID = 'user-other';
const GIG_ID = '4b4b1c2e-8f6a-4f7e-9d2a-1234567890ab';
const API_DIR = join(__dirname, '..', '..');

/** Session for an actor; `anon` has none. */
function sessionFor(actor: Actor) {
  return actor === 'anon'
    ? null
    : { user: { id: SELF_ID, email: 'self@example.com', name: 'Self' } };
}

/**
 * One sql mock that answers every shape our routes issue. `ownerId` decides
 * whether the fetched resource belongs to the caller or to another tenant —
 * that single switch is what makes the cross-tenant column meaningful.
 */
const SHIFT_ID = '9c1d2e3f-4a5b-4c6d-8e7f-0123456789ab';
const CONVERSATION_ID = '7e6d5c4b-3a2b-4c1d-9e8f-fedcba987654';

function wireSql(actor: Actor, ownerId: string, gigStatus = 'PUBLISHED') {
  // "Own" rows put the caller on the side their role acts from; the
  // cross-tenant case (ownerId = OTHER_ID) puts strangers on both sides.
  const own = ownerId === SELF_ID;
  const talentSide = own && (actor === 'TALENT' || actor === 'ADMIN') ? SELF_ID : 'talent-else';
  const venueSide = own && (actor === 'VENUE' || actor === 'ADMIN') ? SELF_ID : 'venue-else';

  mocks.sql.mockImplementation(async (first: unknown, ..._rest: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);

    if (text.includes('SELECT role, suspended_at')) {
      // anon never reaches this lookup; a signed-in actor always has a row.
      return actor === 'anon' ? [] : [{ role: actor }];
    }
    // conversations.create counterpart lookup — always the opposite side.
    if (text.includes('SELECT id, role FROM "user"')) {
      return [{ id: OTHER_ID, role: actor === 'VENUE' ? 'TALENT' : 'VENUE' }];
    }
    // accept-rate: conversation joined with the proposal message.
    if (text.includes('JOIN messages m')) {
      return own
        ? [
            {
              id: CONVERSATION_ID,
              gig_id: GIG_ID,
              venue_user_id: actor === 'VENUE' || actor === 'ADMIN' ? SELF_ID : OTHER_ID,
              counterpart_user_id: actor === 'VENUE' || actor === 'ADMIN' ? OTHER_ID : SELF_ID,
              message_id: 'b1a2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
              sender_id: OTHER_ID, // the counterpart proposed; caller accepts
              kind: 'RATE_PROPOSAL',
              rate_cents: 15000,
            },
          ]
        : [];
    }
    if (text.includes('FROM conversations')) {
      if (text.includes('WHERE') && text.includes('venue_user_id')) {
        // Participant-scoped lookups: empty when the caller is not a member.
        return own
          ? [
              {
                id: CONVERSATION_ID,
                venue_user_id: actor === 'VENUE' || actor === 'ADMIN' ? SELF_ID : OTHER_ID,
                counterpart_user_id:
                  actor === 'VENUE' || actor === 'ADMIN' ? OTHER_ID : SELF_ID,
                gig_id: GIG_ID,
              },
            ]
          : [];
      }
      return [];
    }
    if (text.includes('INSERT INTO conversations')) {
      return [{ id: CONVERSATION_ID, gig_id: GIG_ID, kind: 'GIG', created_at: 'now' }];
    }
    if (text.includes('INSERT INTO messages')) {
      return [{ id: 'm-1', sender_id: SELF_ID, content: 'x', kind: 'TEXT', created_at: 'now' }];
    }
    if (text.includes('UPDATE messages')) return [];
    if (text.includes('FROM messages')) return [];

    if (text.includes('FROM applications a')) {
      // Caller-scoped lookups (`tp.user_id = <session>`, e.g. the gigs.detail
      // applicant carve-out) find nothing cross-tenant: a stranger talent has
      // no application. Id-keyed loads (applications.update) still return the
      // row — their routes decide via the venue/talent sides on it.
      if (!own && text.includes('tp.user_id =')) return [];
      return [
        {
          id: 'app-1',
          gig_id: GIG_ID,
          talent_id: 'tp-1',
          status: 'PENDING',
          proposed_rate_cents: 12000,
          gig_title: 'Matrix Gig',
          gig_status: gigStatus,
          gig_base_rate: '100',
          gig_start_time: null,
          venue_user_id: venueSide,
          talent_user_id: talentSide,
        },
      ];
    }
    if (text.includes('INSERT INTO applications')) return [{ id: 'app-1', status: 'PENDING' }];
    if (text.includes('UPDATE applications')) return [{ id: 'app-1' }];

    // S8 reviews: the review-scope lookup uses a distinct alias so the shift
    // can present as completed here without disturbing shifts.transition.
    if (text.includes('FROM shifts review_shift')) {
      return [
        {
          id: SHIFT_ID,
          status: 'CHECKED_OUT',
          talent_id: 'tp-1',
          venue_id: 'vp-1',
          gig_title: 'Matrix Gig',
          venue_user_id: venueSide,
          talent_user_id: talentSide,
        },
      ];
    }
    if (text.includes('INSERT INTO reviews')) {
      return [{ id: 'rev-1', shift_id: SHIFT_ID, rating: 5, created_at: 'now' }];
    }
    if (text.includes('FROM reviews')) return [];

    if (text.includes('push_subscriptions')) return [];
    if (text.includes('FROM shift_transitions')) return [];
    if (text.includes('INSERT INTO shift_transitions')) return [];
    if (text.includes('FROM shifts s')) {
      return [
        {
          id: SHIFT_ID,
          gig_id: GIG_ID,
          status: 'SCHEDULED',
          agreed_rate_cents: 15000,
          check_in_at: null,
          check_out_at: null,
          call_time: null,
          gig_title: 'Matrix Gig',
          venue_user_id: venueSide,
          talent_user_id: talentSide,
        },
      ];
    }
    if (text.includes('UPDATE shifts')) return [{ id: SHIFT_ID, status: 'CHECKED_IN' }];
    if (text.includes('FROM availabilities') || text.includes('INSERT INTO availabilities')) {
      return [];
    }
    if (text.includes('FROM payouts') || text.includes('UPDATE payouts p')) return [];
    if (text.includes('INSERT INTO payouts')) return [];
    if (text.includes('stripe_accounts')) return [];
    if (text.includes('FROM notifications') || text.includes('UPDATE notifications')) return [];
    if (text.includes('INSERT INTO notifications')) return [];
    // P9 admin shapes. requireRole('ADMIN') already gated non-admins before SQL.
    if (text.includes('FROM reports r')) return [];
    if (text.includes('FROM reports WHERE id')) {
      return [
        {
          id: 1,
          reporter_id: OTHER_ID,
          entity_type: 'gig',
          entity_id: GIG_ID,
          reason: 'matrix',
          severity: 'MEDIUM',
          status: 'OPEN',
          created_at: 'now',
          reviewed_at: null,
          resolution_note: null,
        },
      ];
    }
    if (text.includes('UPDATE reports')) {
      return [{ id: 1, status: 'REVIEWING', entity_type: 'gig', entity_id: GIG_ID }];
    }
    if (text.includes('FROM "user" u')) return [];
    if (text.includes('SELECT id, role, suspended_at FROM "user"')) {
      return [{ id: OTHER_ID, role: 'TALENT', suspended_at: null }];
    }
    if (text.includes('UPDATE "user"')) {
      return [{ id: OTHER_ID, suspended_at: 'now', suspended_reason: 'matrix probe' }];
    }
    if (text.includes('FROM audit_logs')) return [];
    if (text.includes('INSERT INTO reports')) {
      return [{ id: 1, status: 'OPEN', severity: 'MEDIUM', created_at: 'now' }];
    }

    if (text.includes('FROM gigs g')) {
      return [
        {
          id: GIG_ID,
          venue_id: 'vp-1',
          title: 'Matrix Gig',
          status: gigStatus,
          base_rate: '100',
          venue_user_id: ownerId,
        },
      ];
    }
    if (text.includes('UPDATE gigs SET status')) {
      return [{ id: GIG_ID, status: 'FILLED', venue_user_id: ownerId }];
    }
    if (text.includes('venue_profiles')) return [{ id: 'vp-1', user_id: ownerId }];
    if (text.includes('talent_profiles')) return [{ id: 'tp-1', user_id: ownerId }];
    if (text.includes('FROM "user"')) {
      return [{ id: SELF_ID, name: 'Self', email: 'self@example.com', role: actor }];
    }
    if (text.includes('UPDATE "user"')) return [{ id: SELF_ID, age_confirmed_at: null }];
    if (text.includes('DELETE FROM "user"')) return [{ id: SELF_ID }];
    if (text.includes('audit_logs')) return [];
    if (text.includes('FROM gigs')) return [];
    return [];
  });
  // Neon's transaction API: array of already-pending queries → array of results.
  (mocks.sql as unknown as { transaction: unknown }).transaction = async (
    queries: Promise<unknown>[]
  ) => Promise.all(queries);
}

/** 1×1 transparent PNG — a real decodable image for the media pipeline. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * Valid request bodies, so validation never masks the authZ decision. A value
 * may be a function of the actor for routes whose legal payload depends on
 * who is calling (application transitions differ per side).
 */
const REQUEST_BODY: Record<string, unknown | ((actor: Actor) => unknown)> = {
  'gigs.create': {
    title: 'Matrix Test Gig',
    role_needed: 'DJ',
    start_time: '2026-12-01T22:00:00',
    end_time: '2026-12-02T02:00:00',
    base_rate: 200,
    status: 'DRAFT',
  },
  'gigs.status': { status: 'FILLED' },
  'talent.profile.update': { stage_name: 'Matrix' },
  'venue.profile.update': { venue_name: 'Matrix Room' },
  'settings.update': { name: 'Matrix' },
  'settings.change-password': {
    currentPassword: 'old-password-1',
    newPassword: 'new-password-22',
  },
  'user.role.set': { role: 'TALENT' },
  'account.delete': { password: 'old-password-1', confirm: 'DELETE' },
  // P3–P8 surfaces
  'gigs.apply': { proposed_rate_cents: 15000, cover_message: 'matrix apply' },
  'applications.update': (actor: Actor) =>
    actor === 'TALENT' ? { status: 'WITHDRAWN' } : { status: 'SHORTLISTED' },
  'notifications.read': {},
  'media.upload': { dataUrl: TINY_PNG, purpose: 'avatar' },
  'conversations.create': { counterpart_user_id: OTHER_ID },
  'messages.send': { content: 'matrix hello' },
  'conversations.accept-rate': { message_id: 'b1a2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d' },
  'reports.create': { entity_type: 'conversation', entity_id: 'x-1', reason: 'matrix report' },
  'rum.ingest': { metric: 'LCP', value: 1234.5, rating: 'good', path: '/dashboard/talent' },
  'availability.put': { date: '2026-08-15', slots: { PRIME_TIME: 'AVAILABLE' } },
  'shifts.transition': { to: 'CHECKED_IN', idempotency_key: 'matrix-idem-0001' },
  'stripe.connect.start': {},
  'payouts.release': {},
  // P9 admin surfaces
  'admin.reports.update': { status: 'REVIEWING' },
  // S8 reviews
  'reviews.create': { shift_id: SHIFT_ID, rating: 5, comment: 'matrix review' },
  // S9 push
  'push.subscribe': {
    endpoint: 'https://push.example/endpoint-1',
    keys: { p256dh: 'matrix-p256dh', auth: 'matrix-auth' },
  },
  'push.unsubscribe': { endpoint: 'https://push.example/endpoint-1' },
  'admin.users.update': { suspended: true, reason: 'matrix probe' },
  'admin.gigs.update': { status: 'CANCELLED', reason: 'matrix takedown' },
  // S20 saved talent
  'venue.savedTalent.write': {
    talent_id: 'aa11bb22-cc33-4d44-8e55-ff6677889900',
    saved: true,
  },
};

/** Query strings for GET routes whose schema requires one. */
const REQUEST_QUERY: Record<string, string> = {
  'availability.get': '?month=2026-08',
  'search.list': '?q=matrix',
  'gigs.match-preview': '?role=DJ',
  'reviews.list': `?venue_id=${GIG_ID}`,
};

function buildRequest(row: MatrixRow, actor: Actor): Request {
  const url =
    `http://matrix.local/api/${row.route.replace('/route.ts', '')}` +
    (REQUEST_QUERY[row.id] ?? '');
  if (row.method === 'GET') return new Request(url);
  const entry = REQUEST_BODY[row.id];
  const body = typeof entry === 'function' ? (entry as (a: Actor) => unknown)(actor) : entry;
  return new Request(url, {
    method: row.method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function outcomeOf(status: number): Outcome | 'OTHER' {
  if (status >= 200 && status < 300) return 'ALLOW';
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 503) return 'UNAVAILABLE';
  return 'OTHER';
}

// ─── 1. Coverage gate ─────────────────────────────────────────────────────────

function findRouteFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'utils') continue;
      findRouteFiles(full, found);
    } else if (entry === 'route.ts') {
      found.push(relative(API_DIR, full).split(sep).join('/'));
    }
  }
  return found;
}

describe('authZ matrix — coverage gate', () => {
  const routeFiles = findRouteFiles(API_DIR);

  it('finds the API routes on disk (sanity: the walker works)', () => {
    expect(routeFiles.length).toBeGreaterThan(10);
    expect(routeFiles).toContain('gigs/route.ts');
  });

  it('declares every route file — a new endpoint without a row fails here', () => {
    const declared = declaredRoutes();
    const undeclared = routeFiles.filter(
      (file) => !declared.has(file) && !MATRIX_EXEMPT_ROUTES.includes(file)
    );
    expect(
      undeclared,
      `Undeclared route(s). Add a row to src/app/api/utils/authz-matrix.ts describing who may ` +
        `call each, then re-run:\n  ${undeclared.join('\n  ')}`
    ).toEqual([]);
  });

  it('declares no route that no longer exists (matrix stays pruned)', () => {
    const onDisk = new Set(routeFiles);
    const stale = [...declaredRoutes()].filter((route) => !onDisk.has(route));
    expect(stale, `Matrix rows point at deleted route(s):\n  ${stale.join('\n  ')}`).toEqual([]);
  });

  it('gives every row an outcome for every actor', () => {
    for (const row of AUTHZ_MATRIX) {
      for (const actor of ACTORS) {
        expect(row.expect[actor], `${row.id} is missing an expectation for ${actor}`).toBeDefined();
      }
    }
  });

  it('uses unique row ids', () => {
    const ids = AUTHZ_MATRIX.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/** The [id] segment appropriate to the route under test. */
function idParamFor(row: MatrixRow): string {
  if (row.route.startsWith('shifts/')) return SHIFT_ID;
  if (row.route.startsWith('conversations/')) return CONVERSATION_ID;
  if (row.route.startsWith('applications/')) return 'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d';
  if (row.route.startsWith('admin/reports/')) return '1';
  // Always another (non-admin) account: self-suspension is a separate 400 test.
  if (row.route.startsWith('admin/users/')) return OTHER_ID;
  return GIG_ID;
}

// ─── 2. Behavioral matrix ─────────────────────────────────────────────────────

const behavioral = AUTHZ_MATRIX.filter((row) => !row.platform);

describe('authZ matrix — enforced behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const name of [
      'gigs-create',
      'gigs-status',
      'change-password',
      'account-export',
      'account-delete',
      'role-set',
      'applications-create',
      'applications-review',
      'conversations-create',
      'messages-send',
      'reports-create',
      'media-upload',
      'shifts-transition',
      'stripe-connect',
    ]) {
      getRateLimiter(name, { windowMs: 1, max: 1000 }).reset();
    }
    mocks.changePassword.mockResolvedValue({ ok: true });
    mocks.signInEmail.mockResolvedValue({ user: { id: SELF_ID } });
  });

  for (const row of behavioral) {
    describe(`${row.id} (${row.method} ${row.route.replace('/route.ts', '')})`, () => {
      for (const actor of ACTORS) {
        it(`${actor} → ${row.expect[actor]} (own resource)`, async () => {
          mocks.getSession.mockResolvedValue(sessionFor(actor));
          wireSql(actor, SELF_ID);

          const handlers = (await import(`../../${row.route.replace('/route.ts', '')}/route`)) as Record<
            string,
            (req: Request, ctx: unknown) => Promise<Response>
          >;
          const handler = handlers[row.method];
          expect(handler, `${row.route} exports no ${row.method}`).toBeTypeOf('function');

          const res = await handler(buildRequest(row, actor), {
            params: Promise.resolve({ id: idParamFor(row) }),
          });
          expect(
            outcomeOf(res.status),
            `${row.id}/${actor}: expected ${row.expect[actor]}, got HTTP ${res.status}`
          ).toBe(row.expect[actor]);
        });

        const crossExpectation = row.expectCrossTenant?.[actor];
        if (crossExpectation) {
          it(`${actor} → ${crossExpectation} (another tenant's resource)`, async () => {
            mocks.getSession.mockResolvedValue(sessionFor(actor));
            wireSql(actor, OTHER_ID, row.crossTenantFixture?.gigStatus ?? 'PUBLISHED');

            const handlers = (await import(
              `../../${row.route.replace('/route.ts', '')}/route`
            )) as Record<string, (req: Request, ctx: unknown) => Promise<Response>>;
            const res = await handlers[row.method](buildRequest(row, actor), {
              params: Promise.resolve({ id: idParamFor(row) }),
            });
            expect(
              outcomeOf(res.status),
              `${row.id}/${actor} cross-tenant: expected ${crossExpectation}, got HTTP ${res.status}`
            ).toBe(crossExpectation);
          });
        }
      }
    });
  }
});

// ─── 3. Standing invariants the matrix must keep expressing ───────────────────

describe('authZ matrix — invariants', () => {
  it('never grants an anonymous caller a marketplace write', () => {
    // The ONE deliberate exception (S18): rum.ingest is anonymous by design —
    // strict-validated, rate-limited web-vitals telemetry that touches no
    // marketplace state (SERVICE-context insert into an append-only table).
    // Anything else joining this set needs the same scrutiny on the record.
    const ANON_WRITE_ALLOWED = new Set(['rum.ingest']);
    const writes = AUTHZ_MATRIX.filter(
      (row) =>
        !row.platform &&
        !ANON_WRITE_ALLOWED.has(row.id) &&
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(row.method)
    );
    expect(writes.length).toBeGreaterThan(4);
    for (const row of writes) {
      expect(row.expect.anon, `${row.id} lets anonymous callers write`).not.toBe('ALLOW');
    }
  });

  it('never lets PARTY act as a marketplace principal (§6.3 read-only persona)', () => {
    const principalWrites = ['gigs.create', 'gigs.status', 'venue.gigs', 'venue.profile.update'];
    for (const id of principalWrites) {
      const row = AUTHZ_MATRIX.find((candidate) => candidate.id === id)!;
      expect(row.expect.PARTY, `${id} must deny PARTY`).not.toBe('ALLOW');
    }
  });

  it('hides existence rather than returning 403 on cross-tenant gig access', () => {
    const detail = AUTHZ_MATRIX.find((row) => row.id === 'gigs.detail')!;
    expect(detail.expectCrossTenant?.TALENT).toBe('NOT_FOUND');
    const status = AUTHZ_MATRIX.find((row) => row.id === 'gigs.status')!;
    expect(status.expectCrossTenant?.VENUE).toBe('NOT_FOUND');
  });
});
