/**
 * Search builders (S5) — the security-gate invariants as unit tests:
 * plainto_tsquery only, PUBLISHED pinned, public-column projection,
 * parameterization (user input never lands in text), bounded LIMIT.
 */
import { describe, expect, it } from 'vitest';
import {
  SEARCH_LIMIT_MAX,
  buildGigSearchQuery,
  buildTalentSearchQuery,
  buildVenueSearchQuery,
} from '../search-query';

const HOSTILE_TERMS = [
  "'; DROP TABLE gigs; --",
  "!!&|('injected')",
  'a:* & b:*', // raw tsquery syntax must be treated as plain words
  '%_%',
];

describe('buildGigSearchQuery', () => {
  it('parameterizes the term — hostile input never lands in the SQL text', () => {
    for (const term of HOSTILE_TERMS) {
      const { text, values } = buildGigSearchQuery(term, 8);
      expect(text).not.toContain(term);
      expect(values[0]).toBe(term);
    }
  });

  it('uses plainto_tsquery only (no to_tsquery / raw tsquery surface)', () => {
    const { text } = buildGigSearchQuery('deep house', 8);
    expect(text).toContain("plainto_tsquery('english', $1)");
    expect(text).not.toMatch(/[^n]to_tsquery/); // no bare to_tsquery( anywhere
  });

  it('pins status to PUBLISHED in the text, not as an input', () => {
    const { text, values } = buildGigSearchQuery('dj', 8);
    expect(text).toContain(`g.status = 'PUBLISHED'`);
    expect(values).not.toContain('PUBLISHED');
  });

  it('bounds the limit whatever the caller asks for', () => {
    expect(buildGigSearchQuery('dj', 10_000).values[2]).toBe(SEARCH_LIMIT_MAX);
    expect(buildGigSearchQuery('dj', -5).values[2]).toBe(1);
  });

  it('projects no auth-table or tenant-private columns', () => {
    const { text } = buildGigSearchQuery('dj', 8);
    for (const banned of ['email', 'user_id', 'suspended', 'g.description AS']) {
      expect(text).not.toContain(banned);
    }
  });
});

describe('buildTalentSearchQuery', () => {
  it('parameterizes the term', () => {
    for (const term of HOSTILE_TERMS) {
      const { text, values } = buildTalentSearchQuery(term, 8);
      expect(text).not.toContain(term);
      expect(values[0]).toBe(term);
    }
  });

  it('only lists stage-named (published) profiles', () => {
    const { text } = buildTalentSearchQuery('kira', 8);
    expect(text).toContain(`stage_name IS NOT NULL AND stage_name <> ''`);
  });

  it('projects public columns only — no user_id, email, or socials', () => {
    const { text } = buildTalentSearchQuery('kira', 8);
    for (const banned of ['user_id', 'email', 'social_links', 'phone']) {
      expect(text).not.toContain(banned);
    }
  });

  it('bounds the limit', () => {
    expect(buildTalentSearchQuery('kira', 999).values[2]).toBe(SEARCH_LIMIT_MAX);
  });
});

describe('buildVenueSearchQuery (S19)', () => {
  it('parameterizes the term', () => {
    for (const term of HOSTILE_TERMS) {
      const { text, values } = buildVenueSearchQuery(term, 8);
      expect(text).not.toContain(term);
      expect(values[0]).toBe(term);
    }
  });

  it('only lists venue-named (published) profiles', () => {
    const { text } = buildVenueSearchQuery('nebula', 8);
    expect(text).toContain(`venue_name IS NOT NULL AND venue_name <> ''`);
  });

  it('projects public columns only — no user_id, email, address, or socials', () => {
    const { text } = buildVenueSearchQuery('nebula', 8);
    for (const banned of ['user_id', 'email', 'address', 'social_links', 'operating_hours']) {
      expect(text).not.toContain(banned);
    }
  });

  it('uses plainto_tsquery only and bounds the limit', () => {
    const { text, values } = buildVenueSearchQuery('nebula', 999);
    expect(text).toContain("plainto_tsquery('english', $1)");
    expect(values[2]).toBe(SEARCH_LIMIT_MAX);
  });
});
