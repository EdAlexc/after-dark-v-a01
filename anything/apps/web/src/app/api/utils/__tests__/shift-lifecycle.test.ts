/**
 * Shift lifecycle matrix (P7) — the full actor-scoped treatment (Q8): every
 * legal edge per side, the complete complement denied, terminal states, and
 * totality (unknown status → denied, never throws). Spot checks live in
 * marketplace-logic.test.ts; this suite is the exhaustive one.
 */

import { describe, expect, it } from 'vitest';
import {
  SHIFT_STATUSES,
  canTransitionShift,
  type ShiftActor,
  type ShiftStatus,
} from '../shift-lifecycle';

const ACTORS: readonly ShiftActor[] = ['TALENT', 'VENUE', 'SERVICE'];

/** The complete legal edge set — one row per (actor, from, to). */
const LEGAL_EDGES: ReadonlyArray<[ShiftActor, ShiftStatus, ShiftStatus]> = [
  ['TALENT', 'SCHEDULED', 'IN_TRANSIT'],
  ['TALENT', 'SCHEDULED', 'CHECKED_IN'], // direct check-in at the door is normal
  ['TALENT', 'IN_TRANSIT', 'CHECKED_IN'],
  ['TALENT', 'CHECKED_IN', 'CHECKED_OUT'],
  ['VENUE', 'SCHEDULED', 'CHECKED_IN'], // door check-in skips IN_TRANSIT
  ['VENUE', 'IN_TRANSIT', 'CHECKED_IN'],
  ['VENUE', 'CHECKED_IN', 'CHECKED_OUT'],
  ['SERVICE', 'CHECKED_OUT', 'PAID'], // payout release (P8) — never a user
];

describe('shift lifecycle transitions (per actor)', () => {
  it('lists every status exactly once', () => {
    expect([...SHIFT_STATUSES].sort()).toEqual(
      ['CHECKED_IN', 'CHECKED_OUT', 'IN_TRANSIT', 'PAID', 'SCHEDULED'].sort()
    );
    expect(new Set(SHIFT_STATUSES).size).toBe(SHIFT_STATUSES.length);
  });

  it.each(LEGAL_EDGES)('allows %s: %s → %s', (actor, from, to) => {
    expect(canTransitionShift(actor, from, to)).toBe(true);
  });

  it('denies every (actor, from, to) triple outside the legal edge set', () => {
    let allowed = 0;
    for (const actor of ACTORS) {
      for (const from of SHIFT_STATUSES) {
        for (const to of SHIFT_STATUSES) {
          const legal = LEGAL_EDGES.some(
            ([a, f, t]) => a === actor && f === from && t === to
          );
          expect(canTransitionShift(actor, from, to)).toBe(legal);
          if (legal) allowed += 1;
        }
      }
    }
    // The matrix has exactly these 8 edges — nothing snuck in.
    expect(allowed).toBe(LEGAL_EDGES.length);
  });

  it('blocks skipping states', () => {
    for (const actor of ACTORS) {
      expect(canTransitionShift(actor, 'SCHEDULED', 'CHECKED_OUT')).toBe(false);
      expect(canTransitionShift(actor, 'SCHEDULED', 'PAID')).toBe(false);
      expect(canTransitionShift(actor, 'IN_TRANSIT', 'CHECKED_OUT')).toBe(false);
      expect(canTransitionShift(actor, 'CHECKED_IN', 'PAID')).toBe(false);
    }
  });

  it('blocks backwards moves — nobody un-checks-in or un-checks-out', () => {
    for (const actor of ACTORS) {
      expect(canTransitionShift(actor, 'IN_TRANSIT', 'SCHEDULED')).toBe(false);
      expect(canTransitionShift(actor, 'CHECKED_IN', 'SCHEDULED')).toBe(false);
      expect(canTransitionShift(actor, 'CHECKED_IN', 'IN_TRANSIT')).toBe(false);
      expect(canTransitionShift(actor, 'CHECKED_OUT', 'CHECKED_IN')).toBe(false);
    }
  });

  it('denies acting from the wrong side', () => {
    // Only the talent is ever "on their way" — the venue can't mark transit.
    expect(canTransitionShift('VENUE', 'SCHEDULED', 'IN_TRANSIT')).toBe(false);
    // PAID is the payout service's edge alone.
    expect(canTransitionShift('TALENT', 'CHECKED_OUT', 'PAID')).toBe(false);
    expect(canTransitionShift('VENUE', 'CHECKED_OUT', 'PAID')).toBe(false);
    // And the service never performs user moves.
    expect(canTransitionShift('SERVICE', 'SCHEDULED', 'CHECKED_IN')).toBe(false);
    expect(canTransitionShift('SERVICE', 'SCHEDULED', 'IN_TRANSIT')).toBe(false);
    expect(canTransitionShift('SERVICE', 'CHECKED_IN', 'CHECKED_OUT')).toBe(false);
  });

  it('makes PAID terminal for every actor (and CHECKED_OUT terminal for users)', () => {
    for (const actor of ACTORS) {
      for (const to of SHIFT_STATUSES) {
        expect(canTransitionShift(actor, 'PAID', to)).toBe(false);
      }
    }
    for (const to of SHIFT_STATUSES) {
      expect(canTransitionShift('TALENT', 'CHECKED_OUT', to)).toBe(false);
      expect(canTransitionShift('VENUE', 'CHECKED_OUT', to)).toBe(false);
    }
  });

  it('never allows a self-transition (idempotent re-posts are denied here)', () => {
    for (const actor of ACTORS) {
      for (const status of SHIFT_STATUSES) {
        expect(canTransitionShift(actor, status, status)).toBe(false);
      }
    }
  });

  it('is total: an unknown status is denied, never thrown on', () => {
    const bogus = 'NO_SUCH_STATUS' as ShiftStatus;
    for (const actor of ACTORS) {
      expect(() => canTransitionShift(actor, bogus, 'CHECKED_IN')).not.toThrow();
      expect(canTransitionShift(actor, bogus, 'CHECKED_IN')).toBe(false);
      expect(canTransitionShift(actor, 'SCHEDULED', bogus)).toBe(false);
      expect(canTransitionShift(actor, bogus, bogus)).toBe(false);
      expect(canTransitionShift(actor, '' as ShiftStatus, 'PAID')).toBe(false);
    }
  });
});
