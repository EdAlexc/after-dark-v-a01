/**
 * S9 SSE fingerprint → TanStack Query key mapping. Pure and separate from
 * the route so the invariant is unit-testable: the stream only ever emits
 * QUERY KEYS, never row data (the invalidated queries refetch through their
 * own authenticated routes).
 */

export interface StreamFingerprint {
  /** MAX(notifications.id) for the user. */
  notif: string;
  /** Latest message id across the user's conversations. */
  msg: string;
  /** Latest shift-transition id across the user's shifts (either side). */
  shift: string;
}

export const EMPTY_FINGERPRINT: StreamFingerprint = { notif: '', msg: '', shift: '' };

export function changedKeys(
  previous: StreamFingerprint,
  next: StreamFingerprint
): string[][] {
  const keys: string[][] = [];
  if (previous.notif !== next.notif) keys.push(['notifications']);
  if (previous.msg !== next.msg) keys.push(['conversations'], ['messages']);
  if (previous.shift !== next.shift) {
    keys.push(['talent-shifts'], ['venue-shifts'], ['venue-gigs']);
  }
  return keys;
}
