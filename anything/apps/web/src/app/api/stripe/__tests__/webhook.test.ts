import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/stripe/webhook (P8.3) — S14. TENANT_GUARDRAIL §7 explicitly requires
 * "webhook signature + fee-tamper tests green"; the signature half lives
 * here. Order of defence proven: 503 unkeyed → 400 unsigned/forged (before
 * any state) → replay dropped by the stripe_events PK → handlers idempotent.
 */

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  stripeEnabled: vi.fn(() => true),
  webhookSecret: vi.fn((): string | null => 'whsec_test'),
  constructEventAsync: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/api/utils/sql', () => ({
  default: Object.assign(mocks.sql, {
    transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  }),
}));
vi.mock('@/lib/stripe', () => ({
  stripeEnabled: mocks.stripeEnabled,
  webhookSecret: mocks.webhookSecret,
  getStripe: () => ({ webhooks: { constructEventAsync: mocks.constructEventAsync } }),
}));

import { POST } from '../webhook/route';

const sqlTexts: string[] = [];
const sqlValues: unknown[][] = [];

function wireSql(options: { firstDelivery?: boolean } = {}) {
  sqlTexts.length = 0;
  sqlValues.length = 0;
  mocks.sql.mockImplementation(async (first: unknown, ...values: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('¤') : String(first);
    sqlTexts.push(text);
    sqlValues.push(values);
    if (text.includes('INSERT INTO stripe_events')) {
      return options.firstDelivery === false ? [] : [{ id: values[0] }];
    }
    return [];
  });
}

function webhookRequest(withSignature = true): Request {
  return new Request('http://test.local/api/stripe/webhook', {
    method: 'POST',
    headers: withSignature ? { 'stripe-signature': 't=1,v1=sig' } : {},
    body: '{"id":"evt_1"}',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stripeEnabled.mockReturnValue(true);
  mocks.webhookSecret.mockReturnValue('whsec_test');
});

describe('defence order', () => {
  it('503 when Stripe is unkeyed — acknowledge nothing, reveal nothing', async () => {
    mocks.stripeEnabled.mockReturnValue(false);
    wireSql();
    expect((await POST(webhookRequest(), {})).status).toBe(503);
    expect(sqlTexts).toHaveLength(0);
  });

  it('503 when half-configured (key without webhook secret)', async () => {
    mocks.webhookSecret.mockReturnValue(null);
    wireSql();
    expect((await POST(webhookRequest(), {})).status).toBe(503);
  });

  it('400 on a missing signature header, before any parsing', async () => {
    wireSql();
    expect((await POST(webhookRequest(false), {})).status).toBe(400);
    expect(mocks.constructEventAsync).not.toHaveBeenCalled();
  });

  it('400 on a forged signature, with ZERO state written', async () => {
    mocks.constructEventAsync.mockRejectedValue(new Error('bad sig'));
    wireSql();
    expect((await POST(webhookRequest(), {})).status).toBe(400);
    expect(sqlTexts).toHaveLength(0);
  });
});

describe('replay guard + handlers', () => {
  it('first delivery records the event id and runs the handler', async () => {
    mocks.constructEventAsync.mockResolvedValue({
      id: 'evt_1',
      type: 'account.updated',
      data: { object: { id: 'acct_1', charges_enabled: true, payouts_enabled: true } },
    });
    wireSql({ firstDelivery: true });
    const body = await (await POST(webhookRequest(), {})).json();
    expect(body).toEqual({ received: true });
    expect(sqlTexts.some((t) => t.includes('UPDATE stripe_accounts'))).toBe(true);
  });

  it('a replayed delivery is acknowledged but runs NO handler twice', async () => {
    mocks.constructEventAsync.mockResolvedValue({
      id: 'evt_1',
      type: 'account.updated',
      data: { object: { id: 'acct_1', charges_enabled: true, payouts_enabled: true } },
    });
    wireSql({ firstDelivery: false });
    const body = await (await POST(webhookRequest(), {})).json();
    expect(body).toEqual({ received: true, replay: true });
    expect(sqlTexts.some((t) => t.includes('UPDATE stripe_accounts'))).toBe(false);
  });

  it('transfer.created backfills the transfer id idempotently (only while NULL)', async () => {
    mocks.constructEventAsync.mockResolvedValue({
      id: 'evt_2',
      type: 'transfer.created',
      data: { object: { id: 'tr_9', metadata: { afterdark_payout_id: '7' } } },
    });
    wireSql({ firstDelivery: true });
    await POST(webhookRequest(), {});
    const update = sqlTexts.find((t) => t.includes('UPDATE payouts SET stripe_transfer_id'));
    expect(update).toBeDefined();
    expect(update).toContain('stripe_transfer_id IS NULL');
  });

  it('the replay guard is a DB primary key, not app memory (ON CONFLICT DO NOTHING)', async () => {
    mocks.constructEventAsync.mockResolvedValue({ id: 'evt_3', type: 'noop', data: { object: {} } });
    wireSql({ firstDelivery: true });
    await POST(webhookRequest(), {});
    const guard = sqlTexts.find((t) => t.includes('INSERT INTO stripe_events'));
    expect(guard).toContain('ON CONFLICT (id) DO NOTHING');
  });
});
