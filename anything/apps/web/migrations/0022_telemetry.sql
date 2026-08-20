-- 0022_telemetry.sql — S18: first-party RUM + per-endpoint API timings (Q5/D6).
--
-- Two append-only telemetry stores behind the admin observability cards:
--   rum_events  — Core Web Vitals beacons from real visitors (first-party,
--                 G11-clean: no third-party collector, no cookies involved).
--   api_timings — per-request route timings captured by withRoute, keyed by
--                 the route-kit name (bounded cardinality, never a URL).
--
-- Privacy stance (the S18 gate): NO user ids, NO session linkage, NO free
-- text, NO raw URLs. RUM paths are normalized to route shapes ("/gigs/[id]")
-- and validated against a strict pattern server-side; api_timings carries
-- only the declared route name + method/status/duration. Both tables are
-- platform telemetry under docs/retention.md (30-day purge, S18).
--
-- Both tables are written EXCLUSIVELY through the SERVICE context (the
-- ingest route validates anonymous beacons first; the timing hook runs
-- outside any user context) — so INSERT policies accept the service role
-- only, and reads are ADMIN/SERVICE.

CREATE TABLE IF NOT EXISTS rum_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metric TEXT NOT NULL CHECK (metric IN ('LCP', 'CLS', 'INP', 'FCP', 'TTFB')),
  value DOUBLE PRECISION NOT NULL CHECK (value >= 0 AND value < 10000000),
  rating TEXT NOT NULL CHECK (rating IN ('good', 'needs-improvement', 'poor')),
  -- Normalized route shape, never a raw URL (ids collapse to "[id]").
  path TEXT NOT NULL CHECK (char_length(path) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rum_metric_time ON rum_events (metric, created_at);

CREATE TABLE IF NOT EXISTS api_timings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The withRoute name ('gigs.create'), NOT a URL — bounded cardinality.
  route TEXT NOT NULL CHECK (char_length(route) <= 60),
  method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PATCH', 'PUT', 'DELETE')),
  status SMALLINT NOT NULL CHECK (status BETWEEN 100 AND 599),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_timings_route_time ON api_timings (route, created_at);
CREATE INDEX IF NOT EXISTS idx_api_timings_time ON api_timings (created_at);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE rum_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_timings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rum_events_platform_read ON rum_events;
CREATE POLICY rum_events_platform_read ON rum_events
  FOR SELECT
  USING (current_setting('app.role', true) IN ('ADMIN', 'SERVICE'));

DROP POLICY IF EXISTS rum_events_service_insert ON rum_events;
CREATE POLICY rum_events_service_insert ON rum_events
  FOR INSERT
  WITH CHECK (current_setting('app.role', true) = 'SERVICE');

DROP POLICY IF EXISTS api_timings_platform_read ON api_timings;
CREATE POLICY api_timings_platform_read ON api_timings
  FOR SELECT
  USING (current_setting('app.role', true) IN ('ADMIN', 'SERVICE'));

DROP POLICY IF EXISTS api_timings_service_insert ON api_timings;
CREATE POLICY api_timings_service_insert ON api_timings
  FOR INSERT
  WITH CHECK (current_setting('app.role', true) = 'SERVICE');

-- The daily retention purge (G7) prunes 30-day windows under the SERVICE
-- context — the ONLY delete path; nothing else may remove telemetry.
DROP POLICY IF EXISTS rum_events_service_delete ON rum_events;
CREATE POLICY rum_events_service_delete ON rum_events
  FOR DELETE
  USING (current_setting('app.role', true) = 'SERVICE');

DROP POLICY IF EXISTS api_timings_service_delete ON api_timings;
CREATE POLICY api_timings_service_delete ON api_timings
  FOR DELETE
  USING (current_setting('app.role', true) = 'SERVICE');

-- Append-only by privilege too (mirrors events, 0016).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    GRANT SELECT, INSERT ON rum_events, api_timings TO afterdark_app;
    REVOKE UPDATE ON rum_events, api_timings FROM afterdark_app;
    -- DELETE stays granted: the daily retention purge prunes 30-day windows.
    RAISE NOTICE 'GRANTed append-only telemetry access to afterdark_app';
  END IF;
END $$;
