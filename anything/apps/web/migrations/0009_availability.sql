-- 0009_availability.sql — P6: availability calendar (3 slots/day per PRD)
-- + the Available Tonight boost flag on the public profile.

CREATE TABLE IF NOT EXISTS availabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID NOT NULL REFERENCES talent_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL
    CHECK (time_slot IN ('EARLY_EVENING', 'PRIME_TIME', 'AFTER_HOURS')),
  status TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'BOOKED', 'BLOCKED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT availabilities_unique_slot UNIQUE (talent_id, date, time_slot)
);

CREATE INDEX IF NOT EXISTS idx_availabilities_talent_date
  ON availabilities(talent_id, date);

-- Available Tonight (wireframes p7/p8): public flag, boosts browse ordering.
ALTER TABLE talent_profiles
  ADD COLUMN IF NOT EXISTS available_tonight BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Availability details are the talent's private calendar — venues see only
-- the public available_tonight flag and (later) conflict outcomes.

ALTER TABLE availabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS availabilities_talent_own ON availabilities;
CREATE POLICY availabilities_talent_own ON availabilities
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM talent_profiles tp
      WHERE tp.id = availabilities.talent_id
        AND tp.user_id = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM talent_profiles tp
      WHERE tp.id = availabilities.talent_id
        AND tp.user_id = current_setting('app.user_id', true)
    )
  );
