/**
 * Pure SQL builder for the public venue directory (S19 — §6.3 PARTY
 * discovery: "browse venues to book for private parties").
 *
 * Same invariants as talent-query.ts:
 *  - user input ONLY ever lands in `values`, never in `text`;
 *  - only public-profile columns are selected — never user_id, email, or
 *    anything from the auth tables (TENANT_GUARDRAIL §6 tenant isolation).
 *    The street address stays off the LIST projection; the detail route
 *    serves it (it is already public via every gig card's venue join);
 *  - LIMIT/OFFSET are server-computed bounded numbers, passed as parameters.
 *
 * Profiles without a venue name are treated as unpublished and never listed.
 */

import type { VenueListQuery } from './schemas';
import type { BuiltQuery } from './talent-query';

export const VENUE_PAGE_SIZE = 12;

/** Public columns for directory cards — no user_id, no address. */
export const VENUE_LIST_COLUMNS =
  'id, venue_name, neighborhood, description, venue_type, capacity, ' +
  'music_genres, avatar_url, gallery_images, rating, rating_count, created_at';

/** See gigs-query.ts — one array param of lowercased LIKE patterns. */
function likePatterns(items: string[]): string[] {
  return items.map((item) => `%${item.toLowerCase()}%`);
}

export function buildVenueListQuery(filters: VenueListQuery): BuiltQuery {
  let text = `
    SELECT ${VENUE_LIST_COLUMNS}
    FROM venue_profiles
    WHERE venue_name IS NOT NULL AND venue_name <> ''
  `;
  const values: (string | number | string[])[] = [];
  let index = 1;

  if (filters.neighborhoods && filters.neighborhoods.length > 0) {
    text += ` AND LOWER(neighborhood) LIKE ANY($${index})`;
    values.push(likePatterns(filters.neighborhoods));
    index++;
  } else if (filters.neighborhood) {
    text += ` AND LOWER(neighborhood) LIKE LOWER($${index})`;
    values.push(`%${filters.neighborhood}%`);
    index++;
  }
  if (filters.venueType) {
    text += ` AND LOWER(venue_type) LIKE LOWER($${index})`;
    values.push(`%${filters.venueType}%`);
    index++;
  }
  if (filters.q) {
    text += ` AND (LOWER(venue_name) LIKE $${index} OR LOWER(COALESCE(description, '')) LIKE $${index}
      OR LOWER(COALESCE(venue_type, '')) LIKE $${index} OR LOWER(COALESCE(neighborhood, '')) LIKE $${index})`;
    values.push(`%${filters.q.toLowerCase()}%`);
    index++;
  }

  text += ` ORDER BY rating DESC NULLS LAST, venue_name ASC`;
  // Sentinel row: fetch one extra to learn whether another page exists.
  text += ` LIMIT $${index} OFFSET $${index + 1}`;
  values.push(VENUE_PAGE_SIZE + 1, (filters.page - 1) * VENUE_PAGE_SIZE);

  return { text, values };
}
