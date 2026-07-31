-- 0013_shared_rate_limits.sql — S1 serverless security spine (Backlog #21, was P10.3).
--
-- Two stores, one per rate-limiting layer:
--
--  1. rate_limit_counters — backs the app's own `getRateLimiter`
--     (api/utils/rate-limit.ts). Fixed-window counters keyed
--     (bucket, window_start); the check is a single atomic UPSERT, so limits
--     hold across serverless instances. Buckets embed the caller key
--     (`user:<id>` / `ip:<addr>`), so rows are short-lived operational data:
--     the daily retention purge (S2) deletes expired windows — nothing here
--     is kept beyond the day.
--  2. "rateLimit" — better-auth's own storage model (auth.ts
--     `rateLimit.storage: 'database'`), covering the credential endpoints
--     (sign-in/up, 2FA) with the same cross-instance guarantee. Shape and
--     camelCase naming are fixed by better-auth (key/count/lastRequest);
--     UNIQUE(key) is what makes its create-conflict retry path atomic.
--
-- RLS stance: both tables are deliberately NOT row-secured, same doctrine as
-- better-auth's own tables (0004 header) — they must be writable before any
-- user context exists (anonymous sign-in attempts are precisely the rows that
-- matter), contain no tenant data, and are purged daily.

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

-- The retention purge deletes by window age.
CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_window
  ON rate_limit_counters (window_start);

CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL DEFAULT 0,
  "lastRequest" BIGINT NOT NULL DEFAULT 0
);

-- Least-privilege role (when it exists — see 0006 / docs/rls-cutover.md):
-- full DML on both stores; enforcement code must read and write them with no
-- user in context.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_counters, "rateLimit"
      TO afterdark_app;
    RAISE NOTICE 'GRANTed rate-limit store access to afterdark_app';
  END IF;
END
$$;
