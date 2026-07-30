/**
 * Pure-logic suites for the P3–P8 marketplace loop: application + shift
 * lifecycles (actor-scoped), money-in-cents math, and media parsing. Route
 * behavior on top of these lives in the authZ matrix suite.
 */

import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STATUSES,
  allowedApplicationTransitions,
  canTransitionApplication,
} from '../application-lifecycle';
import {
  SHIFT_STATUSES,
  canTransitionShift,
  computeShiftPayCents,
} from '../shift-lifecycle';
import { centsToDollars, dollarsToCents, splitPayout } from '../money';
import { MediaError, parseDataUrl } from '../media';

describe('application lifecycle (P3)', () => {
  it('venue drives review; talent only withdraws', () => {
    expect(canTransitionApplication('VENUE', 'PENDING', 'SHORTLISTED')).toBe(true);
    expect(canTransitionApplication('VENUE', 'PENDING', 'HIRED')).toBe(true);
    expect(canTransitionApplication('VENUE', 'SHORTLISTED', 'HIRED')).toBe(true);
    expect(canTransitionApplication('TALENT', 'PENDING', 'WITHDRAWN')).toBe(true);
    expect(canTransitionApplication('TALENT', 'SHORTLISTED', 'WITHDRAWN')).toBe(true);
    // Cross-actor edges must not exist.
    expect(canTransitionApplication('TALENT', 'PENDING', 'HIRED')).toBe(false);
    expect(canTransitionApplication('TALENT', 'PENDING', 'SHORTLISTED')).toBe(false);
    expect(canTransitionApplication('VENUE', 'PENDING', 'WITHDRAWN')).toBe(false);
  });

  it('HIRED and WITHDRAWN are terminal; REJECTED is venue-recoverable', () => {
    for (const to of APPLICATION_STATUSES) {
      expect(canTransitionApplication('VENUE', 'HIRED', to)).toBe(false);
      expect(canTransitionApplication('TALENT', 'HIRED', to)).toBe(false);
      expect(canTransitionApplication('TALENT', 'WITHDRAWN', to)).toBe(false);
    }
    expect(canTransitionApplication('VENUE', 'REJECTED', 'SHORTLISTED')).toBe(true);
    expect(allowedApplicationTransitions('TALENT', 'REJECTED')).toEqual([]);
  });
});

describe('shift lifecycle (P7)', () => {
  it('talent progress their own shift; venue works the door', () => {
    expect(canTransitionShift('TALENT', 'SCHEDULED', 'IN_TRANSIT')).toBe(true);
    expect(canTransitionShift('TALENT', 'SCHEDULED', 'CHECKED_IN')).toBe(true);
    expect(canTransitionShift('TALENT', 'CHECKED_IN', 'CHECKED_OUT')).toBe(true);
    expect(canTransitionShift('VENUE', 'IN_TRANSIT', 'CHECKED_IN')).toBe(true);
    expect(canTransitionShift('VENUE', 'CHECKED_IN', 'CHECKED_OUT')).toBe(true);
    // Nobody un-checks-out; nobody user-marks PAID.
    expect(canTransitionShift('TALENT', 'CHECKED_OUT', 'CHECKED_IN')).toBe(false);
    for (const actor of ['TALENT', 'VENUE'] as const) {
      for (const from of SHIFT_STATUSES) {
        expect(canTransitionShift(actor, from, 'PAID')).toBe(false);
      }
    }
    expect(canTransitionShift('SERVICE', 'CHECKED_OUT', 'PAID')).toBe(true);
    expect(canTransitionShift('SERVICE', 'CHECKED_IN', 'PAID')).toBe(false);
  });

  it('computes pay from ACTUAL worked time in cents', () => {
    const inAt = new Date('2026-08-01T22:00:00Z');
    expect(computeShiftPayCents(15000, inAt, new Date('2026-08-02T04:00:00Z'))).toBe(90000); // 6h × $150
    expect(computeShiftPayCents(15000, inAt, new Date('2026-08-01T22:30:00Z'))).toBe(7500); // 0.5h
    // Clock skew / inverted stamps never produce negative pay.
    expect(computeShiftPayCents(15000, inAt, new Date('2026-08-01T21:00:00Z'))).toBe(0);
  });
});

describe('money (working agreement §11 — integer cents)', () => {
  it('splits with the server-side 5% fee and reconciles exactly', () => {
    const split = splitPayout(90000);
    expect(split).toEqual({ grossCents: 90000, feeCents: 4500, netCents: 85500 });
    // Odd amounts still reconcile to the cent (the DB CHECK enforces this too).
    for (const gross of [1, 33, 12345, 99999, 1000001]) {
      const { grossCents, feeCents: fee, netCents } = splitPayout(gross);
      expect(fee + netCents).toBe(grossCents);
      expect(fee).toBe(Math.round(gross * 0.05));
    }
  });

  it('round-trips dollars ↔ cents without float drift', () => {
    expect(dollarsToCents('450')).toBe(45000);
    expect(dollarsToCents('75.50')).toBe(7550);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30); // the classic
    expect(dollarsToCents('garbage')).toBe(0);
    expect(centsToDollars(85500)).toBe('855.00');
  });
});

describe('media parsing (P4 — the gate before sharp)', () => {
  it('accepts a well-formed data URL and returns its bytes', () => {
    const { mime, bytes } = parseDataUrl('data:image/png;base64,aGVsbG8=');
    expect(mime).toBe('image/png');
    expect(bytes.toString()).toBe('hello');
  });

  it('rejects junk, empties, and oversized payloads', () => {
    expect(() => parseDataUrl('not-a-data-url')).toThrow(MediaError);
    expect(() => parseDataUrl('data:image/png;base64,')).toThrow(MediaError);
    expect(() => parseDataUrl('javascript:alert(1)')).toThrow(MediaError);
    const big = 'data:image/png;base64,' + 'A'.repeat(8_000_000);
    expect(() => parseDataUrl(big)).toThrow(/too large/i);
  });
});
