import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/shifts/[id] (P7) — S14. The check-in/out transition had only k6
 * smoke coverage for its idempotency contract (§7.2 Q8), and the fee-tamper
 * proof was structural, not tested. Pinned here at the route level:
 * replay-by-key, cross-tenant 404, transition-matrix denial, and — the §6.4
 * requirement — a checkout carrying smuggled money fields still writes the
 * SERVER-computed 5% split, never the client's numbers.
 */

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), sql: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({
  default: Object.assign(mocks.sql, {
    transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  }),
}));

import { POST } from '../route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';
import { splitPayout } from '@/app/api/utils/money';

const SHIFT_ID = '3f7f16e8-14c2-4b0e-9a75-b1a3b1de0001';
const TALENT = { id: 'talent-user', email: 't@x.com' };

interface ShiftState {
  status?: string;
  check_in_at?: string | null;
  replayTo?: string | null;
}

const sqlTexts: string[] = [];
let payoutInsertValues: unknown[] = [];

function wireSql(role: string | null, shift: ShiftState) {
  sqlTexts.length = 0;
  payoutInsertValues = [];
  mocks.sql.mockImplementation(async (first: unknown, ...values: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('¤') : String(first);
    sqlTexts.push(text);
    if (text.includes('SELECT role, suspended_at')) return [{ role }];
    if (text.includes('FROM shifts s')) {
      return [
        {
          id: SHIFT_ID,
          gig_id: 'gig-1',
          status: shift.status ?? 'SCHEDULED',
          agreed_rate_cents: 10_000, // $100/hr
          check_in_at: shift.check_in_at ?? null,
          check_out_at: null,
          call_time: null,
          gig_title: 'Prime Time Set',
          venue_user_id: 'venue-user',
          talent_user_id: 'talent-user',
        },
      ];
    }
    if (text.includes('FROM shift_transitions')) {
      return shift.replayTo ? [{ to_status: shift.replayTo }] : [];
    }
    if (text.includes('UPDATE shifts')) return [{ id: SHIFT_ID }];
    if (text.includes('INSERT INTO payouts')) {
      payoutInsertValues = values;
      return [];
    }
    return [];
  });
}

function transitionRequest(body: Record<string, unknown>): Request {
  return new Request(`http://test.local/api/shifts/${SHIFT_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: SHIFT_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  getRateLimiter('shifts-transition', { windowMs: 1, max: 1 }).reset();
  mocks.getSession.mockResolvedValue({ user: TALENT });
});

describe('idempotency (§6.3)', () => {
  it('a replayed key returns the RECORDED outcome and re-applies nothing', async () => {
    wireSql('TALENT', { status: 'SCHEDULED', replayTo: 'CHECKED_IN' });
    const res = await POST(
      transitionRequest({ to: 'CHECKED_IN', idempotency_key: 'replayed-key-1' }),
      context
    );
    const body = await res.json();
    expect(body.replayed).toBe(true);
    expect(body.shift.status).toBe('CHECKED_IN');
    expect(sqlTexts.some((t) => t.includes('UPDATE shifts'))).toBe(false);
    expect(sqlTexts.some((t) => t.includes('INSERT INTO payouts'))).toBe(false);
  });

  it('the transition INSERT records the key with the state pair (unique-backed)', async () => {
    wireSql('TALENT', { status: 'SCHEDULED' });
    await POST(transitionRequest({ to: 'CHECKED_IN', idempotency_key: 'fresh-key-11' }), context);
    const record = sqlTexts.find((t) => t.includes('INSERT INTO shift_transitions'));
    expect(record).toBeDefined();
    expect(record).toContain('idempotency_key');
  });
});

describe('actor + matrix boundaries', () => {
  it('a stranger to the shift gets 404, not 403 — existence stays hidden', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'rival-user', email: 'r@x.com' } });
    wireSql('VENUE', { status: 'SCHEDULED' });
    const res = await POST(
      transitionRequest({ to: 'CHECKED_IN', idempotency_key: 'rival-key-1' }),
      context
    );
    expect(res.status).toBe(404);
  });

  it('an out-of-order transition is refused by the matrix', async () => {
    wireSql('TALENT', { status: 'SCHEDULED' });
    const res = await POST(
      transitionRequest({ to: 'CHECKED_OUT', idempotency_key: 'skip-key-01' }),
      context
    );
    expect(res.status).toBe(400);
  });
});

describe('fee tamper (§6.4 — the money moment)', () => {
  it('smuggled fee/gross/net fields are ignored: the payout row is the server-computed split', async () => {
    const checkInAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    wireSql('TALENT', { status: 'CHECKED_IN', check_in_at: checkInAt });
    const res = await POST(
      transitionRequest({
        to: 'CHECKED_OUT',
        idempotency_key: 'tamper-key-01',
        // The attack: name our own price. zod strips unknown keys (P0).
        fee_cents: 1,
        net_cents: 99_999_999,
        gross_cents: 99_999_999,
      }),
      context
    );
    expect(res.status).toBe(200);
    expect(payoutInsertValues.length).toBeGreaterThan(0);

    // ~2h at $100/hr → ~20_000 gross; allow clock skew between test and route.
    const [gross, fee, net] = payoutInsertValues.slice(-3) as [number, number, number];
    expect(gross).toBeGreaterThan(19_000);
    expect(gross).toBeLessThan(21_000);
    // The split is EXACTLY the server formula over the server-computed gross…
    const expected = splitPayout(gross);
    expect(fee).toBe(expected.feeCents);
    expect(net).toBe(expected.netCents);
    expect(fee + net).toBe(gross);
    // …and none of the smuggled numbers survived anywhere in the INSERT.
    for (const smuggled of [1, 99_999_999]) {
      expect(payoutInsertValues).not.toContain(smuggled);
    }
  });

  it('checkout without a check-in cannot mint money', async () => {
    wireSql('VENUE', { status: 'CHECKED_IN', check_in_at: null });
    mocks.getSession.mockResolvedValue({ user: { id: 'venue-user', email: 'v@x.com' } });
    const res = await POST(
      transitionRequest({ to: 'CHECKED_OUT', idempotency_key: 'no-checkin-1' }),
      context
    );
    expect(res.status).toBe(400);
    expect(payoutInsertValues).toHaveLength(0);
  });
});
