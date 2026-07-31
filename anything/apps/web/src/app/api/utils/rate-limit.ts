/**
 * Rate limiting (TENANT_GUARDRAIL §5 A04/A07, §6.3).
 *
 * Two backends behind one interface (S1 / Backlog #21, was P10.3):
 *
 *  - `SharedWindowRateLimiter` — a Postgres fixed-window counter
 *    (`rate_limit_counters`, migration 0013). One atomic UPSERT per check, so
 *    the limit holds across every serverless instance — per-instance limits
 *    are no limits under fan-out. Fixed windows admit ≤2× burst at a window
 *    boundary; that is accepted and documented here rather than paying a
 *    sliding-window's extra round trips on every request.
 *  - `SlidingWindowRateLimiter` — the original in-memory store, kept as the
 *    dev/test fallback (deterministic, no DB needed).
 *
 * `getRateLimiter` picks the backend: Postgres in production when
 * DATABASE_URL is set, in-memory otherwise. `RATE_LIMIT_STORE=memory|postgres`
 * overrides (emergency valve / local load tests). Call sites are unchanged
 * apart from `enforceRateLimit` now being awaited — checks can hit the DB.
 *
 * The DB path **fails open** on storage errors (logged loudly): a transient
 * DB failure already takes down every authed route, and answering 429 to
 * legitimate users during a blip would compound the outage. Stale windows are
 * purged by the daily retention job (S2).
 *
 * The clock is injectable so tests can drive window edges deterministically.
 */

import sql from './sql';
import { logger } from './logger';
import { ApiError } from './route-kit';

const log = logger.child('rate-limit');

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  now?: () => number;
  /** Entry cap to bound memory under key-spraying abuse (in-memory only). */
  maxKeys?: number;
}

/** Common surface of both backends; `check` may be sync (memory) or async (DB). */
export interface RateLimiter {
  check(key: string): RateLimitDecision | Promise<RateLimitDecision>;
  reset(key?: string): void | Promise<void>;
}

function validateOptions(options: RateLimiterOptions): void {
  if (options.windowMs <= 0 || !Number.isFinite(options.windowMs)) {
    throw new Error('windowMs must be a positive number');
  }
  if (options.max <= 0 || !Number.isInteger(options.max)) {
    throw new Error('max must be a positive integer');
  }
}

export class SlidingWindowRateLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly maxKeys: number;
  private readonly hits = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    validateOptions(options);
    this.windowMs = options.windowMs;
    this.max = options.max;
    this.now = options.now ?? Date.now;
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  /** Records an attempt for `key` and reports whether it is allowed. */
  check(key: string): RateLimitDecision {
    const now = this.now();
    const cutoff = now - this.windowMs;

    let timestamps = this.hits.get(key);
    if (!timestamps) {
      if (this.hits.size >= this.maxKeys) this.evictOldest();
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    // Drop attempts that fell out of the window.
    while (timestamps.length > 0 && timestamps[0] <= cutoff) timestamps.shift();

    if (timestamps.length >= this.max) {
      const retryAfterMs = timestamps[0] + this.windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    timestamps.push(now);
    return { allowed: true, remaining: this.max - timestamps.length, retryAfterSeconds: 0 };
  }

  reset(key?: string): void {
    if (key === undefined) this.hits.clear();
    else this.hits.delete(key);
  }

  private evictOldest(): void {
    const oldest = this.hits.keys().next();
    if (!oldest.done) this.hits.delete(oldest.value);
  }
}

/**
 * Postgres-backed fixed-window counter, shared across instances.
 *
 * One statement per check: an UPSERT increments the (bucket, window) row and
 * returns the running count — atomic under concurrency because the increment
 * happens inside the conflict clause, never read-modify-write in JS.
 */
export class SharedWindowRateLimiter implements RateLimiter {
  private readonly name: string;
  private readonly windowSeconds: number;
  private readonly max: number;

  constructor(name: string, options: RateLimiterOptions) {
    validateOptions(options);
    this.name = name;
    this.windowSeconds = Math.max(1, Math.round(options.windowMs / 1000));
    this.max = options.max;
  }

  async check(key: string): Promise<RateLimitDecision> {
    // Bucket is namespaced per limiter so 'gigs-create' and 'reports' never
    // share a counter for the same caller.
    const bucket = `${this.name}:${key}`;
    try {
      const rows = (await sql`
        INSERT INTO rate_limit_counters (bucket, window_start, count)
        VALUES (
          ${bucket},
          to_timestamp(floor(extract(epoch FROM now()) / ${this.windowSeconds}) * ${this.windowSeconds}),
          1
        )
        ON CONFLICT (bucket, window_start)
        DO UPDATE SET count = rate_limit_counters.count + 1
        RETURNING count,
          GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
            window_start + make_interval(secs => ${this.windowSeconds}) - now()
          ))))::int AS retry_after
      `) as Array<{ count: number; retry_after: number }>;
      const row = rows[0];
      if (!row) throw new Error('empty UPSERT result');
      if (row.count > this.max) {
        return { allowed: false, remaining: 0, retryAfterSeconds: row.retry_after };
      }
      return {
        allowed: true,
        remaining: Math.max(0, this.max - row.count),
        retryAfterSeconds: 0,
      };
    } catch (error) {
      // Fail open (see file header) — but never silently.
      log.warn('shared rate-limit check failed — failing open', { limiter: this.name, error });
      return { allowed: true, remaining: this.max, retryAfterSeconds: 0 };
    }
  }

  async reset(key?: string): Promise<void> {
    if (key === undefined) {
      await sql`DELETE FROM rate_limit_counters WHERE bucket LIKE ${this.name + ':%'}`;
    } else {
      await sql`DELETE FROM rate_limit_counters WHERE bucket = ${`${this.name}:${key}`}`;
    }
  }
}

// ─── Shared registry (survives route-module reloads / HMR) ───────────────────

const globalRegistry = globalThis as unknown as {
  __afterdarkRateLimiters?: Map<string, RateLimiter>;
};

/** True when checks should go to the shared Postgres store. */
function useSharedStore(): boolean {
  const override = process.env.RATE_LIMIT_STORE;
  if (override === 'memory') return false;
  if (override === 'postgres') return Boolean(process.env.DATABASE_URL);
  return process.env.NODE_ENV === 'production' && Boolean(process.env.DATABASE_URL);
}

/** Named singleton limiters, e.g. `getRateLimiter('2fa', { windowMs: 900_000, max: 5 })`. */
export function getRateLimiter(name: string, options: RateLimiterOptions): RateLimiter {
  const registry = (globalRegistry.__afterdarkRateLimiters ??= new Map());
  let limiter = registry.get(name);
  if (!limiter) {
    limiter = useSharedStore()
      ? new SharedWindowRateLimiter(name, options)
      : new SlidingWindowRateLimiter(options);
    registry.set(name, limiter);
  }
  return limiter;
}

/**
 * Rate-limit key for the calling client: user id when signed in, else the
 * first (client) hop of x-forwarded-for, else a shared bucket.
 */
export function clientKey(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim();
  return ip ? `ip:${ip}` : 'anonymous';
}

/** Throws 429 (with Retry-After) when the limiter rejects the key. */
export async function enforceRateLimit(limiter: RateLimiter, key: string): Promise<void> {
  const decision = await limiter.check(key);
  if (!decision.allowed) {
    throw ApiError.tooManyRequests(decision.retryAfterSeconds, 'Too many attempts — slow down');
  }
}
