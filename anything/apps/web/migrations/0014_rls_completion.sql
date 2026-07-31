-- 0014_rls_completion.sql — S2: the policy set the RLS cutover actually needs
-- (Backlog #25 remainder), plus the G7 legal-hold table.
--
-- 0004/0007–0011 enabled RLS everywhere with per-tenant policies, written
-- while the app still connects as the table owner (policies dormant). Tracing
-- every route against those policies for the cutover surfaced the gaps this
-- migration closes — each block names the route that breaks without it:
--
--  1. SERVICE/ADMIN platform context. The escrow cron must UPDATE payouts and
--     shifts, the Stripe webhook must write stripe_events/payouts, and ADMIN
--     moderation must read/write across tenants (authz-matrix declares ADMIN
--     ALLOW on every surface). None of that had a policy — post-cutover the
--     cron would silently release nothing. System paths run with
--     `app.role = 'SERVICE'` (api/utils/rls.ts serviceContext).
--  2. Gig visibility carve-outs. FILLED/COMPLETED gigs feed public venue
--     cards ("gigs hosted" count) and hired talents' deep links; an
--     applicant keeps reading the gig their application points at even after
--     it leaves PUBLISHED (unpublish/cancel) — the app has always behaved
--     this way (gigs/[id] carve-out); these policies stop the cutover from
--     breaking it.
--  3. messages mark-read. 0008's FOR ALL policy WITH CHECKs
--     `sender_id = app.user_id`, which blocks the recipient's read_at UPDATE
--     (you mark the OTHER side's messages read). Split into per-command
--     policies.
--  4. DSR routes. The export reads the caller's own audit rows (admin-only
--     until now); erasure pseudonymizes audit_logs.actor_id, which 0006
--     revoked wholesale — re-granted for that one column, writable only in
--     SERVICE context. Checkout INSERTs payouts in user context.
--  5. legal_holds (G7): rows that suspend the retention purge for a user (or
--     globally) during an incident/claim (docs/retention.md §5). Admin/service
--     only — the subjects of an investigation must not see the hold.

-- ─── 1. legal_holds ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- USER = suspend purge for one user's rows; GLOBAL = suspend every purge.
  scope TEXT NOT NULL DEFAULT 'USER' CHECK (scope IN ('USER', 'GLOBAL')),
  -- Loose reference on purpose: the hold must outlive the user row it names.
  user_id TEXT,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  CONSTRAINT legal_holds_user_scope CHECK (scope = 'GLOBAL' OR user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_active
  ON legal_holds (scope, user_id) WHERE released_at IS NULL;

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS legal_holds_platform ON legal_holds;
CREATE POLICY legal_holds_platform ON legal_holds
  FOR ALL
  USING (current_setting('app.role', true) IN ('ADMIN', 'SERVICE'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'SERVICE'));

-- ─── 2. Platform (ADMIN + SERVICE) context, per tenant table ──────────────────
-- audit_logs is deliberately excluded: append-only stays append-only (its
-- narrow pseudonymization write is §4 below).

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'talent_profiles', 'venue_profiles', 'gigs',
    'applications', 'notifications',
    'conversations', 'messages', 'reports',
    'availabilities',
    'shifts', 'shift_transitions',
    'payouts', 'stripe_accounts', 'stripe_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_platform_all ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_platform_all ON %I FOR ALL '
      || 'USING (current_setting(''app.role'', true) IN (''ADMIN'', ''SERVICE'')) '
      || 'WITH CHECK (current_setting(''app.role'', true) IN (''ADMIN'', ''SERVICE''))',
      t, t
    );
  END LOOP;
END
$$;
-- Note: payouts money columns stay frozen even for SERVICE — 0011's
-- column-scoped GRANT (status/stripe ids/released_at only) applies to the
-- role regardless of which policy admitted the row.

-- ─── 3. Gig visibility carve-outs ─────────────────────────────────────────────

-- Venue cards count FILLED/COMPLETED gigs ("gigs hosted"), talent bookings
-- join their FILLED gig's title, and hired talents deep-link to it. These
-- rows were public while PUBLISHED; their continued readability leaks
-- nothing new. The app layer still 404s non-applicants (gigs/[id]).
DROP POLICY IF EXISTS gigs_completed_public_read ON gigs;
CREATE POLICY gigs_completed_public_read ON gigs
  FOR SELECT USING (status IN ('FILLED', 'COMPLETED'));

-- An applicant keeps reading the gig behind their application in ANY status
-- (unpublish → DRAFT, takedown → CANCELLED must not 404 their dashboard).
--
-- SECURITY DEFINER is load-bearing, not a convenience: a plain EXISTS over
-- `applications` inside a `gigs` policy recurses — 0007's application
-- policies subquery `gigs` right back, and Postgres aborts every gigs read
-- with 42P17 "infinite recursion detected" (found live on the S2 verify
-- branch). The definer function runs as the table owner, whose reads bypass
-- RLS *inside the check only*, cutting the cycle. search_path is pinned and
-- the function is STABLE + narrowly scoped (boolean, no data egress).
CREATE OR REPLACE FUNCTION app_user_has_application(p_gig_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM applications a
    JOIN talent_profiles tp ON tp.id = a.talent_id
    WHERE a.gig_id = p_gig_id
      AND tp.user_id = current_setting('app.user_id', true)
  );
$fn$;

DROP POLICY IF EXISTS gigs_applicant_read ON gigs;
CREATE POLICY gigs_applicant_read ON gigs
  FOR SELECT USING (app_user_has_application(id));

-- ─── 4. messages: per-command policies (mark-read fix) ────────────────────────

DROP POLICY IF EXISTS messages_participant ON messages;

DROP POLICY IF EXISTS messages_participant_read ON messages;
CREATE POLICY messages_participant_read ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.venue_user_id = current_setting('app.user_id', true)
          OR c.counterpart_user_id = current_setting('app.user_id', true))
    )
  );

-- You may only author as yourself, into a thread you belong to.
DROP POLICY IF EXISTS messages_participant_insert ON messages;
CREATE POLICY messages_participant_insert ON messages
  FOR INSERT WITH CHECK (
    sender_id = current_setting('app.user_id', true)
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.venue_user_id = current_setting('app.user_id', true)
          OR c.counterpart_user_id = current_setting('app.user_id', true))
    )
  );

-- Participants may update rows in their thread (read_at on the counterpart's
-- messages); the row must stay in the thread. Column-level damage is bounded
-- by the app only ever setting read_at here.
DROP POLICY IF EXISTS messages_participant_update ON messages;
CREATE POLICY messages_participant_update ON messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.venue_user_id = current_setting('app.user_id', true)
          OR c.counterpart_user_id = current_setting('app.user_id', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.venue_user_id = current_setting('app.user_id', true)
          OR c.counterpart_user_id = current_setting('app.user_id', true))
    )
  );

-- ─── 5. DSR coverage ──────────────────────────────────────────────────────────

-- The Art. 15/20 export includes the caller's own audit trail.
DROP POLICY IF EXISTS audit_logs_own_read ON audit_logs;
CREATE POLICY audit_logs_own_read ON audit_logs
  FOR SELECT USING (actor_id = current_setting('app.user_id', true));

-- Erasure pseudonymizes actor_id before the user row is deleted
-- (account-data.ts, SERVICE context). This is the ONLY writable column and
-- the ONLY writing context; action/entity/metadata stay immutable.
DROP POLICY IF EXISTS audit_logs_service_pseudonymize ON audit_logs;
CREATE POLICY audit_logs_service_pseudonymize ON audit_logs
  FOR UPDATE
  USING (current_setting('app.role', true) = 'SERVICE')
  WITH CHECK (current_setting('app.role', true) = 'SERVICE');

-- Required by the pseudonymize UPDATE's RETURNING (and the purge job's
-- bookkeeping reads): under RLS, UPDATE … RETURNING additionally filters the
-- scan through SELECT policies — without a SERVICE-visible read, the erasure
-- rewrite silently matches zero rows (found live on the S2 verify branch).
-- Read-only for a system context; append-only is untouched.
DROP POLICY IF EXISTS audit_logs_service_read ON audit_logs;
CREATE POLICY audit_logs_service_read ON audit_logs
  FOR SELECT USING (current_setting('app.role', true) = 'SERVICE');

-- Checkout (user context) writes the HELD ledger row for its own shift.
DROP POLICY IF EXISTS payouts_participant_insert ON payouts;
CREATE POLICY payouts_participant_insert ON payouts
  FOR INSERT WITH CHECK (
    venue_user_id = current_setting('app.user_id', true)
    OR talent_user_id = current_setting('app.user_id', true)
  );

-- ─── 6. Role privileges (when the role exists — see scripts/grants.sql) ───────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON legal_holds TO afterdark_app;
    -- Narrow re-grant against 0006's blanket revoke: erasure may rewrite the
    -- actor pseudonym, nothing else, and only via the SERVICE-context policy.
    GRANT UPDATE (actor_id) ON audit_logs TO afterdark_app;
    GRANT EXECUTE ON FUNCTION app_user_has_application(UUID) TO afterdark_app;
    RAISE NOTICE 'GRANTed S2 privileges to afterdark_app';
  ELSE
    RAISE NOTICE 'role afterdark_app not found — run yarn db:grants after creating it';
  END IF;
END
$$;
