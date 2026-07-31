/**
 * Talent trust score v1 (S8 / Backlog #8) — a transparent, server-computed
 * heuristic. Never a client input (the S8 gate); recomputed inside the
 * review transaction so it can't drift from its inputs.
 *
 * Components (v1, deliberately simple and explainable):
 *   base 50
 * + rating signal: (avg − 3) × 10, scaled by confidence (count / 5, capped
 *   at 1) — one glowing review moves the needle less than five;
 * + track record: +2 per completed shift, capped at +20;
 * + profile completeness: up to +10.
 * Clamped to 0–100. A talent with no reviews and no shifts sits at ~50–60:
 * "new", not "bad".
 */

export interface TrustInputs {
  /** AVG(rating) of VENUE_TO_TALENT reviews, or null when unreviewed. */
  avgRating: number | null;
  ratingCount: number;
  /** CHECKED_OUT or PAID shifts. */
  completedShifts: number;
  profileCompletionPct: number | null;
}

export function computeTrustScore(inputs: TrustInputs): number {
  let score = 50;

  if (inputs.avgRating !== null && inputs.ratingCount > 0) {
    const confidence = Math.min(1, inputs.ratingCount / 5);
    score += (inputs.avgRating - 3) * 10 * confidence;
  }

  score += Math.min(20, Math.max(0, inputs.completedShifts) * 2);
  score += Math.min(100, Math.max(0, inputs.profileCompletionPct ?? 0)) / 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}
