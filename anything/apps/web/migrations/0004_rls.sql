-- 0004_rls.sql — Row-Level Security policies (TENANT_GUARDRAIL §6.2,
-- DEV_TIMELINE task 5 "RLS policies").
--
-- Defense-in-depth staging, applied in two steps:
--
--   1. THIS MIGRATION enables RLS and installs policies keyed on the
--      per-request settings `app.user_id` / `app.role` (set via
--      src/app/api/utils/rls.ts). Table OWNERS bypass non-forced RLS, so
--      while the app connects as the Neon owner role these policies are
--      dormant — zero behavior change today.
--   2. ACTIVATION (ops step, not committable — needs a role credential):
--      create a dedicated non-owner role, GRANT table access, point
--      DATABASE_URL at it. From that moment every query is subject to
--      these policies, and any route that forgets to set the context reads
--      only public rows and writes nothing.
--
-- better-auth's own tables ("user", session, account, verification) stay
-- out of RLS: the auth library must manage them pre-session, and the app
-- only touches them through narrow parameterized queries.

-- ── talent_profiles: public directory read, owner-only writes ────────────────
ALTER TABLE talent_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_profiles_public_read ON talent_profiles;
CREATE POLICY talent_profiles_public_read ON talent_profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS talent_profiles_owner_write ON talent_profiles;
CREATE POLICY talent_profiles_owner_write ON talent_profiles
  FOR ALL
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

-- ── venue_profiles: public read (venue cards), owner-only writes ─────────────
ALTER TABLE venue_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_profiles_public_read ON venue_profiles;
CREATE POLICY venue_profiles_public_read ON venue_profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS venue_profiles_owner_write ON venue_profiles;
CREATE POLICY venue_profiles_owner_write ON venue_profiles
  FOR ALL
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

-- ── gigs: only PUBLISHED are world-readable; the owning venue does the rest ──
ALTER TABLE gigs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gigs_public_read ON gigs;
CREATE POLICY gigs_public_read ON gigs
  FOR SELECT USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS gigs_owner_all ON gigs;
CREATE POLICY gigs_owner_all ON gigs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM venue_profiles vp
      WHERE vp.id = gigs.venue_id
        AND vp.user_id = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM venue_profiles vp
      WHERE vp.id = gigs.venue_id
        AND vp.user_id = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS gigs_admin_read ON gigs;
CREATE POLICY gigs_admin_read ON gigs
  FOR SELECT USING (current_setting('app.role', true) = 'ADMIN');

-- ── audit_logs: append-only; only ADMIN context may read; no update/delete ───
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_append ON audit_logs;
CREATE POLICY audit_logs_append ON audit_logs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS audit_logs_admin_read ON audit_logs;
CREATE POLICY audit_logs_admin_read ON audit_logs
  FOR SELECT USING (current_setting('app.role', true) = 'ADMIN');
-- Deliberately no UPDATE/DELETE policies: under an enforcing role the
-- audit trail is immutable (append-only ledger, §5 A09).
