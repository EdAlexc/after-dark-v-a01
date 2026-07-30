/**
 * In-app notifications (P3.4) — the shared emitter every slice uses
 * (applications, messages, shifts, payouts). Like the audit logger, sending
 * NEVER throws: a notification failure must not take the triggering action
 * down with it.
 */

import sql from './sql';
import { logger, redactPii } from './logger';

export type NotificationKind =
  | 'application.received'
  | 'application.status'
  | 'message.received'
  | 'shift.scheduled'
  | 'shift.checked_in'
  | 'shift.checked_out'
  | 'payout.released'
  | (string & {});

const log = logger.child('notify');

/** Fire-and-forget; resolves false (and logs) on failure. */
export async function notify(
  userId: string,
  kind: NotificationKind,
  payload: Record<string, unknown> = {}
): Promise<boolean> {
  try {
    const safePayload = JSON.stringify(redactPii(payload));
    await sql`
      INSERT INTO notifications (user_id, kind, payload)
      VALUES (${userId}, ${kind}, ${safePayload}::jsonb)
    `;
    return true;
  } catch (error) {
    log.error('notification insert failed', { kind, error });
    return false;
  }
}
