-- 0023_venue_directory.sql — S19 PARTY persona completion.
--
-- The public venue directory (§6.3: party people "browse venues to book for
-- private parties") adds a venues arm to global search. Same doctrine as
-- 0015: the GIN index matches the search builder's tsvector expression
-- verbatim so the planner can use it. No new tables and no RLS change —
-- venue_profiles' public-read policy (0004) already covers directory reads,
-- and the routes project public columns only.

CREATE INDEX IF NOT EXISTS idx_venue_profiles_fts
  ON venue_profiles USING GIN (
    to_tsvector('english', coalesce(venue_name, '') || ' ' || coalesce(description, ''))
  );

-- Directory default ordering (rating first, then name) on the listed subset.
CREATE INDEX IF NOT EXISTS idx_venue_profiles_directory
  ON venue_profiles (rating DESC NULLS LAST, venue_name)
  WHERE venue_name IS NOT NULL AND venue_name <> '';
