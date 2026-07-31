/**
 * S7 matching engine builders — the security-gate invariants:
 * parameterization, public-column projection, availability via the 0017
 * definer probe only (never a direct availabilities read), bounded LIMIT,
 * and a transparent server-side score.
 */
import { describe, expect, it } from 'vitest';
import {
  MATCH_CANDIDATE_LIMIT,
  buildMatchCountQuery,
  buildPricingHintQuery,
  buildTopCandidatesQuery,
  scoreCandidate,
  type CandidateRow,
} from '../match-query';

const HOSTILE = "DJ'; DROP TABLE talent_profiles; --";

describe('match builders', () => {
  it('parameterize every user input (SQLi regression)', () => {
    for (const built of [
      buildMatchCountQuery({ role: HOSTILE, rate: 100, date: '2026-08-01' }),
      buildTopCandidatesQuery({ role: HOSTILE, rate: 100, date: '2026-08-01' }),
      buildPricingHintQuery(HOSTILE),
    ]) {
      expect(built.text).not.toContain(HOSTILE);
      expect(built.values[0]).toBe(`%${HOSTILE.toLowerCase()}%`);
      expect(built.text).not.toContain(';');
    }
  });

  it('probe availability ONLY through the SECURITY DEFINER helper', () => {
    const count = buildMatchCountQuery({ role: 'DJ', date: '2026-08-01' });
    const candidates = buildTopCandidatesQuery({ role: 'DJ', date: '2026-08-01' });
    for (const built of [count, candidates]) {
      expect(built.text).toContain('app_talent_available_on(');
      expect(built.text).not.toContain('FROM availabilities');
    }
  });

  it('candidates project public directory columns only', () => {
    const { text } = buildTopCandidatesQuery({ role: 'DJ' });
    for (const banned of ['user_id', 'email', 'social_links', 'notes', 'time_slot']) {
      expect(text).not.toContain(banned);
    }
    expect(text).toContain('LIMIT');
    expect(text).toContain('stage_name');
  });

  it('bounds the candidate list server-side', () => {
    const { values } = buildTopCandidatesQuery({ role: 'DJ' });
    expect(values.at(-1)).toBe(MATCH_CANDIDATE_LIMIT);
  });

  it('pricing pins statuses in text and looks back a fixed window', () => {
    const { text, values } = buildPricingHintQuery('DJ');
    expect(text).toContain(`status IN ('PUBLISHED', 'FILLED', 'COMPLETED')`);
    expect(text).toContain('PERCENTILE_CONT');
    expect(values[1]).toBeTypeOf('number');
  });

  it('rate filter admits talent with no stated minimum', () => {
    const { text } = buildMatchCountQuery({ role: 'DJ', rate: 150 });
    expect(text).toContain('hourly_rate_min IS NULL OR hourly_rate_min <=');
  });
});

describe('scoreCandidate', () => {
  const base: CandidateRow = {
    id: 't1',
    stage_name: 'Kira',
    primary_role: 'DJ',
    neighborhood: 'LES',
    avatar_url: null,
    hourly_rate_min: 100,
    hourly_rate_max: 200,
    profile_completion_pct: 80,
    available_tonight: false,
    available_on_date: false,
  };

  it('ranks date availability above the tonight flag', () => {
    const onDate = scoreCandidate({ ...base, available_on_date: true }, { role: 'DJ' });
    const tonight = scoreCandidate({ ...base, available_tonight: true }, { role: 'DJ' });
    const neither = scoreCandidate(base, { role: 'DJ' });
    expect(onDate).toBeGreaterThan(tonight);
    expect(tonight).toBeGreaterThan(neither);
  });

  it('rewards rate-band overlap and caps at 99', () => {
    const inBand = scoreCandidate(
      { ...base, available_on_date: true, profile_completion_pct: 100 },
      { role: 'DJ', rate: 150 }
    );
    const outOfBand = scoreCandidate(
      { ...base, available_on_date: true, profile_completion_pct: 100 },
      { role: 'DJ', rate: 500 }
    );
    expect(inBand).toBeGreaterThan(outOfBand);
    expect(inBand).toBeLessThanOrEqual(99);
  });
});
