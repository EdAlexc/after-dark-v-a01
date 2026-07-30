/**
 * PII scrubbing for Sentry events (DEV_TIMELINE task 5 / Backlog #19).
 *
 * Reuses the logger's `redactPii` (TENANT_GUARDRAIL §4/§5 A09) so the same
 * key-pattern policy governs logs and error tracking. Additionally drops the
 * fields Sentry fills with user identity — we keep only the user id, which
 * is enough to correlate with audit_logs without exporting PII to a third
 * party.
 *
 * Pure module: no Sentry import, so it unit-tests without the SDK.
 */

import { redactPii } from '@/app/api/utils/logger';

/** Structural subset of Sentry's ErrorEvent we operate on internally. The
 * public signature is generic over any object so the SDK's own event types
 * (which lack index signatures) assign without friction. */
interface ScrubbableEvent {
  user?: { id?: string | number; [key: string]: unknown };
  request?: { cookies?: unknown; headers?: unknown; [key: string]: unknown };
  contexts?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  breadcrumbs?: Array<Record<string, unknown>>;
  tags?: Record<string, unknown>;
}

export function scrubSentryEvent<E extends object>(event: E): E {
  if (!event || typeof event !== 'object') return event;
  const scrubbable = event as ScrubbableEvent;

  // Identity: keep only the id. Email/IP/username never leave the app.
  if (scrubbable.user && typeof scrubbable.user === 'object') {
    scrubbable.user =
      scrubbable.user.id !== undefined ? { id: String(scrubbable.user.id) } : undefined;
  }

  if (scrubbable.request) {
    // Cookies and auth headers are session material — drop wholesale, then
    // pattern-redact whatever remains (query strings, posted bodies…).
    delete scrubbable.request.cookies;
    delete scrubbable.request.headers;
    scrubbable.request = redactPii(scrubbable.request) as ScrubbableEvent['request'];
  }
  if (scrubbable.extra) {
    scrubbable.extra = redactPii(scrubbable.extra) as ScrubbableEvent['extra'];
  }
  if (scrubbable.contexts) {
    scrubbable.contexts = redactPii(scrubbable.contexts) as ScrubbableEvent['contexts'];
  }
  if (scrubbable.tags) {
    scrubbable.tags = redactPii(scrubbable.tags) as ScrubbableEvent['tags'];
  }
  if (Array.isArray(scrubbable.breadcrumbs)) {
    scrubbable.breadcrumbs = scrubbable.breadcrumbs.map(
      (crumb) => redactPii(crumb) as Record<string, unknown>
    );
  }

  return event;
}
