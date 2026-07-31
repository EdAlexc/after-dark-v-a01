/**
 * Append-only marketplace event capture (S6 / Backlog #14).
 *
 * `track()` freezes the instants the KPI aggregates need (publish, fill,
 * apply) — statuses mutate in place, so these are unrecoverable later. Like
 * notify()/auditLogger, tracking NEVER throws: analytics must not take the
 * triggering action down with it.
 *
 * Privacy (the S6 gate): events carry entity ids, a venue tenant key, and
 * non-identifying dimensions only. No user ids, no names, no free text.
 * The payload passes redactPii as defense in depth, but the rule is to not
 * put PII-shaped keys in at all.
 */

import sql from './sql';
import { logger, redactPii } from './logger';
import { withRlsContext, type RlsUser } from './rls';

export type EventKind =
  | 'gig.published'
  | 'gig.filled'
  | 'gig.cancelled'
  | 'application.created';

const log = logger.child('events');

export interface TrackInput {
  /** Tenant dimension for venue KPIs. */
  venueId?: string | null;
  gigId?: string | null;
  /** Non-identifying dimensions only (e.g. role_needed). */
  payload?: Record<string, unknown>;
}

/** Fire-and-forget append; resolves false (and logs) on failure. */
export async function track(
  actor: RlsUser,
  kind: EventKind,
  { venueId = null, gigId = null, payload = {} }: TrackInput = {}
): Promise<boolean> {
  try {
    const safePayload = JSON.stringify(redactPii(payload));
    // RLS (S2 convention): the insert policy requires a request context once
    // the app runs as the non-owner role.
    await withRlsContext(
      actor,
      sql`
        INSERT INTO events (kind, venue_id, gig_id, payload)
        VALUES (${kind}, ${venueId}, ${gigId}, ${safePayload}::jsonb)
      `
    );
    return true;
  } catch (error) {
    log.error('event insert failed', { kind, error });
    return false;
  }
}
