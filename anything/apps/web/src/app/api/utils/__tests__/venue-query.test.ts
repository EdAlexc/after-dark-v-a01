/**
 * Venue directory builder (S19) — the security-gate invariants as unit
 * tests: public-column projection (no user_id / address / auth data),
 * parameterization, name-set filter pinned in text, bounded paging.
 */
import { describe, expect, it } from 'vitest';
import { VENUE_PAGE_SIZE, buildVenueListQuery } from '../venue-query';
import { VenueListQuerySchema } from '../schemas';

function query(params: Record<string, string> = {}) {
  return VenueListQuerySchema.parse(params);
}

describe('buildVenueListQuery', () => {
  it('projects public columns only — never user_id, address, or socials', () => {
    const { text } = buildVenueListQuery(query());
    for (const banned of ['user_id', 'address', 'email', 'social_links']) {
      expect(text).not.toContain(banned);
    }
    expect(text).toContain('venue_name');
    expect(text).toContain('rating');
  });

  it('pins the name-set (published) filter in text, not as an input', () => {
    const { text, values } = buildVenueListQuery(query());
    expect(text).toContain(`venue_name IS NOT NULL AND venue_name <> ''`);
    expect(values).toHaveLength(2); // limit + offset only
  });

  it('parameterizes hostile filter input — never lands in the SQL text', () => {
    const hostile = "x'; DROP TABLE venue_profiles; --";
    const { text, values } = buildVenueListQuery(query({ q: hostile }));
    expect(text).not.toContain(hostile);
    expect(values).toContain(`%${hostile.toLowerCase()}%`);
  });

  it('supports multi-neighborhood filters as one array parameter', () => {
    const { text, values } = buildVenueListQuery(
      query({ neighborhoods: 'Chelsea,Bushwick' })
    );
    expect(text).toContain('LIKE ANY($1)');
    expect(values[0]).toEqual(['%chelsea%', '%bushwick%']);
  });

  it('fetches a sentinel row and offsets by page', () => {
    const { values } = buildVenueListQuery(query({ page: '3' }));
    expect(values.at(-2)).toBe(VENUE_PAGE_SIZE + 1);
    expect(values.at(-1)).toBe(2 * VENUE_PAGE_SIZE);
  });

  it('rejects unbounded page numbers at the schema layer', () => {
    expect(() => query({ page: '9999' })).toThrow();
    expect(() => query({ page: '0' })).toThrow();
  });
});
