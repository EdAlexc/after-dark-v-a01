/**
 * Event-listings builder (0025) — security-gate invariants as unit tests,
 * same doctrine as venue-query.test.ts: PUBLISHED pinned in values, public
 * display columns only from the venue join, parameterized input, bounded
 * paging, upcoming-only baked into the text.
 */
import { describe, expect, it } from 'vitest';
import { EVENT_PAGE_SIZE, buildEventsListQuery } from '../event-listings-query';
import { EventListQuerySchema } from '../schemas';

function query(params: Record<string, string> = {}) {
  return EventListQuerySchema.parse(params);
}

describe('buildEventsListQuery', () => {
  it('hard-pins PUBLISHED as the first parameter', () => {
    const { text, values } = buildEventsListQuery(query());
    expect(text).toContain('e.status = $1');
    expect(values[0]).toBe('PUBLISHED');
  });

  it('is upcoming-only in text — an ended event drops off the listing', () => {
    const { text } = buildEventsListQuery(query());
    expect(text).toContain(`COALESCE(e.end_time, e.start_time) >= NOW()`);
  });

  it('joins only public venue display columns — never user_id or address', () => {
    const { text } = buildEventsListQuery(query());
    for (const banned of ['user_id', 'vp.address', 'email', 'social_links']) {
      expect(text).not.toContain(banned);
    }
    expect(text).toContain('vp.venue_name');
    expect(text).toContain('open_gig_count');
  });

  it('counts only PUBLISHED upcoming gigs toward open roles', () => {
    const { text } = buildEventsListQuery(query());
    expect(text).toContain(`g.event_listing_id = e.id AND g.status = 'PUBLISHED'`);
  });

  it('parameterizes hostile search input — never lands in the SQL text', () => {
    const hostile = "x'; DROP TABLE event_listings; --";
    const { text, values } = buildEventsListQuery(query({ q: hostile }));
    expect(text).not.toContain(hostile);
    expect(values).toContain(`%${hostile.toLowerCase()}%`);
  });

  it('supports multi-neighborhood filters as one array parameter', () => {
    const { text, values } = buildEventsListQuery(query({ neighborhoods: 'Chelsea,Bushwick' }));
    expect(text).toContain('LIKE ANY($2)');
    expect(values[1]).toEqual(['%chelsea%', '%bushwick%']);
  });

  it('filters by venue id as a parameter', () => {
    const venueId = '7d9a1f9c-8f4e-4d7b-9a3e-2f1b6c5d4e3a';
    const { text, values } = buildEventsListQuery(query({ venueId }));
    expect(text).toContain('e.venue_id = $2');
    expect(values[1]).toBe(venueId);
  });

  it('rejects a non-uuid venueId at the schema layer', () => {
    expect(() => query({ venueId: 'not-a-uuid' })).toThrow();
  });

  it('fetches a sentinel row and offsets by page', () => {
    const { values } = buildEventsListQuery(query({ page: '3' }));
    expect(values.at(-2)).toBe(EVENT_PAGE_SIZE + 1);
    expect(values.at(-1)).toBe(2 * EVENT_PAGE_SIZE);
  });

  it('orders soonest-first', () => {
    const { text } = buildEventsListQuery(query());
    expect(text).toContain('ORDER BY e.start_time ASC');
  });
});
