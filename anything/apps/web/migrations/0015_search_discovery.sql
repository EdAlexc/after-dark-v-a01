-- 0015_search_discovery.sql — S5 search & discovery (Backlog #7, #27, #28).
--
-- Postgres FTS for the global "search gigs or talent" surface. Expression
-- GIN indexes (no stored tsvector column) — the query side must use the
-- exact same expression to hit them (api/utils/search-query.ts does).
--
-- Search is public-read only: it serves PUBLISHED gigs and stage-named
-- talent profiles, the same projection the existing public listings expose.
-- The RLS public-read policies from 0004 already cover those rows, so no
-- new policies are needed and the route (like gigs.list) runs unwrapped.
--
-- Multi-value filters (#27) and the availability boost (#28) are pure
-- query-side changes — no schema here beyond the indexes; the boost's
-- per-day probe is covered by 0009's UNIQUE (talent_id, date, time_slot).

CREATE INDEX IF NOT EXISTS idx_gigs_fts
  ON gigs USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  );

CREATE INDEX IF NOT EXISTS idx_talent_profiles_fts
  ON talent_profiles USING GIN (
    to_tsvector('english', coalesce(stage_name, '') || ' ' || coalesce(bio, ''))
  );
