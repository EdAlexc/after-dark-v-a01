-- 0006_compliance_spine.sql — P2 trust & compliance spine.
--
-- Two independent concerns, one migration because both are tiny and neither
-- carries data risk:
--
--   1. Age gating (TENANT_GUARDRAIL §4.2 G12): record the 18+ attestation on
--      the user, and give gigs an explicit age requirement so the 21+ flag the
--      wireframe (p3/p4) shows is real data rather than copy.
--   2. RLS role GRANTs (§6.2, Backlog #25 / DEV_TIMELINE P2.4): the policies
--      from 0004 are inert while the app connects as the table owner. This
--      grants the least-privilege role the app will connect as instead.

-- ─── 1. Age gating ────────────────────────────────────────────────────────────

-- When the user attested to being 18+. NULL = legacy account created before
-- the gate; the app treats NULL as "not yet attested" and re-prompts.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "age_confirmed_at" TIMESTAMPTZ;

-- Minimum age to work the gig. 18 = platform floor, 21 = alcohol-service /
-- 21+ room. Constrained rather than free-form so the UI can trust it.
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS age_requirement INTEGER NOT NULL DEFAULT 18;
ALTER TABLE gigs DROP CONSTRAINT IF EXISTS gigs_age_requirement_check;
ALTER TABLE gigs ADD CONSTRAINT gigs_age_requirement_check
  CHECK (age_requirement IN (18, 21));

-- ─── 2. Least-privilege role GRANTs (RLS activation) ──────────────────────────
--
-- The role itself is created out-of-band (Neon generates the password — it must
-- never live in git):
--
--   Neon Console → Roles → New Role → name it `afterdark_app`
--   …or: neonctl roles create --name afterdark_app
--
-- This block is a no-op until that role exists, so the migration is safe to run
-- everywhere and stays idempotent. Re-run it after creating the role.
--
-- Note the deliberate asymmetry: DML only, never DDL, and *no* BYPASSRLS — that
-- is the entire point. The owner role keeps running migrations.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    GRANT USAGE ON SCHEMA public TO afterdark_app;

    -- App tables (RLS-governed by 0004) + better-auth tables (not RLS-governed:
    -- the auth library must manage them before a session exists).
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      talent_profiles, venue_profiles, gigs, audit_logs,
      "user", "session", "account", "verification", "twoFactor"
      TO afterdark_app;

    -- audit_logs is append-only by policy; make it append-only by privilege too.
    REVOKE UPDATE, DELETE ON audit_logs FROM afterdark_app;

    -- Identity sequences (audit_logs.id).
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO afterdark_app;

    -- Future tables (P3+ applications/messages/shifts) inherit these grants, so
    -- later slices don't silently ship an unreadable table.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO afterdark_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO afterdark_app;

    RAISE NOTICE 'GRANTed least-privilege access to afterdark_app';
  ELSE
    RAISE NOTICE 'role afterdark_app not found — skipping GRANTs (see migration header)';
  END IF;
END
$$;
