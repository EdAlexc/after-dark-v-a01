import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/payouts/release (P8.3) — S14 money-path suite. The escrow release had
 * ZERO route tests while being the single place platform money changes state
 * (§7.2 Q8). Pinned here: privilege (cron bearer XOR admin), double-release
 * impossibility, the unkeyed ledger-advance behavior (A3), per-mode transfer
 * handling, the A5 dead-man scream, and the cron heartbeat.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sql: vi.fn(),
  stripeEnabled: vi.fn(() => false),
  transferCreate: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({
  default: Object.assign(mocks.sql, {
    transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  }),
}));
vi.mock('@/lib/stripe', () => ({
  stripeEnabled: mocks.stripeEnabled,
  getStripe: () => ({ transfers: { create: mocks.transferCreate } }),
  webhookSecret: () => null,
}));
vi.mock('@sentry/nextjs', () => ({ captureMessage: mocks.captureMessage }));

import { GET, POST } from '../release/route';

interface ReleasedRow {
  id: number;
  net_cents: number;
  talent_user_id: string | null;
  shift_id: string;
}

interface DbState {
  role?: string | null;
  releasable?: ReleasedRow[];
  onboardedAccount?: string | null;
}

const auditCalls: string[] = [];
const sqlTexts: string[] = [];
const shiftPaidRuns: string[] = [];
const failedPayoutRuns: number[] = [];
const notifications: string[] = [];

function wireSql(state: DbState) {
  auditCalls.length = 0;
  sqlTexts.length = 0;
  shiftPaidRuns.length = 0;
  failedPayoutRuns.length = 0;
  notifications.length = 0;
  mocks.sql.mockImplementation(async (first: unknown, ...values: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('¤') : String(first);
    sqlTexts.push(text);
    if (text.includes('SELECT role, suspended_at')) return [{ role: state.role ?? null }];
    if (text.includes('UPDATE payouts p')) return state.releasable ?? [];
    if (text.includes('SELECT stripe_account_id')) {
      return state.onboardedAccount ? [{ stripe_account_id: state.onboardedAccount }] : [];
    }
    if (text.includes("UPDATE payouts SET status = 'FAILED'")) {
      failedPayoutRuns.push(values[0] as number);
      return [];
    }
    if (text.includes("UPDATE shifts SET status = 'PAID'")) {
      shiftPaidRuns.push('paid');
      return [];
    }
    if (text.includes('INSERT INTO notifications')) {
      notifications.push(String(values[1] ?? ''));
      return [];
    }
    if (text.includes('INSERT INTO audit_logs')) {
      auditCalls.push(String(values[1] ?? ''));
      return [];
    }
    return [];
  });
}

const RELEASED: ReleasedRow = { id: 7, net_cents: 9500, talent_user_id: 'talent-1', shift_id: 's1' };

function request(options: { bearer?: string; method?: string } = {}): Request {
  return new Request('http://test.local/api/payouts/release', {
    method: options.method ?? 'POST',
    headers: options.bearer ? { authorization: `Bearer ${options.bearer}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.getSession.mockResolvedValue(null);
  mocks.stripeEnabled.mockReturnValue(false);
});

describe('privilege boundary', () => {
  it('anonymous POST → 401', async () => {
    wireSql({});
    expect((await POST(request(), {})).status).toBe(401);
  });

  it('TALENT session POST → 403 — participants never release their own money', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 't1', email: 't@x.com' } });
    wireSql({ role: 'TALENT' });
    expect((await POST(request(), {})).status).toBe(403);
  });

  it('wrong cron bearer GET → 400, and the release batch never runs', async () => {
    vi.stubEnv('CRON_SECRET', 'right');
    wireSql({ releasable: [RELEASED] });
    expect((await GET(request({ bearer: 'wrong', method: 'GET' }), {})).status).toBe(400);
    expect(sqlTexts.some((t) => t.includes('UPDATE payouts p'))).toBe(false);
  });

  it('A5 dead-man: scheduled GET with CRON_SECRET unset → 400 AND a Sentry scream', async () => {
    wireSql({});
    const res = await GET(request({ method: 'GET' }), {});
    expect(res.status).toBe(400);
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('CRON_SECRET unset'),
      'error'
    );
  });

  it('a valid bearer does NOT scream — the dead-man is for the dark case only', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    wireSql({ releasable: [] });
    expect((await GET(request({ bearer: 'cron-secret', method: 'GET' }), {})).status).toBe(200);
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });
});

describe('release semantics', () => {
  it('cron run releases due payouts, marks shifts PAID, notifies, audits + heartbeats', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    wireSql({ releasable: [RELEASED] });
    const res = await GET(request({ bearer: 'cron-secret', method: 'GET' }), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ released: 1, transfers: 0, stripe: false });
    expect(shiftPaidRuns).toHaveLength(1);
    expect(notifications).toEqual(['payout.released']);
    expect(auditCalls).toEqual(['payouts.release', 'cron.heartbeat']);
  });

  it('admin manual run audits the release but leaves no cron heartbeat', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'a1', email: 'a@x.com' } });
    wireSql({ role: 'ADMIN', releasable: [RELEASED] });
    expect((await POST(request(), {})).status).toBe(200);
    expect(auditCalls).toEqual(['payouts.release']);
  });

  it('a zero-due cron run still heartbeats — silence must be distinguishable from death', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    wireSql({ releasable: [] });
    const body = await (await GET(request({ bearer: 'cron-secret', method: 'GET' }), {})).json();
    expect(body.released).toBe(0);
    expect(auditCalls).toEqual(['cron.heartbeat']);
  });

  it('double-release is impossible by construction: the batch is HELD-scoped and 24h-gated', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    wireSql({ releasable: [] });
    await GET(request({ bearer: 'cron-secret', method: 'GET' }), {});
    const batch = sqlTexts.find((t) => t.includes('UPDATE payouts p'));
    expect(batch).toBeDefined();
    expect(batch).toContain("p.status = 'HELD'");
    expect(batch).toContain("INTERVAL '24 hours'");
  });
});

describe('transfer modes (A3)', () => {
  it('unkeyed: the ledger advances with ZERO transfers, and the response says so', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'a1', email: 'a@x.com' } });
    wireSql({ role: 'ADMIN', releasable: [RELEASED] });
    const body = await (await POST(request(), {})).json();
    expect(body).toEqual({ released: 1, transfers: 0, stripe: false });
    expect(mocks.transferCreate).not.toHaveBeenCalled();
  });

  it('keyed but not onboarded: ledger advances, transfer skipped', async () => {
    mocks.stripeEnabled.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({ user: { id: 'a1', email: 'a@x.com' } });
    wireSql({ role: 'ADMIN', releasable: [RELEASED], onboardedAccount: null });
    const body = await (await POST(request(), {})).json();
    expect(body).toEqual({ released: 1, transfers: 0, stripe: true });
    expect(mocks.transferCreate).not.toHaveBeenCalled();
  });

  it('keyed + onboarded: transfer carries the exact net cents and the payout id', async () => {
    mocks.stripeEnabled.mockReturnValue(true);
    mocks.transferCreate.mockResolvedValue({ id: 'tr_1' });
    mocks.getSession.mockResolvedValue({ user: { id: 'a1', email: 'a@x.com' } });
    wireSql({ role: 'ADMIN', releasable: [RELEASED], onboardedAccount: 'acct_1' });
    const body = await (await POST(request(), {})).json();
    expect(body.transfers).toBe(1);
    expect(mocks.transferCreate).toHaveBeenCalledWith({
      amount: 9500,
      currency: 'usd',
      destination: 'acct_1',
      metadata: { afterdark_payout_id: '7' },
    });
    expect(sqlTexts.some((t) => t.includes('SET stripe_transfer_id'))).toBe(true);
  });

  it('a failed transfer flips the payout to FAILED instead of pretending', async () => {
    mocks.stripeEnabled.mockReturnValue(true);
    mocks.transferCreate.mockRejectedValue(new Error('stripe down'));
    mocks.getSession.mockResolvedValue({ user: { id: 'a1', email: 'a@x.com' } });
    wireSql({ role: 'ADMIN', releasable: [RELEASED], onboardedAccount: 'acct_1' });
    const body = await (await POST(request(), {})).json();
    expect(body.transfers).toBe(0);
    expect(failedPayoutRuns).toEqual([7]);
  });
});
