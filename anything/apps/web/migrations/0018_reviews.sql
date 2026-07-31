-- 0018_reviews.sql — S8 trust & reviews (Backlog #8).
--
-- Reviews are SHIFT-scoped: only the two real counterparties of a completed
-- (checked-out) shift may review each other, one review per direction. That
-- kills drive-by/rating-bomb reviews structurally — no shift, no review —
-- and the UNIQUE(shift_id, direction) makes "one per direction" a DB fact
-- rather than an application promise.
--
-- venue_id/talent_id are copied from the shift's gig at write time so the
-- public aggregates (venue rating, talent trust score) are one indexed
-- GROUP BY away, and so the row survives later gig edits unchanged.

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('TALENT_TO_VENUE', 'VENUE_TO_TALENT')),
  reviewer_user_id TEXT NOT NULL,
  venue_id UUID NOT NULL REFERENCES venue_profiles(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES talent_profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reviews_one_per_direction UNIQUE (shift_id, direction)
);

CREATE INDEX IF NOT EXISTS idx_reviews_venue
  ON reviews (venue_id, direction, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_talent
  ON reviews (talent_id, direction, created_at);

-- Aggregates live on the profiles (server-recomputed inside the review
-- transaction — the S8 gate: scores are never client input).
ALTER TABLE venue_profiles
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE talent_profiles
  ADD COLUMN IF NOT EXISTS rating NUMERIC,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trust_score INTEGER
    CHECK (trust_score IS NULL OR (trust_score BETWEEN 0 AND 100));

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Reviews are public marketplace content (venue cards and talent cards show
-- them) — world-readable, XSS-inertness is the rendering layer's job.
-- Writing: you may only author AS yourself, in a direction that matches
-- your real side of that shift. The participation subqueries ride the
-- shifts/gigs policies (acyclic: nothing references reviews back).

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_public_read ON reviews;
CREATE POLICY reviews_public_read ON reviews
  FOR SELECT USING (true);

DROP POLICY IF EXISTS reviews_counterparty_insert ON reviews;
CREATE POLICY reviews_counterparty_insert ON reviews
  FOR INSERT
  WITH CHECK (
    reviewer_user_id = current_setting('app.user_id', true)
    AND (
      (direction = 'VENUE_TO_TALENT' AND EXISTS (
        SELECT 1 FROM shifts s
        JOIN gigs g ON g.id = s.gig_id
        JOIN venue_profiles vp ON vp.id = g.venue_id
        WHERE s.id = reviews.shift_id
          AND vp.user_id = current_setting('app.user_id', true)
      ))
      OR
      (direction = 'TALENT_TO_VENUE' AND EXISTS (
        SELECT 1 FROM shifts s
        JOIN talent_profiles tp ON tp.id = s.talent_id
        WHERE s.id = reviews.shift_id
          AND tp.user_id = current_setting('app.user_id', true)
      ))
    )
  );

-- No UPDATE policy: reviews are immutable once posted (moderation removes
-- via platform context if a report is upheld).
DROP POLICY IF EXISTS reviews_platform_all ON reviews;
CREATE POLICY reviews_platform_all ON reviews
  FOR ALL
  USING (current_setting('app.role', true) IN ('ADMIN', 'SERVICE'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'SERVICE'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    GRANT SELECT, INSERT, DELETE ON reviews TO afterdark_app;
    REVOKE UPDATE ON reviews FROM afterdark_app;
    RAISE NOTICE 'GRANTed reviews access to afterdark_app';
  END IF;
END $$;
