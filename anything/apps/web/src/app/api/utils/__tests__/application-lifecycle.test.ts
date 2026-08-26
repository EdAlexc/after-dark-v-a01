/**
 * Application lifecycle matrix (P3) — the full actor-scoped treatment (Q8):
 * venue drives review (shortlist/hire/reject/un-reject), talent only ever
 * withdraws, cross-side moves are denied, terminals hold, and both exported
 * functions are total and agree with each other. Spot checks live in
 * marketplace-logic.test.ts; this suite is the exhaustive one.
 */

import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STATUSES,
  allowedApplicationTransitions,
  canTransitionApplication,
  type ApplicationActor,
  type ApplicationStatus,
} from '../application-lifecycle';

const ACTORS: readonly ApplicationActor[] = ['VENUE', 'TALENT'];

/** The complete legal edge set — one row per (actor, from, to). */
const LEGAL_EDGES: ReadonlyArray<[ApplicationActor, ApplicationStatus, ApplicationStatus]> = [
  ['VENUE', 'PENDING', 'SHORTLISTED'],
  ['VENUE', 'PENDING', 'HIRED'], // direct hire without shortlisting
  ['VENUE', 'PENDING', 'REJECTED'],
  ['VENUE', 'SHORTLISTED', 'HIRED'],
  ['VENUE', 'SHORTLISTED', 'REJECTED'],
  ['VENUE', 'REJECTED', 'SHORTLISTED'], // un-reject / reconsider
  ['TALENT', 'PENDING', 'WITHDRAWN'],
  ['TALENT', 'SHORTLISTED', 'WITHDRAWN'],
];

describe('application lifecycle transitions (per actor)', () => {
  it('lists every status exactly once', () => {
    expect([...APPLICATION_STATUSES].sort()).toEqual(
      ['HIRED', 'PENDING', 'REJECTED', 'SHORTLISTED', 'WITHDRAWN'].sort()
    );
    expect(new Set(APPLICATION_STATUSES).size).toBe(APPLICATION_STATUSES.length);
  });

  it.each(LEGAL_EDGES)('allows %s: %s → %s', (actor, from, to) => {
    expect(canTransitionApplication(actor, from, to)).toBe(true);
  });

  it('denies every (actor, from, to) triple outside the legal edge set', () => {
    let allowed = 0;
    for (const actor of ACTORS) {
      for (const from of APPLICATION_STATUSES) {
        for (const to of APPLICATION_STATUSES) {
          const legal = LEGAL_EDGES.some(
            ([a, f, t]) => a === actor && f === from && t === to
          );
          expect(canTransitionApplication(actor, from, to)).toBe(legal);
          if (legal) allowed += 1;
        }
      }
    }
    expect(allowed).toBe(LEGAL_EDGES.length);
  });

  it('denies cross-side moves: talent cannot review, venue cannot withdraw', () => {
    expect(canTransitionApplication('TALENT', 'PENDING', 'SHORTLISTED')).toBe(false);
    expect(canTransitionApplication('TALENT', 'PENDING', 'HIRED')).toBe(false);
    expect(canTransitionApplication('TALENT', 'PENDING', 'REJECTED')).toBe(false);
    expect(canTransitionApplication('TALENT', 'SHORTLISTED', 'HIRED')).toBe(false);
    expect(canTransitionApplication('TALENT', 'REJECTED', 'SHORTLISTED')).toBe(false);
    expect(canTransitionApplication('VENUE', 'PENDING', 'WITHDRAWN')).toBe(false);
    expect(canTransitionApplication('VENUE', 'SHORTLISTED', 'WITHDRAWN')).toBe(false);
  });

  it('makes HIRED and WITHDRAWN terminal for both actors', () => {
    for (const actor of ACTORS) {
      for (const to of APPLICATION_STATUSES) {
        expect(canTransitionApplication(actor, 'HIRED', to)).toBe(false);
        expect(canTransitionApplication(actor, 'WITHDRAWN', to)).toBe(false);
      }
      expect(allowedApplicationTransitions(actor, 'HIRED')).toEqual([]);
      expect(allowedApplicationTransitions(actor, 'WITHDRAWN')).toEqual([]);
    }
  });

  it('leaves a rejected talent no exit — only the venue can reconsider', () => {
    expect(allowedApplicationTransitions('TALENT', 'REJECTED')).toEqual([]);
    expect(allowedApplicationTransitions('VENUE', 'REJECTED')).toEqual(['SHORTLISTED']);
    // Withdrawing after hire is a shift cancellation, not an application edit.
    expect(canTransitionApplication('TALENT', 'HIRED', 'WITHDRAWN')).toBe(false);
  });

  it('never allows a self-transition', () => {
    for (const actor of ACTORS) {
      for (const status of APPLICATION_STATUSES) {
        expect(canTransitionApplication(actor, status, status)).toBe(false);
      }
    }
  });

  it('keeps allowedApplicationTransitions in exact agreement with the guard', () => {
    for (const actor of ACTORS) {
      for (const from of APPLICATION_STATUSES) {
        const listed = allowedApplicationTransitions(actor, from);
        const derived = APPLICATION_STATUSES.filter((to) =>
          canTransitionApplication(actor, from, to)
        );
        expect([...listed].sort()).toEqual(derived.sort());
      }
    }
  });

  it('is total: an unknown status is denied (guard) / empty (list), never thrown on', () => {
    const bogus = 'NO_SUCH_STATUS' as ApplicationStatus;
    for (const actor of ACTORS) {
      expect(() => canTransitionApplication(actor, bogus, 'HIRED')).not.toThrow();
      expect(canTransitionApplication(actor, bogus, 'HIRED')).toBe(false);
      expect(canTransitionApplication(actor, 'PENDING', bogus)).toBe(false);
      expect(canTransitionApplication(actor, bogus, bogus)).toBe(false);
      expect(() => allowedApplicationTransitions(actor, bogus)).not.toThrow();
      expect(allowedApplicationTransitions(actor, bogus)).toEqual([]);
    }
  });
});
