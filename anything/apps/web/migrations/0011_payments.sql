-- 0011_payments.sql — P8: Stripe Connect scaffolding + payout ledger.
--
-- Money is INTEGER CENTS everywhere; the 5% fee is server-computed and
-- CHECK-enforced to reconcile (gross = fee + net) so a tampered write can't
-- even reach disk. We store only Stripe identifiers — never PANs/IBANs
-- (SAQ-A posture, TENANT_GUARDRAIL §6.4).
--
-- User columns are ON DELETE SET NULL, not CASCADE: financial records must
-- survive account erasure (7-year carve-out) — anonymized, not destroyed
-- (retention.md).

CREATE TABLE IF NOT EXISTS payouts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  gig_id UUID REFERENCES gigs(id) ON DELETE SET NULL,
  venue_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  talent_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  gross_cents INTEGER NOT NULL CHECK (gross_cents >= 0),
  fee_cents INTEGER NOT NULL CHECK (fee_cents >= 0),
  net_cents INTEGER NOT NULL CHECK (net_cents >= 0),
  CONSTRAINT payouts_money_reconciles CHECK (gross_cents = fee_cents + net_cents),
  stripe_charge_id TEXT,
  stripe_transfer_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'HELD', 'RELEASED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payouts_venue ON payouts(venue_user_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_talent ON payouts(talent_user_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_release_queue
  ON payouts(status, created_at) WHERE status = 'HELD';

-- Connect Express account linkage (one per user).
CREATE TABLE IF NOT EXISTS stripe_accounts (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL UNIQUE,
  onboarded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook replay guard: the PRIMARY KEY *is* the idempotency mechanism —
-- a replayed event id fails the insert and is dropped before any handler runs.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payouts_participant_read ON payouts;
CREATE POLICY payouts_participant_read ON payouts
  FOR SELECT
  USING (
    venue_user_id = current_setting('app.user_id', true)
    OR talent_user_id = current_setting('app.user_id', true)
    OR current_setting('app.role', true) = 'ADMIN'
  );
-- INSERTs come from the checkout flow (service context); no user-facing
-- UPDATE/DELETE policies — the ledger is effectively append-only for users.

ALTER TABLE stripe_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stripe_accounts_own ON stripe_accounts;
CREATE POLICY stripe_accounts_own ON stripe_accounts
  FOR ALL
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

-- stripe_events is service-internal: no user policies at all (deny-by-default
-- under the enforcing role; the webhook runs before any user context exists).
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

-- Tighten the app role's privileges where it exists (mirrors 0006's block).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    -- The ledger's money columns are frozen after insert: the app role may
    -- only ever touch status/stripe-id/release bookkeeping.
    REVOKE UPDATE ON payouts FROM afterdark_app;
    GRANT UPDATE (status, stripe_charge_id, stripe_transfer_id, released_at)
      ON payouts TO afterdark_app;
    REVOKE DELETE ON payouts FROM afterdark_app;
    REVOKE UPDATE, DELETE ON stripe_events FROM afterdark_app;
    RAISE NOTICE 'payout ledger privileges tightened for afterdark_app';
  END IF;
END
$$;
