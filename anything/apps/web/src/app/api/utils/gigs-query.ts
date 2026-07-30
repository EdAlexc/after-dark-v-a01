/**
 * Pure SQL builder for the public gig listing.
 *
 * Extracted so the parameterization invariants are unit-testable
 * (TENANT_GUARDRAIL §5 A03 — SQLi regression suite):
 *  - user input ONLY ever lands in `values`, never in `text`;
 *  - status is hard-pinned to PUBLISHED (draft-leak fix, §5 A01);
 *  - LIMIT/OFFSET are server-computed bounded numbers, passed as parameters.
 *
 * Pagination (P1.1): callers pass a validated 1-based `page`; the query
 * fetches `GIG_PAGE_SIZE + 1` rows so the route can report `hasMore`
 * without a COUNT round-trip.
 */

import type { GigListQuery } from './schemas';

export const GIG_PAGE_SIZE = 12;
/** Hard ceiling — no request can pull more rows than this per call. */
export const GIG_LIST_LIMIT = 50;

export interface BuiltQuery {
  text: string;
  values: (string | number)[];
}

export function buildGigsListQuery(filters: GigListQuery): BuiltQuery {
  let text = `
    SELECT g.*, vp.venue_name, vp.neighborhood AS venue_neighborhood,
           vp.address, vp.avatar_url AS venue_avatar_url, vp.rating as venue_rating
    FROM gigs g
    JOIN venue_profiles vp ON g.venue_id = vp.id
    WHERE g.status = $1
  `;
  const values: (string | number)[] = ['PUBLISHED'];
  let index = 2;

  if (filters.tonightOnly) {
    // Rolling 24h window, not a UTC calendar-date match: a 10 PM EDT gig is
    // already "tomorrow" in UTC, so DATE() comparisons drop tonight's gigs.
    text += ` AND g.start_time >= NOW() AND g.start_time < NOW() + INTERVAL '24 hours'`;
  }
  if (filters.neighborhood) {
    text += ` AND (LOWER(vp.neighborhood) LIKE LOWER($${index}) OR LOWER(vp.address) LIKE LOWER($${index}))`;
    values.push(`%${filters.neighborhood}%`);
    index++;
  }
  if (filters.role) {
    text += ` AND LOWER(g.role_needed) LIKE LOWER($${index})`;
    values.push(`%${filters.role}%`);
    index++;
  }
  if (filters.minRate !== undefined) {
    text += ` AND g.base_rate >= $${index}`;
    values.push(filters.minRate);
    index++;
  }
  if (filters.maxRate !== undefined) {
    text += ` AND g.base_rate <= $${index}`;
    values.push(filters.maxRate);
    index++;
  }

  // Soonest night first; undated (legacy) gigs sink to the end.
  text += ` ORDER BY g.start_time ASC NULLS LAST, g.created_at DESC`;

  const pageSize = Math.min(GIG_PAGE_SIZE, GIG_LIST_LIMIT);
  const offset = (filters.page - 1) * pageSize;
  text += ` LIMIT $${index} OFFSET $${index + 1}`;
  values.push(pageSize + 1, offset);

  return { text, values };
}
