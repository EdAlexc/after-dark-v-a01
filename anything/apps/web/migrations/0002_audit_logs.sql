-- 0002_audit_logs.sql — append-only audit trail
-- (TENANT_GUARDRAIL §5 A09; PRD Admin "Audit Logs" feed; GDPR accountability).
--
-- Written by AuditLogger (src/app/api/utils/audit.ts). Metadata is
-- PII-redacted before insert. Rows are never updated or deleted by the app;
-- retention/pseudonymization is a scheduled job (TENANT_GUARDRAIL §4 G7).

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
