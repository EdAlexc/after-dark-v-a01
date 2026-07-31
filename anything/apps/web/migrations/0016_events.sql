-- 0016_events.sql — S6: append-only marketplace event capture (Backlog #14).
--
-- Why a table instead of deriving from gigs/applications: statuses mutate in
-- place (PUBLISHED→FILLED overwrites), so "when was it published / when was
-- it filled" is unrecoverable after the fact. Events freeze those instants,
-- which is exactly what the venue KPIs (avg time-to-hire, filling rate, and
-- their month-over-month trends) need.
--
-- Privacy stance (the S6 gate): rows carry entity ids and timestamps only —
-- no user ids, no free text, no payload PII. `payload` exists for
-- non-identifying dimensions (e.g. role_needed) and is size-checked.
-- Retention: operational analytics, covered by docs/retention.md §1 as
-- platform telemetry (no data-subject linkage to erase).

CREATE TABLE IF NOT EXISTS events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind TEXT NOT NULL CHECK (char_length(kind) <= 60),
  -- Tenant dimension for venue KPIs; NULL for platform-wide events.
  venue_id UUID REFERENCES venue_profiles(id) ON DELETE SET NULL,
  gig_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (pg_column_size(payload) <= 2048),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KPI aggregations scan (venue, kind, time); the join key for time-to-hire
-- pairs is (gig_id, kind).
CREATE INDEX IF NOT EXISTS idx_events_venue_kind_time
  ON events (venue_id, kind, created_at);
CREATE INDEX IF NOT EXISTS idx_events_gig_kind
  ON events (gig_id, kind);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Venues read their own events (their KPIs); platform context reads all.
-- INSERT is open to any request context — events are emitted from whichever
-- side performs the action (talent applies, venue hires) — but UPDATE/DELETE
-- have no policy at all: append-only by policy, and by privilege below.

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_venue_read ON events;
CREATE POLICY events_venue_read ON events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM venue_profiles vp
      WHERE vp.id = events.venue_id
        AND vp.user_id = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS events_platform_read ON events;
CREATE POLICY events_platform_read ON events
  FOR SELECT
  USING (current_setting('app.role', true) IN ('ADMIN', 'SERVICE'));

DROP POLICY IF EXISTS events_insert_any_context ON events;
CREATE POLICY events_insert_any_context ON events
  FOR INSERT
  WITH CHECK (
    current_setting('app.user_id', true) IS NOT NULL
    AND current_setting('app.user_id', true) <> ''
  );

-- Least-privilege role (when it exists — see scripts/grants.sql, the living
-- re-runnable set): append + read only, never rewrite history.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    GRANT SELECT, INSERT ON events TO afterdark_app;
    REVOKE UPDATE, DELETE ON events FROM afterdark_app;
    RAISE NOTICE 'GRANTed append-only events access to afterdark_app';
  END IF;
END $$;
