import sql from '@/app/api/utils/sql';
import { VenueIdSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';

/**
 * Public venue detail (S19 — the page a private-party inquiry starts from).
 * Public-profile columns plus the same venue-card aggregates the gig detail
 * already exposes (gigs hosted). The street address is served here like it is
 * on every gig card's venue join; the owner's auth user id never leaves the
 * server — inquiries resolve it server-side from this row's id.
 */
export const GET = withRoute('venues.detail', async (_request, context) => {
  const params = await context.params;
  const parsed = VenueIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();

  const rows = (await sql`
    SELECT vp.id, vp.venue_name, vp.neighborhood, vp.address, vp.description,
           vp.venue_type, vp.capacity, vp.music_genres, vp.operating_hours,
           vp.avatar_url, vp.gallery_images, vp.social_links,
           vp.rating, vp.rating_count, vp.created_at,
           (SELECT COUNT(*)::int FROM gigs g
             WHERE g.venue_id = vp.id AND g.status IN ('FILLED', 'COMPLETED'))
             AS gigs_hosted,
           (SELECT COUNT(*)::int FROM gigs g
             WHERE g.venue_id = vp.id AND g.status = 'PUBLISHED')
             AS open_gigs
    FROM venue_profiles vp
    WHERE vp.id = ${parsed.data}
      AND vp.venue_name IS NOT NULL AND vp.venue_name <> ''
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (rows.length === 0) throw ApiError.notFound('Venue not found');

  return Response.json({ venue: rows[0] });
});
