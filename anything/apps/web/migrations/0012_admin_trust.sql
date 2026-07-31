-- 0012_admin_trust.sql — P9 admin & trust (DEV_TIMELINE P9, wireframe p1).
--
-- 1. Account suspension: `suspended_at` on "user". AuthGuard turns any
--    non-NULL value into a 403 on every authenticated request (except the
--    GDPR self-service routes — suspension must not block data-subject
--    rights). The reason is shown to the suspended user and recorded in the
--    audit trail; admin identity lives in audit_logs, not on the row.
-- 2. Report triage bookkeeping: who reviewed a report and what they decided,
--    so the moderation queue has an owner trail (wireframe p1 Reports Triage).
--
-- No new tables. The reports/audit_logs surfaces P9 reads already exist
-- (0008/0002) and carry their RLS policies; "user" is deliberately not
-- RLS-governed (better-auth manages it pre-session) and the app role already
-- holds UPDATE on it from 0006.

-- ─── 1. Suspension ────────────────────────────────────────────────────────────

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMPTZ;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "suspended_reason" TEXT;

-- The admin user-management table filters on suspension state.
CREATE INDEX IF NOT EXISTS idx_user_suspended ON "user"(suspended_at)
  WHERE suspended_at IS NOT NULL;

-- ─── 2. Report triage bookkeeping ─────────────────────────────────────────────

ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by TEXT
  REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_note TEXT;

-- Triage queue ordering: open-first, newest inside each severity.
CREATE INDEX IF NOT EXISTS idx_reports_triage ON reports(status, created_at DESC);
