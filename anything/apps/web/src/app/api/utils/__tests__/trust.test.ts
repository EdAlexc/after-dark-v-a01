/** S8 trust score v1 — the heuristic's promised properties. */
import { describe, expect, it } from 'vitest';
import { computeTrustScore } from '../trust';

describe('computeTrustScore', () => {
  it('scores a brand-new talent as neutral, not bad', () => {
    const score = computeTrustScore({
      avgRating: null,
      ratingCount: 0,
      completedShifts: 0,
      profileCompletionPct: 0,
    });
    expect(score).toBe(50);
  });

  it('one 5★ review moves the needle less than five of them (confidence scaling)', () => {
    const one = computeTrustScore({
      avgRating: 5,
      ratingCount: 1,
      completedShifts: 0,
      profileCompletionPct: 0,
    });
    const five = computeTrustScore({
      avgRating: 5,
      ratingCount: 5,
      completedShifts: 0,
      profileCompletionPct: 0,
    });
    expect(five).toBeGreaterThan(one);
    expect(one).toBeGreaterThan(50);
  });

  it('bad ratings pull below the neutral baseline', () => {
    const score = computeTrustScore({
      avgRating: 1,
      ratingCount: 5,
      completedShifts: 0,
      profileCompletionPct: 0,
    });
    expect(score).toBeLessThan(50);
  });

  it('track record caps at +20 and the total clamps to 0–100', () => {
    const max = computeTrustScore({
      avgRating: 5,
      ratingCount: 50,
      completedShifts: 500,
      profileCompletionPct: 100,
    });
    expect(max).toBe(100);
    const min = computeTrustScore({
      avgRating: 1,
      ratingCount: 50,
      completedShifts: 0,
      profileCompletionPct: 0,
    });
    expect(min).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic — same inputs, same score (server-side recompute safety)', () => {
    const inputs = {
      avgRating: 4.2,
      ratingCount: 3,
      completedShifts: 7,
      profileCompletionPct: 80,
    };
    expect(computeTrustScore(inputs)).toBe(computeTrustScore(inputs));
  });
});
