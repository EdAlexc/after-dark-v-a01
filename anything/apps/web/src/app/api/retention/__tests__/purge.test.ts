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

import { GET, POST } from '../purge/route';

interface DbState {
  role?: string | null;
  holds?: Array<{ scope: string; user_id: string | null }>;
  expiredSessions?: Array<{ id: string; userId?: string }>;
}

const auditCalls: string[] = [];
const deletions: string[] = [];

function wireSql(state: DbState) {
  auditCalls.length = 0;
  deletions.length = 0;
  mocks.sql.mockImplementation(async (first: unknown, ...values: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) return [{ role: state.role ?? null }];
    if (text.includes('FROM legal_holds')) return state.holds ?? [];
    if (text.includes('DELETE FROM "session"')) {
      deletions.push('session');
      // Emulate the hold filter: rows of held users survive.
      const held = (values[0] as string[]) ?? [];
      return (state.expiredSessions ?? []).filter(
        (row) => !held.includes(row.userId ?? '')
      );
    }
    if (text.includes('DELETE FROM "verification"')) {
      deletions.push('verification');
      return [];
    }
    if (text.includes('DELETE FROM rate_limit_counters')) {
      deletions.push('rate_limit_counters');
      return [];
    }
    if (text.includes('DELETE FROM "rateLimit"')) {
      deletions.push('rateLimit');
      return [];
    }
    if (text.includes('INSERT INTO audit_logs')) {
      auditCalls.push(String(values[1] ?? ''));
      return [];
    }
    return [];
  });
}

function request(options: { bearer?: string; method?: string } = {}): Request {
  return new Request('http://test.local/api/retention/purge', {
    method: options.method ?? 'POST',
    headers: options.bearer ? { authorization: `Bearer ${options.bearer}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.getSession.mockResolvedValue(null);
});

describe('retention purge (S2 / G7)', () => {
  it('cron bearer purges all four stores and audits the run with counts', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    wireSql({ expiredSessions: [{ id: 's1' }, { id: 's2' }] });

    const res = await POST(request({ bearer: 'cron-secret' }), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.held).toBe(false);
    expect(body.purged.sessions).toBe(2);
    expect(deletions).toEqual(['session', 'verification', 'rate_limit_counters', 'rateLimit']);
    expect(auditCalls).toEqual(['retention.purge']);
  });

  it('a GLOBAL legal hold suspends every deletion — and still audits', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    wireSql({
      holds: [{ scope: 'GLOBAL', user_id: null }],
      expiredSessions: [{ id: 's1' }],
    });

    const res = await POST(request({ bearer: 'cron-secret' }), {});
    const body = await res.json();
    expect(body.held).toBe(true);
    expect(deletions).toEqual([]); // nothing deleted under hold
    expect(auditCalls).toEqual(['retention.purge']); // the hold itself is on the record
  });

  it('a USER hold shields that user’s sessions while everything else purges', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    wireSql({
      holds: [{ scope: 'USER', user_id: 'held-user' }],
      expiredSessions: [
        { id: 's1', userId: 'held-user' },
        { id: 's2', userId: 'free-user' },
      ],
    });

    const res = await POST(request({ bearer: 'cron-secret' }), {});
    const body = await res.json();
    expect(body.held).toBe(false);
    expect(body.userHolds).toBe(1);
    expect(body.purged.sessions).toBe(1); // only the unheld user's session
    expect(deletions).toContain('session');
  });

  it('rejects a wrong bearer as an unauthenticated session call', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    wireSql({});
    const res = await POST(request({ bearer: 'wrong' }), {});
    expect(res.status).toBe(401);
    expect(deletions).toEqual([]);
  });

  it('refuses to treat the bearer path as configured when CRON_SECRET is unset', async () => {
    wireSql({});
    const res = await POST(request({ bearer: '' }), {});
    expect(res.status).toBe(401);
  });

  it('allows an ADMIN session and forbids everyone else', async () => {
    wireSql({ role: 'ADMIN' });
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-1', email: 'a@x', name: 'A' } });
    expect((await POST(request(), {})).status).toBe(200);

    wireSql({ role: 'VENUE' });
    mocks.getSession.mockResolvedValue({ user: { id: 'venue-1', email: 'v@x', name: 'V' } });
    expect((await POST(request(), {})).status).toBe(403);
  });

  it('GET runs only for the cron bearer and 400s a plain GET loudly', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    wireSql({});
    expect((await GET(request({ bearer: 'cron-secret', method: 'GET' }), {})).status).toBe(200);
    expect((await GET(request({ method: 'GET' }), {})).status).toBe(400);
  });
});
