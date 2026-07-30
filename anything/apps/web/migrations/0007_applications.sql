-- 0007_applications.sql — P3: applications + shared notifications infra.
--
-- Money note: proposed rates are INTEGER CENTS (working agreement §11) — the
-- first money-bearing column in the schema sets the precedent P7/P8 follow.
-- NULL proposed_rate_cents = "accepts the gig's base rate".

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES talent_profiles(id) ON DELETE CASCADE,
  proposed_rate_cents INTEGER CHECK (proposed_rate_cents IS NULL OR proposed_rate_cents >= 0),
  cover_message TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SHORTLISTED', 'HIRED', 'REJECTED', 'WITHDRAWN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One application per talent per gig — re-applying revives the same row.
  CONSTRAINT applications_gig_talent_unique UNIQUE (gig_id, talent_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_gig_status ON applications(gig_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_talent_created
  ON applications(talent_id, created_at DESC);

-- Shared in-app notifications (P3.4). P5 messages and P7 shifts emit into
-- this same table — do not roll per-feature notification stores.
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

-- ─── RLS (per the P2.4 convention: every migration ships its policies) ────────

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- The applying talent owns the row…
DROP POLICY IF EXISTS applications_talent_own ON applications;
CREATE POLICY applications_talent_own ON applications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM talent_profiles tp
      WHERE tp.id = applications.talent_id
        AND tp.user_id = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM talent_profiles tp
      WHERE tp.id = applications.talent_id
        AND tp.user_id = current_setting('app.user_id', true)
    )
  );

-- …and the venue that owns the gig may read and review it (but never insert
-- one on a talent's behalf — reviews are UPDATEs).
DROP POLICY IF EXISTS applications_venue_review ON applications;
CREATE POLICY applications_venue_review ON applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM gigs g JOIN venue_profiles vp ON vp.id = g.venue_id
      WHERE g.id = applications.gig_id
        AND vp.user_id = current_setting('app.user_id', true)
    )
  );
DROP POLICY IF EXISTS applications_venue_update ON applications;
CREATE POLICY applications_venue_update ON applications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM gigs g JOIN venue_profiles vp ON vp.id = g.venue_id
      WHERE g.id = applications.gig_id
        AND vp.user_id = current_setting('app.user_id', true)
    )
  );

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_own ON notifications;
CREATE POLICY notifications_own ON notifications
  FOR ALL
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (true); -- the app inserts notifications *for other users* (e.g. "you were hired")
