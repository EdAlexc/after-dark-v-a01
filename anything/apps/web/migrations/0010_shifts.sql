-- 0010_shifts.sql — P7: live ops. A shift is born when a venue HIRES an
-- application (P3.2) and drives check-in/out (wireframes p8/p10).
--
-- agreed_rate_cents snapshots the rate at hire time: later rate negotiation
-- or gig edits must never rewrite what someone already worked under.

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES talent_profiles(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  agreed_rate_cents INTEGER NOT NULL CHECK (agreed_rate_cents >= 0),
  call_time TIMESTAMPTZ,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  shift_pay_cents INTEGER CHECK (shift_pay_cents IS NULL OR shift_pay_cents >= 0),
  status TEXT NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'IN_TRANSIT', 'CHECKED_IN', 'CHECKED_OUT', 'PAID')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One live shift per talent per gig.
  CONSTRAINT shifts_gig_talent_unique UNIQUE (gig_id, talent_id)
);

CREATE INDEX IF NOT EXISTS idx_shifts_gig ON shifts(gig_id, status);
CREATE INDEX IF NOT EXISTS idx_shifts_talent ON shifts(talent_id, call_time);

-- Idempotency ledger (§6.3): every transition request carries a client key;
-- the unique constraint makes replays (double-taps, retried requests at the
-- midnight burst) structurally impossible to double-apply.
CREATE TABLE IF NOT EXISTS shift_transitions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shift_transitions_idempotent UNIQUE (shift_id, idempotency_key)
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shifts_talent_own ON shifts;
CREATE POLICY shifts_talent_own ON shifts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM talent_profiles tp
      WHERE tp.id = shifts.talent_id
        AND tp.user_id = current_setting('app.user_id', true)
    )
  );
DROP POLICY IF EXISTS shifts_venue_own ON shifts;
CREATE POLICY shifts_venue_own ON shifts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM gigs g JOIN venue_profiles vp ON vp.id = g.venue_id
      WHERE g.id = shifts.gig_id
        AND vp.user_id = current_setting('app.user_id', true)
    )
  );

ALTER TABLE shift_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shift_transitions_participant ON shift_transitions;
CREATE POLICY shift_transitions_participant ON shift_transitions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM shifts s WHERE s.id = shift_transitions.shift_id)
  )
  WITH CHECK (actor_id = current_setting('app.user_id', true));
