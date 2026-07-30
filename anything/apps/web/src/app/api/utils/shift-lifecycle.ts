/**
 * Shift status lifecycle (P7). Actor-scoped like application-lifecycle:
 * talent drive their own progress; venues can correct at the door; PAID is
 * reachable only by the payout-release service path (P8), never by a user.
 *
 *   SCHEDULED → IN_TRANSIT → CHECKED_IN → CHECKED_OUT → PAID
 *        └────────────────────────┘ (direct check-in at the door is normal)
 */

export type ShiftStatus = 'SCHEDULED' | 'IN_TRANSIT' | 'CHECKED_IN' | 'CHECKED_OUT' | 'PAID';
export type ShiftActor = 'TALENT' | 'VENUE' | 'SERVICE';

export const SHIFT_STATUSES: readonly ShiftStatus[] = [
  'SCHEDULED',
  'IN_TRANSIT',
  'CHECKED_IN',
  'CHECKED_OUT',
  'PAID',
];

const TALENT: Record<ShiftStatus, readonly ShiftStatus[]> = {
  SCHEDULED: ['IN_TRANSIT', 'CHECKED_IN'],
  IN_TRANSIT: ['CHECKED_IN'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  PAID: [],
};

// The venue works the door: they can check someone in or out regardless of
// the in-transit intermediate, but they cannot un-checkout or mark PAID.
const VENUE: Record<ShiftStatus, readonly ShiftStatus[]> = {
  SCHEDULED: ['CHECKED_IN'],
  IN_TRANSIT: ['CHECKED_IN'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  PAID: [],
};

const SERVICE: Record<ShiftStatus, readonly ShiftStatus[]> = {
  SCHEDULED: [],
  IN_TRANSIT: [],
  CHECKED_IN: [],
  CHECKED_OUT: ['PAID'],
  PAID: [],
};

const TABLES: Record<ShiftActor, Record<ShiftStatus, readonly ShiftStatus[]>> = {
  TALENT,
  VENUE,
  SERVICE,
};

export function canTransitionShift(actor: ShiftActor, from: ShiftStatus, to: ShiftStatus): boolean {
  return (TABLES[actor][from] ?? []).includes(to);
}

/**
 * Pay for a completed shift, in cents: hourly rate × worked hours, rounded to
 * the nearest cent, never negative. Hours come from actual check-in/out
 * timestamps — not the gig's advertised times.
 */
export function computeShiftPayCents(
  agreedRateCents: number,
  checkInAt: Date,
  checkOutAt: Date
): number {
  const ms = checkOutAt.getTime() - checkInAt.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const hours = ms / 3_600_000;
  return Math.round(agreedRateCents * hours);
}
