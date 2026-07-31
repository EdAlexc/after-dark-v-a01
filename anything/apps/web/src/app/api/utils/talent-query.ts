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
  values: (string | number | string[])[];
}

/** See gigs-query.ts — one array param of lowercased LIKE patterns. */
function likePatterns(items: string[]): string[] {
  return items.map((item) => `%${item.toLowerCase()}%`);
}

export function buildTalentListQuery(filters: TalentListQuery): BuiltQuery {
  let text = `
    SELECT id, stage_name, pronouns, neighborhood, bio, primary_role,
           genres_vibes, hourly_rate_min, hourly_rate_max, avatar_url,
           profile_completion_pct, available_tonight, created_at
    FROM talent_profiles
    WHERE stage_name IS NOT NULL AND stage_name <> ''
  `;
  const values: (string | number | string[])[] = [];
  let index = 1;

  // Multi-value filters (S5 / #27) supersede the single-value params.
  if (filters.neighborhoods && filters.neighborhoods.length > 0) {
    text += ` AND LOWER(neighborhood) LIKE ANY($${index})`;
    values.push(likePatterns(filters.neighborhoods));
    index++;
  } else if (filters.neighborhood) {
    text += ` AND LOWER(neighborhood) LIKE LOWER($${index})`;
    values.push(`%${filters.neighborhood}%`);
    index++;
  }
  if (filters.roles && filters.roles.length > 0) {
    text += ` AND LOWER(primary_role) LIKE ANY($${index})`;
    values.push(likePatterns(filters.roles));
    index++;
  } else if (filters.role) {
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

  // Ranking (P6 + S5/#28): Available-tonight boost first, then talent with an
  // open AVAILABLE slot today, then most complete profiles — the closest
  // thing to "quality" pre-reviews. The probe goes through the 0017 SECURITY
  // DEFINER helper: availabilities are RLS'd talent-own, so a direct EXISTS
  // would silently stop boosting once the app runs as the non-owner role.
  text += ` ORDER BY available_tonight DESC,
    app_talent_available_on(talent_profiles.id, CURRENT_DATE) DESC,
    profile_completion_pct DESC NULLS LAST, created_at DESC`;

  const offset = (filters.page - 1) * TALENT_PAGE_SIZE;
  text += ` LIMIT $${index} OFFSET $${index + 1}`;
  values.push(TALENT_PAGE_SIZE + 1, offset);

  return { text, values };
}
