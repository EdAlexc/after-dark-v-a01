/**
 * Append-only audit trail (TENANT_GUARDRAIL §5 A09; PRD Admin p1 audit feed).
 *
 * Every state-changing action records who did what to which entity. Metadata
 * is PII-redacted before persisting. Recording NEVER throws — an audit
 * failure must not take the user action down with it (it is logged instead).
 *
 * Table: audit_logs (migrations/0002_audit_logs.sql).
 */

import sql from './sql';
import { Logger, logger, redactPii } from './logger';

export interface AuditEvent {
  actorId: string;
  action:
    | 'role.set'
    | 'gig.create'
    | 'profile.talent.update'
    | 'profile.venue.update'
    | 'settings.update'
    | 'password.change'
    | '2fa.enable'
    | '2fa.disable'
    | (string & {});
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

export class AuditLogger {
  constructor(
    private readonly deps: { sql: SqlTag; logger: Logger } = {
      sql: sql as unknown as SqlTag,
      logger: logger.child('audit'),
    }
  ) {}

  /** Fire-and-forget safe: resolves `false` (and logs) on failure. */
  async record(event: AuditEvent): Promise<boolean> {
    try {
      const metadata = JSON.stringify(redactPii(event.metadata ?? {}));
      await this.deps.sql`
        INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
        VALUES (${event.actorId}, ${event.action}, ${event.entityType}, ${event.entityId ?? null}, ${metadata}::jsonb)
      `;
      return true;
    } catch (error) {
      this.deps.logger.error('audit record failed', { action: event.action, error });
      return false;
    }
  }
}

/** Shared default instance for route handlers. */
export const auditLogger = new AuditLogger();
