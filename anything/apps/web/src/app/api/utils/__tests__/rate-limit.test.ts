import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('../sql', () => ({ default: mocks.sql }));

import {
  SharedWindowRateLimiter,
  SlidingWindowRateLimiter,
  clientKey,
  enforceRateLimit,
  getRateLimiter,
} from '../rate-limit';
import { ApiError } from '../route-kit';

function fixedClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe('SlidingWindowRateLimiter', () => {
  it('allows up to max within the window, then blocks with retry-after', () => {
    const clock = fixedClock();
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, max: 3, now: clock.now });

    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    const third = limiter.check('k');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const blocked = limiter.check('k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('slides: an attempt is forgiven exactly one window after it happened', () => {
    const clock = fixedClock();
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, max: 2, now: clock.now });
    limiter.check('k'); // t=0
    clock.advance(30_000);
    limiter.check('k'); // t=30s
    expect(limiter.check('k').allowed).toBe(false); // t=30s, both in window

    clock.advance(30_001); // t=60.001s — first attempt aged out
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(false); // window holds t=30s + t=60s attempts
  });

  it('isolates keys', () => {
    const clock = fixedClock();
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, max: 1, now: clock.now });
    expect(limiter.check('alice').allowed).toBe(true);
    expect(limiter.check('bob').allowed).toBe(true);
    expect(limiter.check('alice').allowed).toBe(false);
  });

  it('reset(key) and reset() clear state', () => {
    const clock = fixedClock();
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, max: 1, now: clock.now });
    limiter.check('k');
    expect(limiter.check('k').allowed).toBe(false);
    limiter.reset('k');
    expect(limiter.check('k').allowed).toBe(true);
    limiter.reset();
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('bounds tracked keys (memory abuse guard)', () => {
    const clock = fixedClock();
    const limiter = new SlidingWindowRateLimiter({
      windowMs: 60_000,
      max: 1,
      now: clock.now,
      maxKeys: 2,
    });
    limiter.check('a');
    limiter.check('b');
    limiter.check('c'); // evicts oldest ('a')
    expect(limiter.check('a').allowed).toBe(true); // 'a' was evicted, fresh again
  });

  it('a blocked attempt does not extend the block (no lockout creep)', () => {
    const clock = fixedClock();
    const limiter = new SlidingWindowRateLimiter({ windowMs: 10_000, max: 1, now: clock.now });
    limiter.check('k'); // consumes the slot at t=0
    for (let i = 0; i < 5; i++) {
      clock.advance(1_000);
      expect(limiter.check('k').allowed).toBe(false);
    }
    clock.advance(5_001); // t=10.001s — original attempt aged out
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('rejects invalid configuration', () => {
    expect(() => new SlidingWindowRateLimiter({ windowMs: 0, max: 1 })).toThrow();
    expect(() => new SlidingWindowRateLimiter({ windowMs: 1000, max: 0 })).toThrow();
    expect(() => new SlidingWindowRateLimiter({ windowMs: Infinity, max: 1 })).toThrow();
    expect(() => new SlidingWindowRateLimiter({ windowMs: 1000, max: 1.5 })).toThrow();
  });
});

describe('SharedWindowRateLimiter (Postgres fixed window, S1)', () => {
  beforeEach(() => {
    mocks.sql.mockReset();
  });

  function upsertReturning(count: number, retryAfter = 30) {
    mocks.sql.mockResolvedValueOnce([{ count, retry_after: retryAfter }]);
  }

  it('allows while the shared count is within max', async () => {
    const limiter = new SharedWindowRateLimiter('t', { windowMs: 60_000, max: 3 });
    upsertReturning(2);
    const decision = await limiter.check('user:u1');
    expect(decision).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  });

  it('blocks past max with the window-derived retry-after', async () => {
    const limiter = new SharedWindowRateLimiter('t', { windowMs: 60_000, max: 3 });
    upsertReturning(4, 42);
    const decision = await limiter.check('user:u1');
    expect(decision).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 42 });
  });

  it('namespaces the bucket per limiter so limiters never share counters', async () => {
    const limiter = new SharedWindowRateLimiter('signin', { windowMs: 60_000, max: 1 });
    upsertReturning(1);
    await limiter.check('ip:1.2.3.4');
    // First template value is the bucket parameter.
    const values = mocks.sql.mock.calls[0].slice(1);
    expect(values[0]).toBe('signin:ip:1.2.3.4');
  });

  it('fails open (allowed) when the store errors, instead of 500ing the route', async () => {
    const limiter = new SharedWindowRateLimiter('t', { windowMs: 60_000, max: 3 });
    mocks.sql.mockRejectedValueOnce(new Error('connection refused'));
    const decision = await limiter.check('user:u1');
    expect(decision.allowed).toBe(true);
  });

  it('rejects invalid configuration like the in-memory limiter', () => {
    expect(() => new SharedWindowRateLimiter('t', { windowMs: 0, max: 1 })).toThrow();
    expect(() => new SharedWindowRateLimiter('t', { windowMs: 1000, max: 0 })).toThrow();
  });
});

describe('getRateLimiter registry', () => {
  const registryOf = () =>
    (globalThis as unknown as { __afterdarkRateLimiters?: Map<string, unknown> })
      .__afterdarkRateLimiters;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the same instance per name', () => {
    const a = getRateLimiter('test-registry', { windowMs: 1000, max: 1 });
    const b = getRateLimiter('test-registry', { windowMs: 9999, max: 99 });
    expect(a).toBe(b);
  });

  it('uses the in-memory store outside production (dev/test fallback)', () => {
    registryOf()?.delete('test-backend-a');
    const limiter = getRateLimiter('test-backend-a', { windowMs: 1000, max: 1 });
    expect(limiter).toBeInstanceOf(SlidingWindowRateLimiter);
  });

  it('uses the shared Postgres store in production with a DATABASE_URL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgres://example');
    registryOf()?.delete('test-backend-b');
    const limiter = getRateLimiter('test-backend-b', { windowMs: 1000, max: 1 });
    expect(limiter).toBeInstanceOf(SharedWindowRateLimiter);
  });

  it('honors the RATE_LIMIT_STORE=memory override even in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgres://example');
    vi.stubEnv('RATE_LIMIT_STORE', 'memory');
    registryOf()?.delete('test-backend-c');
    const limiter = getRateLimiter('test-backend-c', { windowMs: 1000, max: 1 });
    expect(limiter).toBeInstanceOf(SlidingWindowRateLimiter);
  });
});

describe('clientKey', () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request('http://x.local/', { headers });

  it('prefers the authenticated user id', () => {
    expect(clientKey(request({ 'x-forwarded-for': '1.2.3.4' }), 'user-1')).toBe('user:user-1');
  });

  it('falls back to the first x-forwarded-for hop', () => {
    expect(clientKey(request({ 'x-forwarded-for': ' 9.8.7.6 , 10.0.0.1' }))).toBe('ip:9.8.7.6');
  });

  it('degrades to a shared anonymous bucket', () => {
    expect(clientKey(request())).toBe('anonymous');
  });
});

describe('enforceRateLimit', () => {
  it('throws ApiError 429 with Retry-After seconds when blocked', async () => {
    const clock = fixedClock();
    const limiter = new SlidingWindowRateLimiter({ windowMs: 30_000, max: 1, now: clock.now });
    await enforceRateLimit(limiter, 'k');
    try {
      await enforceRateLimit(limiter, 'k');
      expect.unreachable('expected 429');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(429);
      expect((err as ApiError).retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });

  it('awaits async (shared-store) decisions before deciding', async () => {
    const limiter = new SharedWindowRateLimiter('t-enforce', { windowMs: 30_000, max: 1 });
    mocks.sql.mockResolvedValueOnce([{ count: 5, retry_after: 7 }]);
    await expect(enforceRateLimit(limiter, 'k')).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 7,
    });
  });
});
