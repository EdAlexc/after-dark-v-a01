/**
 * Pure SQL builder for the public gig listing.
 *
 * Extracted so the parameterization invariants are unit-testable
 * (TENANT_GUARDRAIL §5 A03 — SQLi regression suite):
 *  - user input ONLY ever lands in `values`, never in `text`;
 *  - status is hard-pinned to PUBLISHED (draft-leak fix, §5 A01);
 *  - LIMIT is a bounded constant.
 */

import type { GigListQuery } from './schemas';

export const GIG_LIST_LIMIT = 50;

export interface BuiltQuery {
  text: string;
  values: (string | number)[];
}

export function buildGigsListQuery(filters: GigListQuery): BuiltQuery {
  let text = `
    SELECT g.*, vp.venue_name, vp.address, vp.rating as venue_rating
    FROM gigs g
    JOIN venue_profiles vp ON g.venue_id = vp.id
    WHERE g.status = $1
  `;
  const values: (string | number)[] = ['PUBLISHED'];
  let index = 2;

  if (filters.tonightOnly) {
    text += ` AND DATE(g.start_time) = CURRENT_DATE`;
  }
  if (filters.neighborhood) {
    text += ` AND LOWER(vp.address) LIKE LOWER($${index})`;
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

  text += ` ORDER BY g.created_at DESC LIMIT ${GIG_LIST_LIMIT}`;
  return { text, values };
}
