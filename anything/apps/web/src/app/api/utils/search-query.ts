/**
 * Pure SQL builders for global search (S5 / Backlog #7).
 *
 * Same invariants as gigs-query.ts / talent-query.ts:
 *  - user input ONLY ever lands in `values`, never in `text`;
 *  - the term feeds `plainto_tsquery` exclusively — plainto treats the input
 *    as plain words (no tsquery operators), so there is no query-language
 *    injection surface (the S5 security gate);
 *  - gigs are hard-pinned to PUBLISHED; talent to stage-named profiles;
 *  - only public columns are projected — never user ids, emails, or
 *    anything from the auth tables;
 *  - LIMIT is a server-bounded number, passed as a parameter.
 *
 * The tsvector expressions match migration 0015's GIN indexes verbatim so
 * the planner can use them. A LIKE-substring fallback is OR'd in for short /
 * partial words ("marc" → "Marcus"), which FTS alone would miss; it's the
 * same parameterized pattern the browse filters already use.
 */

import type { BuiltQuery } from './gigs-query';

/** Hard ceiling on rows per entity type, whatever the client asks for. */
export const SEARCH_LIMIT_MAX = 20;

const GIG_TSV = `to_tsvector('english', coalesce(g.title, '') || ' ' || coalesce(g.description, ''))`;
const TALENT_TSV = `to_tsvector('english', coalesce(stage_name, '') || ' ' || coalesce(bio, ''))`;

export function buildGigSearchQuery(term: string, limit: number): BuiltQuery {
  const bounded = Math.max(1, Math.min(limit, SEARCH_LIMIT_MAX));
  return {
    text: `
      SELECT g.id, g.title, g.role_needed, g.start_time, g.end_time, g.base_rate,
             g.tips_included, vp.venue_name, vp.neighborhood AS venue_neighborhood,
             ts_rank(${GIG_TSV}, plainto_tsquery('english', $1)) AS rank
      FROM gigs g
      JOIN venue_profiles vp ON g.venue_id = vp.id
      WHERE g.status = 'PUBLISHED'
        AND (${GIG_TSV} @@ plainto_tsquery('english', $1) OR LOWER(g.title) LIKE $2)
      ORDER BY rank DESC, g.start_time ASC NULLS LAST
      LIMIT $3
    `,
    values: [term, `%${term.toLowerCase()}%`, bounded],
  };
}

export function buildTalentSearchQuery(term: string, limit: number): BuiltQuery {
  const bounded = Math.max(1, Math.min(limit, SEARCH_LIMIT_MAX));
  return {
    text: `
      SELECT id, stage_name, primary_role, neighborhood, hourly_rate_min,
             hourly_rate_max, avatar_url, available_tonight,
             ts_rank(${TALENT_TSV}, plainto_tsquery('english', $1)) AS rank
      FROM talent_profiles
      WHERE stage_name IS NOT NULL AND stage_name <> ''
        AND (${TALENT_TSV} @@ plainto_tsquery('english', $1) OR LOWER(stage_name) LIKE $2)
      ORDER BY rank DESC, available_tonight DESC
      LIMIT $3
    `,
    values: [term, `%${term.toLowerCase()}%`, bounded],
  };
}
