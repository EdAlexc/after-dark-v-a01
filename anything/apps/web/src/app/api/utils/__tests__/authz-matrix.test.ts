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
function wireSql(actor: Actor, ownerId: string, gigStatus = 'PUBLISHED') {
  mocks.sql.mockImplementation(async (first: unknown, ..._rest: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);

    if (text.includes('SELECT role FROM "user"')) {
      // anon never reaches this lookup; a signed-in actor always has a row.
      return actor === 'anon' ? [] : [{ role: actor }];
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
}

/** Valid request bodies, so validation never masks the authZ decision. */
const REQUEST_BODY: Record<string, unknown> = {
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
};

function buildRequest(row: MatrixRow): Request {
  const url = `http://matrix.local/api/${row.route.replace('/route.ts', '')}`;
  if (row.method === 'GET') return new Request(url);
  const body = REQUEST_BODY[row.id];
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

          const res = await handler(buildRequest(row), {
            params: Promise.resolve({ id: GIG_ID }),
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
            const res = await handlers[row.method](buildRequest(row), {
              params: Promise.resolve({ id: GIG_ID }),
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
    const writes = AUTHZ_MATRIX.filter(
      (row) => !row.platform && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(row.method)
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
