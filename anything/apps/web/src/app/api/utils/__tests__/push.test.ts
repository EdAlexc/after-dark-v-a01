/**
 * S9 push sending — key gating, the id-only payload contract, fan-out
 * bounds, and gone-subscription pruning.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  sendNotification: vi.fn(),
}));
vi.mock('@/app/api/utils/sql', () => {
  const fn = mocks.sql as unknown as Record<string, unknown>;
  fn.transaction = async (queries: Promise<unknown>[]) => Promise.all(queries);
  return { default: mocks.sql };
});
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: mocks.sendNotification },
}));

import { isHotWindow, pushConfigured, pushHotGigToTalent } from '../push';

const SUBS = [
  { id: 's1', endpoint: 'https://push.example/1', p256dh: 'k1', auth: 'a1' },
  { id: 's2', endpoint: 'https://push.example/2', p256dh: 'k2', auth: 'a2' },
];

function wireSubscriptions() {
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('FROM push_subscriptions')) return SUBS;
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'test-public';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'test-private';
  wireSubscriptions();
  mocks.sendNotification.mockResolvedValue({});
});

afterEach(() => {
  delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
});

describe('pushHotGigToTalent', () => {
  it('is a 0-send no-op without VAPID keys (key-gated like Stripe)', async () => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    expect(pushConfigured()).toBe(false);
    expect(await pushHotGigToTalent('gig-1')).toBe(0);
    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('sends the ID-ONLY payload — exactly {kind, gigId}, nothing else', async () => {
    const sent = await pushHotGigToTalent('gig-42');
    expect(sent).toBe(2);
    for (const call of mocks.sendNotification.mock.calls) {
      const payload = JSON.parse(call[1] as string);
      expect(payload).toEqual({ kind: 'hot_gig', gigId: 'gig-42' });
    }
  });

  it('targets only unsuspended TALENT subscriptions, bounded', async () => {
    await pushHotGigToTalent('gig-1');
    const query = mocks.sql.mock.calls
      .map(([first]) => (Array.isArray(first) ? (first as string[]).join('') : String(first)))
      .find((text) => text.includes('FROM push_subscriptions'))!;
    expect(query).toContain(`u.role = 'TALENT'`);
    expect(query).toContain('u.suspended_at IS NULL');
    expect(query).toContain('LIMIT');
  });

  it('prunes gone endpoints (410) and keeps counting the rest', async () => {
    mocks.sendNotification
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({});
    const sent = await pushHotGigToTalent('gig-1');
    expect(sent).toBe(1);
    const del = mocks.sql.mock.calls
      .map(([first]) => (Array.isArray(first) ? (first as string[]).join('') : String(first)))
      .find((text) => text.includes('DELETE FROM push_subscriptions'));
    expect(del).toBeTruthy();
  });

  it('NEVER throws — a push outage cannot break gig publishing', async () => {
    mocks.sql.mockRejectedValue(new Error('db down'));
    await expect(pushHotGigToTalent('gig-1')).resolves.toBe(0);
  });
});

describe('isHotWindow', () => {
  it('true only for starts within the next 24h', () => {
    const hour = 60 * 60 * 1000;
    expect(isHotWindow(new Date(Date.now() + 2 * hour).toISOString())).toBe(true);
    expect(isHotWindow(new Date(Date.now() + 30 * hour).toISOString())).toBe(false);
    expect(isHotWindow(new Date(Date.now() - hour).toISOString())).toBe(false);
    expect(isHotWindow(null)).toBe(false);
    expect(isHotWindow('not-a-date')).toBe(false);
  });
});
