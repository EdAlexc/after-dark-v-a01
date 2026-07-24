/**
 * In-memory sliding-window rate limiting (TENANT_GUARDRAIL §5 A04/A07, §6.3).
 *
 * Scope: per serverless instance / dev process. That is sufficient to blunt
 * brute-force against auth-adjacent endpoints for the alpha; a shared store
 * (Redis/Postgres) is tracked in DEV_TIMELINE → Technical Backlog #15.
 *
 * The clock is injectable so tests can drive window edges deterministically.
 */

import { ApiError } from './route-kit';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  now?: () => number;
  /** Entry cap to bound memory under key-spraying abuse. */
  maxKeys?: number;
}

export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly maxKeys: number;
  private readonly hits = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    if (options.windowMs <= 0 || !Number.isFinite(options.windowMs)) {
      throw new Error('windowMs must be a positive number');
    }
    if (options.max <= 0 || !Number.isInteger(options.max)) {
      throw new Error('max must be a positive integer');
    }
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

// ─── Shared registry (survives route-module reloads / HMR) ───────────────────

const globalRegistry = globalThis as unknown as {
  __afterdarkRateLimiters?: Map<string, SlidingWindowRateLimiter>;
};

/** Named singleton limiters, e.g. `getRateLimiter('2fa', { windowMs: 900_000, max: 5 })`. */
export function getRateLimiter(
  name: string,
  options: RateLimiterOptions
): SlidingWindowRateLimiter {
  const registry = (globalRegistry.__afterdarkRateLimiters ??= new Map());
  let limiter = registry.get(name);
  if (!limiter) {
    limiter = new SlidingWindowRateLimiter(options);
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
export function enforceRateLimit(limiter: SlidingWindowRateLimiter, key: string): void {
  const decision = limiter.check(key);
  if (!decision.allowed) {
    throw ApiError.tooManyRequests(decision.retryAfterSeconds, 'Too many attempts — slow down');
  }
}
