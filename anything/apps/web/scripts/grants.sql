-- The COMPLETE least-privilege GRANT set for the afterdark_app role
-- (docs/rls-cutover.md step 2). Run via `yarn db:grants` with an OWNER
-- connection, any time, as often as needed — it is idempotent and safe.
--
-- Why this exists: migrations 0006/0011/0013/0014 carry the same grants, but
-- the runner is forward-only — if the role is created AFTER those migrations
-- were applied, their conditional GRANT blocks already ran as no-ops and will
-- never run again. This file is the living, re-runnable source of truth; the
-- migration copies are frozen history for fresh databases.
--
-- Errors loudly (no IF EXISTS guard): running it before the role exists is a
-- runbook-order mistake worth surfacing, not skipping.

GRANT USAGE ON SCHEMA public TO afterdark_app;

-- App tables (RLS-governed) + better-auth tables (not RLS-governed: the auth
-- library must manage them before a session exists) + infra stores.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  talent_profiles, venue_profiles, gigs, audit_logs,
  applications, notifications,
  conversations, messages, reports,
  availabilities,
  shifts, shift_transitions,
  payouts, stripe_accounts, stripe_events,
  legal_holds,
  events,
  reviews,
  push_subscriptions,
  rate_limit_counters, "rateLimit",
  "user", "session", "account", "verification", "twoFactor"
  TO afterdark_app;

-- Event capture (0016) is append-only history — never rewritten.
REVOKE UPDATE, DELETE ON events FROM afterdark_app;

-- Reviews (0018) are immutable once posted; DELETE stays for moderation
-- takedowns (policy-gated to platform context).
REVOKE UPDATE ON reviews FROM afterdark_app;

-- audit_logs is append-only by policy; append-only by privilege too — except
-- the erasure pseudonym rewrite, which is column-scoped to actor_id (0014)
-- and policy-gated to SERVICE context.
REVOKE UPDATE, DELETE ON audit_logs FROM afterdark_app;
GRANT UPDATE (actor_id) ON audit_logs TO afterdark_app;

-- The payout ledger's money columns are frozen after insert (0011): the app
-- role may only ever touch status/stripe-id/release bookkeeping.
REVOKE UPDATE ON payouts FROM afterdark_app;
GRANT UPDATE (status, stripe_charge_id, stripe_transfer_id, released_at)
  ON payouts TO afterdark_app;
REVOKE DELETE ON payouts FROM afterdark_app;

-- Webhook replay guard rows are immutable once written.
REVOKE UPDATE, DELETE ON stripe_events FROM afterdark_app;

-- The RLS applicant carve-out helper (0014) — SECURITY DEFINER, so EXECUTE
-- is the only privilege the app role needs.
GRANT EXECUTE ON FUNCTION app_user_has_application(UUID) TO afterdark_app;

-- The availability yes/no probe (0017) — same doctrine: boolean-only definer
-- so the browse boost and match counts survive the cutover without widening
-- calendar visibility.
GRANT EXECUTE ON FUNCTION app_talent_available_on(UUID, DATE) TO afterdark_app;

-- Identity sequences (audit_logs.id, payouts.id).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO afterdark_app;

-- Future tables inherit DML so later slices don't ship an unreadable table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO afterdark_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO afterdark_app;

-- S18 telemetry (0022): append-only + purge; history is never rewritten.
GRANT SELECT, INSERT, DELETE ON rum_events, api_timings TO afterdark_app;
REVOKE UPDATE ON rum_events, api_timings FROM afterdark_app;

-- S20 saved talent (0024): bookmarks toggle on and off — no UPDATE surface.
GRANT SELECT, INSERT, DELETE ON saved_talent TO afterdark_app;
REVOKE UPDATE ON saved_talent FROM afterdark_app;

-- S20 D3 response-rate aggregate (0024) — counts-only definer, same doctrine
-- as the availability probe.
GRANT EXECUTE ON FUNCTION app_venue_response_stats(UUID) TO afterdark_app;
