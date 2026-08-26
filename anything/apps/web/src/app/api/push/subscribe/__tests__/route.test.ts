/**
 * /api/push/subscribe (S9, Q8) — the VAPID key gate (unkeyed: GET reports
 * enabled:false, POST answers 503, DELETE still lets a browser opt out),
 * the keyed happy paths (upsert-with-re-home, delete-own-row, opt-in
 * status), strict input rejection, and the per-user rate limit. AuthZ rows
 * live in the matrix suite.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), sql: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => {
  const fn = mocks.sql as unknown as Record<string, unknown>;
  fn.transaction = async (queries: Promise<unknown>[]) => Promise.all(queries);
  return { default: mocks.sql };
});
// utils/push imports web-push at module load; the route never sends, so an
// inert stub keeps the graph hermetic.
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

import { DELETE, GET, POST } from '../route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';

const SESSION = { user: { id: 'talent-user', email: 't@example.com', name: 'T' } };
const ENDPOINT = 'https://push.example.org/sub/abc123';
const VALID_SUB = { endpoint: ENDPOINT, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } };

function keyed() {
  vi.stubEnv('WEB_PUSH_VAPID_PUBLIC_KEY', 'test-vapid-public');
  vi.stubEnv('WEB_PUSH_VAPID_PRIVATE_KEY', 'test-vapid-private');
}

function unkeyed() {
  vi.stubEnv('WEB_PUSH_VAPID_PUBLIC_KEY', '');
  vi.stubEnv('WEB_PUSH_VAPID_PRIVATE_KEY', '');
}

function wire({ subscriptionCount = 0 } = {}) {
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) {
      return [{ role: 'TALENT', suspended_at: null, suspended_reason: null }];
    }
    if (text.includes('COUNT(*)::int AS count')) return [{ count: subscriptionCount }];
    return [];
  });
}

function callText(call: unknown[]): string {
  return Array.isArray(call[0]) ? (call[0] as string[]).join('') : String(call[0]);
}

function jsonRequest(method: string, body?: unknown): Request {
  return new Request('http://test.local/api/push/subscribe', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  wire();
  mocks.getSession.mockResolvedValue(SESSION);
  // Singleton registry hands back the limiter the route captured at import;
  // the options here are ignored — reset() is the point.
  getRateLimiter('push-subscribe', { windowMs: 1, max: 1 }).reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('without the VAPID pair (key gate)', () => {
  beforeEach(unkeyed);

  it('GET reports the surface disabled without touching subscriptions', async () => {
    const res = await GET(jsonRequest('GET'), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, vapidPublicKey: null, subscribed: false });
    const texts = mocks.sql.mock.calls.map(callText);
    expect(texts.some((text) => text.includes('push_subscriptions'))).toBe(false);
  });

  it('POST answers 503 before even parsing the body', async () => {
    const res = await POST(jsonRequest('POST', VALID_SUB), {});
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Push is not configured' });
    // 503s even on a body that would not validate — the gate comes first.
    const res2 = await POST(jsonRequest('POST', { garbage: true }), {});
    expect(res2.status).toBe(503);
    const texts = mocks.sql.mock.calls.map(callText);
    expect(texts.some((text) => text.includes('INSERT INTO push_subscriptions'))).toBe(false);
  });

  it('DELETE is not key-gated — opting out always works', async () => {
    const res = await DELETE(jsonRequest('DELETE', { endpoint: ENDPOINT }), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscribed: false });
    const del = mocks.sql.mock.calls.find((call) =>
      callText(call).includes('DELETE FROM push_subscriptions')
    );
    expect(del).toBeDefined();
  });
});

describe('with the VAPID pair', () => {
  beforeEach(keyed);

  it('GET reports opt-in state with the public key (no rows yet)', async () => {
    const res = await GET(jsonRequest('GET'), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      enabled: true,
      vapidPublicKey: 'test-vapid-public',
      subscribed: false,
    });
  });

  it('GET flips subscribed when the caller owns at least one row', async () => {
    wire({ subscriptionCount: 2 });
    const res = await GET(jsonRequest('GET'), {});
    expect((await res.json()).subscribed).toBe(true);
    // The count is scoped to the caller's own user id.
    const count = mocks.sql.mock.calls.find((call) =>
      callText(call).includes('COUNT(*)::int AS count')
    );
    expect(count?.slice(1)).toContain(SESSION.user.id);
  });

  it('POST stores the caller’s own subscription, re-homing the endpoint first', async () => {
    const res = await POST(jsonRequest('POST', VALID_SUB), {});
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ subscribed: true });

    const calls = mocks.sql.mock.calls;
    // Endpoint re-home: a cross-user DELETE by endpoint alone, run as SERVICE.
    const rehomeIndex = calls.findIndex(
      (call) =>
        callText(call).includes('DELETE FROM push_subscriptions') &&
        !callText(call).includes('user_id')
    );
    expect(rehomeIndex).toBeGreaterThanOrEqual(0);
    expect(calls[rehomeIndex].slice(1)).toContain(ENDPOINT);
    expect(
      calls.some(
        (call) => callText(call).includes('set_config') && call.slice(1).includes('SERVICE')
      )
    ).toBe(true);

    // The insert itself rides the caller's identity from the session — never
    // a client-supplied user id — and is idempotent on the endpoint.
    const insertIndex = calls.findIndex((call) =>
      callText(call).includes('INSERT INTO push_subscriptions')
    );
    expect(insertIndex).toBeGreaterThan(rehomeIndex);
    const insertValues = calls[insertIndex].slice(1);
    expect(insertValues).toContain(SESSION.user.id);
    expect(insertValues).toContain(ENDPOINT);
    expect(insertValues).toContain(VALID_SUB.keys.p256dh);
    expect(insertValues).toContain(VALID_SUB.keys.auth);
    expect(callText(calls[insertIndex])).toContain('ON CONFLICT (endpoint) DO NOTHING');
  });

  it('POST rejects bad endpoint URLs and missing keys with 400', async () => {
    const bad = [
      { ...VALID_SUB, endpoint: 'not-a-url' },
      { ...VALID_SUB, endpoint: `https://push.example.org/${'x'.repeat(1000)}` },
      { endpoint: ENDPOINT }, // keys missing entirely
      { endpoint: ENDPOINT, keys: { p256dh: 'p' } }, // auth missing
      { endpoint: ENDPOINT, keys: { p256dh: '', auth: 'a' } }, // empty key
      {},
    ];
    for (const body of bad) {
      const res = await POST(jsonRequest('POST', body), {});
      expect(res.status).toBe(400);
    }
    const texts = mocks.sql.mock.calls.map(callText);
    expect(texts.some((text) => text.includes('INSERT INTO push_subscriptions'))).toBe(false);
  });

  it('DELETE removes by endpoint scoped to the caller’s own rows', async () => {
    const res = await DELETE(jsonRequest('DELETE', { endpoint: ENDPOINT }), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscribed: false });
    const del = mocks.sql.mock.calls.find(
      (call) =>
        callText(call).includes('DELETE FROM push_subscriptions') &&
        callText(call).includes('user_id')
    );
    expect(del).toBeDefined();
    expect(del!.slice(1)).toContain(ENDPOINT);
    expect(del!.slice(1)).toContain(SESSION.user.id);
  });

  it('DELETE rejects a malformed endpoint with 400', async () => {
    const res = await DELETE(jsonRequest('DELETE', { endpoint: 'garbage' }), {});
    expect(res.status).toBe(400);
  });

  it('requires a session on every verb', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(jsonRequest('GET'), {})).status).toBe(401);
    expect((await POST(jsonRequest('POST', VALID_SUB), {})).status).toBe(401);
    expect((await DELETE(jsonRequest('DELETE', { endpoint: ENDPOINT }), {})).status).toBe(401);
  });

  it('rate-limits subscribe churn per user (30/hour) with Retry-After', async () => {
    let last: Response | null = null;
    for (let i = 0; i < 31; i += 1) {
      last = await POST(jsonRequest('POST', VALID_SUB), {});
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
  });
});
