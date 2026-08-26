import sql from '@/app/api/utils/sql';
import { TalentIdSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';

/**
 * Public talent detail (S20 — the page the profile editor's Preview button
 * and every directory card link to). The directory's public columns plus the
 * two profile-editor surfaces that are public by design (wireframe p9):
 * portfolio images and social links. Deliberately NO shift/booking counts —
 * shifts are participant-private under RLS, so a bare aggregate here would
 * silently read zero post-cutover (rating/trust_score, recomputed server-side
 * by S8, are the public trust signals). The talent's auth user id never
 * leaves the server — venue outreach resolves it server-side from this row's
 * id (conversations.create talent_id).
 */
export const GET = withRoute('talent.detail', async (_request, context) => {
  const params = await context.params;
  const parsed = TalentIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();

  const rows = (await sql`
    SELECT tp.id, tp.stage_name, tp.pronouns, tp.neighborhood, tp.bio,
           tp.primary_role, tp.genres_vibes, tp.hourly_rate_min, tp.hourly_rate_max,
           tp.avatar_url, tp.portfolio_images, tp.social_links,
           tp.available_tonight, tp.rating, tp.rating_count, tp.trust_score,
           tp.created_at
    FROM talent_profiles tp
    WHERE tp.id = ${parsed.data}
      AND tp.stage_name IS NOT NULL AND tp.stage_name <> ''
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (rows.length === 0) throw ApiError.notFound('Talent not found');

  return Response.json({ talent: rows[0] });
});
