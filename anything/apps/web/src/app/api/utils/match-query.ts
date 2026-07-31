/**
 * Pure SQL builders + scoring for the S7 matching engine (Backlog #6) —
 * the create-gig wizard's "Live Analysis", real this time.
 *
 * Privacy stance (the S7 gate: aggregate/public data only pre-hire):
 *  - candidate cards project the same public columns as the talent
 *    directory — never user ids, socials, or auth data;
 *  - date availability surfaces as ONE boolean per candidate via the 0017
 *    SECURITY DEFINER probe (app_talent_available_on) — slot times and
 *    notes stay in the talent's private calendar;
 *  - the pricing hint is percentiles over published-gig rates, no venue
 *    attribution.
 *
 * Parameterization invariants match gigs-query.ts: user input only ever
 * lands in `values`; LIMIT is server-bounded.
 */

import type { BuiltQuery } from './gigs-query';

export const MATCH_CANDIDATE_LIMIT = 4;
/** Pricing looks back over this window of posted gigs. */
export const PRICING_WINDOW_DAYS = 90;

export interface MatchPreviewInput {
  role: string;
  /** Gig rate in $/hr — candidates whose minimum ask exceeds it don't match. */
  rate?: number;
  /** Gig date (YYYY-MM-DD) for the availability probe; null = no date yet. */
  date?: string | null;
}

/**
 * Role matching is BIDIRECTIONAL substring: the wizard's option list is more
 * specific than profile roles ("DJ / Producer" vs a profile's "DJ"), so
 * either side containing the other counts. The reverse LIKE is guarded
 * against empty profile roles (which would match everything).
 */
const ROLE_MATCH = `(
      LOWER(primary_role) LIKE $1
      OR (primary_role IS NOT NULL AND primary_role <> '' AND $2 LIKE '%' || LOWER(primary_role) || '%')
    )`;

/** Matching talent + how many of them are available on the gig date. */
export function buildMatchCountQuery(input: MatchPreviewInput): BuiltQuery {
  let text = `
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE available_tonight)::int AS tonight,
           COUNT(*) FILTER (WHERE app_talent_available_on(id, $3::date))::int AS on_date
    FROM talent_profiles
    WHERE stage_name IS NOT NULL AND stage_name <> ''
      AND ${ROLE_MATCH}
  `;
  const values: (string | number | null)[] = [
    `%${input.role.toLowerCase()}%`,
    input.role.toLowerCase(),
    input.date ?? null,
  ];
  let index = 4;
  if (input.rate !== undefined) {
    text += ` AND (hourly_rate_min IS NULL OR hourly_rate_min <= $${index})`;
    values.push(input.rate);
    index++;
  }
  return { text, values: values as BuiltQuery['values'] };
}

/** Top candidate cards — public directory columns + the date boolean. */
export function buildTopCandidatesQuery(input: MatchPreviewInput): BuiltQuery {
  let text = `
    SELECT id, stage_name, primary_role, neighborhood, avatar_url,
           hourly_rate_min, hourly_rate_max, profile_completion_pct,
           available_tonight,
           app_talent_available_on(id, $3::date) AS available_on_date
    FROM talent_profiles
    WHERE stage_name IS NOT NULL AND stage_name <> ''
      AND ${ROLE_MATCH}
  `;
  const values: (string | number | null)[] = [
    `%${input.role.toLowerCase()}%`,
    input.role.toLowerCase(),
    input.date ?? null,
  ];
  let index = 4;
  if (input.rate !== undefined) {
    text += ` AND (hourly_rate_min IS NULL OR hourly_rate_min <= $${index})`;
    values.push(input.rate);
    index++;
  }
  text += `
    ORDER BY app_talent_available_on(id, $3::date) DESC, available_tonight DESC,
             profile_completion_pct DESC NULLS LAST, created_at DESC
    LIMIT $${index}
  `;
  values.push(MATCH_CANDIDATE_LIMIT);
  return { text, values: values as BuiltQuery['values'] };
}

/** Rate percentiles over recent posted gigs for the same role. */
export function buildPricingHintQuery(role: string): BuiltQuery {
  return {
    text: `
      SELECT COUNT(*)::int AS sample,
             PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY base_rate)::float AS p25,
             PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY base_rate)::float AS p50,
             PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY base_rate)::float AS p75
      FROM gigs
      WHERE status IN ('PUBLISHED', 'FILLED', 'COMPLETED')
        AND base_rate > 0
        AND created_at >= NOW() - make_interval(days => $2)
        AND LOWER(role_needed) LIKE $1
    `,
    values: [`%${role.toLowerCase()}%`, PRICING_WINDOW_DAYS],
  };
}

export interface CandidateRow {
  id: string;
  stage_name: string;
  primary_role: string | null;
  neighborhood: string | null;
  avatar_url: string | null;
  hourly_rate_min: string | number | null;
  hourly_rate_max: string | number | null;
  profile_completion_pct: number | null;
  available_tonight: boolean | null;
  available_on_date: boolean | null;
}

/**
 * Heuristic match score v1 — server-computed, deliberately transparent:
 * role match is the entry bar (60), then date availability (20) or the
 * tonight flag (10), rate-band overlap (10), profile completeness (≤10).
 */
export function scoreCandidate(candidate: CandidateRow, input: MatchPreviewInput): number {
  let score = 60;
  if (candidate.available_on_date) score += 20;
  else if (candidate.available_tonight) score += 10;
  if (input.rate !== undefined) {
    const min = Number(candidate.hourly_rate_min);
    const max = Number(candidate.hourly_rate_max);
    const aboveMin = !Number.isFinite(min) || min <= input.rate;
    const belowMax = !Number.isFinite(max) || max >= input.rate;
    if (aboveMin && belowMax) score += 10;
  }
  score += Math.round(Math.min(100, Math.max(0, candidate.profile_completion_pct ?? 0)) / 10);
  return Math.min(99, score);
}
