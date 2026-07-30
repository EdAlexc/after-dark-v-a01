/**
 * Pure SQL builder for the public talent directory (venue browse, P1.1).
 *
 * Same invariants as gigs-query.ts:
 *  - user input ONLY ever lands in `values`, never in `text`;
 *  - only public-profile columns are selected — never user_id, email, or
 *    anything from the auth tables (TENANT_GUARDRAIL §6 tenant isolation);
 *  - LIMIT/OFFSET are server-computed bounded numbers, passed as parameters.
 *
 * Profiles without a stage name are treated as unpublished and never listed.
 */

import type { TalentListQuery } from './schemas';

export const TALENT_PAGE_SIZE = 12;

export interface BuiltQuery {
  text: string;
  values: (string | number)[];
}

export function buildTalentListQuery(filters: TalentListQuery): BuiltQuery {
  let text = `
    SELECT id, stage_name, pronouns, neighborhood, bio, primary_role,
           genres_vibes, hourly_rate_min, hourly_rate_max, avatar_url,
           profile_completion_pct, available_tonight, created_at
    FROM talent_profiles
    WHERE stage_name IS NOT NULL AND stage_name <> ''
  `;
  const values: (string | number)[] = [];
  let index = 1;

  if (filters.neighborhood) {
    text += ` AND LOWER(neighborhood) LIKE LOWER($${index})`;
    values.push(`%${filters.neighborhood}%`);
    index++;
  }
  if (filters.role) {
    text += ` AND LOWER(primary_role) LIKE LOWER($${index})`;
    values.push(`%${filters.role}%`);
    index++;
  }
  if (filters.minRate !== undefined) {
    // Rate-range overlap: the talent's band must reach the requested floor.
    text += ` AND hourly_rate_max IS NOT NULL AND hourly_rate_max >= $${index}`;
    values.push(filters.minRate);
    index++;
  }
  if (filters.maxRate !== undefined) {
    text += ` AND hourly_rate_min IS NOT NULL AND hourly_rate_min <= $${index}`;
    values.push(filters.maxRate);
    index++;
  }

  // Available-tonight boost first (P6), then most complete profiles — the
  // closest thing to "quality" pre-reviews.
  text += ` ORDER BY available_tonight DESC, profile_completion_pct DESC NULLS LAST, created_at DESC`;

  const offset = (filters.page - 1) * TALENT_PAGE_SIZE;
  text += ` LIMIT $${index} OFFSET $${index + 1}`;
  values.push(TALENT_PAGE_SIZE + 1, offset);

  return { text, values };
}
