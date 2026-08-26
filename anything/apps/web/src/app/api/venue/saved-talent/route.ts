import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { parseBody } from '@/app/api/utils/validation';
import { SavedTalentPutSchema } from '@/app/api/utils/schemas';
import { withRoute, ApiError } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

const saveLimiter = getRateLimiter('saved-talent-write', { windowMs: 60 * 1000, max: 60 });

/** Personal bookmark lists stay bounded — nobody curates 200+ shortlisted DJs. */
const SAVED_TALENT_LIMIT = 200;

/**
 * GET /api/venue/saved-talent (S20 F4) — the venue user's saved-talent list,
 * joined with the same public talent columns the directory serves so the
 * saved rail renders without re-fetching browse pages (and keeps rendering
 * people who are not on the current page — the pre-S20 client-state bug).
 * Never the talent's user_id: outreach goes through the conversations
 * talent_id anchor, which resolves it server-side.
 */
export const GET = withRoute('venue.savedTalent.list', async () => {
  const user = await authGuard.requireRole('VENUE');

  // RLS (0024): saved_talent_owner_all scopes rows to this user; the join
  // rides talent_profiles' public-read policy.
  const savedTalent = await withRlsContext<Array<Record<string, unknown>>>(
    user,
    sql`
      SELECT tp.id, tp.stage_name, tp.pronouns, tp.neighborhood, tp.primary_role,
             tp.genres_vibes, tp.hourly_rate_min, tp.hourly_rate_max, tp.avatar_url,
             tp.available_tonight, tp.rating, tp.rating_count, tp.trust_score,
             st.created_at AS saved_at
      FROM saved_talent st
      JOIN talent_profiles tp ON tp.id = st.talent_id
      WHERE st.venue_user_id = ${user.id}
      ORDER BY st.created_at DESC
      LIMIT ${SAVED_TALENT_LIMIT}
    `
  );

  return Response.json({ savedTalent });
});

/**
 * PUT /api/venue/saved-talent — idempotent save/unsave toggle for one public
 * talent_profiles.id. Both directions converge (ON CONFLICT DO NOTHING /
 * unconditional DELETE), so double-clicks and replays are no-ops. A bookmark
 * is the venue user's private preference — deliberately unaudited (see the
 * audit-coverage registry) and invisible to the talent.
 */
export const PUT = withRoute('venue.savedTalent.write', async (request) => {
  const user = await authGuard.requireRole('VENUE');
  await enforceRateLimit(saveLimiter, clientKey(request, user.id));
  const body = await parseBody(request, SavedTalentPutSchema);

  if (body.saved) {
    // Only directory-listed talent can be bookmarked (public-read predicate).
    const listed = (await sql`
      SELECT id FROM talent_profiles
      WHERE id = ${body.talent_id} AND stage_name IS NOT NULL AND stage_name <> ''
      LIMIT 1
    `) as Array<{ id: string }>;
    if (listed.length === 0) throw ApiError.notFound('Talent not found');

    // RLS (0024): saved_talent_owner_all WITH CHECKs venue_user_id = context.
    await withRlsContext(
      user,
      sql`
        INSERT INTO saved_talent (venue_user_id, talent_id)
        VALUES (${user.id}, ${body.talent_id})
        ON CONFLICT (venue_user_id, talent_id) DO NOTHING
      `
    );
  } else {
    await withRlsContext(
      user,
      sql`
        DELETE FROM saved_talent
        WHERE venue_user_id = ${user.id} AND talent_id = ${body.talent_id}
      `
    );
  }

  return Response.json({ talent_id: body.talent_id, saved: body.saved });
});
