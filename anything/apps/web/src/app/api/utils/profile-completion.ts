/**
 * Talent profile-completion % (wireframe p8 "Profile Completion" card).
 * Server-computed only — the client-sent value is ignored (schemas strip it).
 */

export interface TalentCompletionInput {
  stage_name?: string | null;
  pronouns?: string | null;
  neighborhood?: string | null;
  bio?: string | null;
  primary_role?: string | null;
  genres_vibes?: unknown[] | null;
  hourly_rate_min?: number | null;
  hourly_rate_max?: number | null;
  social_links?: Record<string, unknown> | null;
  avatar_url?: string | null;
}

const SEGMENTS = 9;

export function computeTalentProfileCompletion(input: TalentCompletionInput): number {
  let filled = 0;
  if (input.stage_name) filled++;
  if (input.pronouns) filled++;
  if (input.neighborhood) filled++;
  if (input.bio) filled++;
  if (input.primary_role) filled++;
  if (input.genres_vibes?.length) filled++;
  if (input.hourly_rate_min || input.hourly_rate_max) filled++;
  if (input.social_links && Object.values(input.social_links).some(Boolean)) filled++;
  if (input.avatar_url) filled++;
  return Math.round((filled / SEGMENTS) * 100);
}
