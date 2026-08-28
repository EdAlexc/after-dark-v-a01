/**
 * Pure SQL builder for the public event listing ("Browse Events").
 *
 * Same invariants as gigs-query.ts / venue-query.ts:
 *  - user input ONLY ever lands in `values`, never in `text`;
 *  - status is hard-pinned to PUBLISHED;
 *  - only public columns travel — the venue join serves display fields,
 *    never user ids (TENANT_GUARDRAIL §6);
 *  - LIMIT/OFFSET are server-computed bounded numbers, passed as parameters.
 *
 * Upcoming-only is built in: an event stays listed until it has fully ended
 * (COALESCE to start_time for open-ended listings), so a party that is
 * mid-swing at 1 AM is still discoverable.
 */

import type { EventListQuery } from './schemas';
import type { BuiltQuery } from './talent-query';

export const EVENT_PAGE_SIZE = 12;

/** See gigs-query.ts — one array param of lowercased LIKE patterns. */
function likePatterns(items: string[]): string[] {
  return items.map((item) => `%${item.toLowerCase()}%`);
}

export function buildEventsListQuery(filters: EventListQuery): BuiltQuery {
  let text = `
    SELECT e.id, e.title, e.description, e.start_time, e.end_time,
           e.age_requirement, e.source_platform, e.venue_id,
           vp.venue_name, vp.neighborhood AS venue_neighborhood,
           vp.venue_type, vp.avatar_url AS venue_avatar_url,
           (
             SELECT COUNT(*)::int FROM gigs g
             WHERE g.event_listing_id = e.id AND g.status = 'PUBLISHED'
               AND (g.start_time IS NULL OR g.start_time >= NOW())
           ) AS open_gig_count
    FROM event_listings e
    JOIN venue_profiles vp ON e.venue_id = vp.id
    WHERE e.status = $1
      AND COALESCE(e.end_time, e.start_time) >= NOW()
  `;
  const values: (string | number | string[])[] = ['PUBLISHED'];
  let index = 2;

  if (filters.venueId) {
    text += ` AND e.venue_id = $${index}`;
    values.push(filters.venueId);
    index++;
  }
  if (filters.neighborhoods && filters.neighborhoods.length > 0) {
    text += ` AND LOWER(COALESCE(vp.neighborhood, '')) LIKE ANY($${index})`;
    values.push(likePatterns(filters.neighborhoods));
    index++;
  } else if (filters.neighborhood) {
    text += ` AND LOWER(COALESCE(vp.neighborhood, '')) LIKE LOWER($${index})`;
    values.push(`%${filters.neighborhood}%`);
    index++;
  }
  if (filters.q) {
    text += ` AND (LOWER(e.title) LIKE $${index} OR LOWER(vp.venue_name) LIKE $${index}
      OR LOWER(COALESCE(vp.neighborhood, '')) LIKE $${index})`;
    values.push(`%${filters.q.toLowerCase()}%`);
    index++;
  }

  // Soonest night first — the discovery default for "what's on".
  text += ` ORDER BY e.start_time ASC, e.title ASC`;

  // Sentinel row: fetch one extra to learn whether another page exists.
  text += ` LIMIT $${index} OFFSET $${index + 1}`;
  values.push(EVENT_PAGE_SIZE + 1, (filters.page - 1) * EVENT_PAGE_SIZE);

  return { text, values };
}
