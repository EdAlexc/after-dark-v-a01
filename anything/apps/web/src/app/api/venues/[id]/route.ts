import sql from '@/app/api/utils/sql';
import { VenueIdSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';

/**
 * Public venue detail (S19 — the page a private-party inquiry starts from).
 * Public-profile columns plus the same venue-card aggregates the gig detail
 * already exposes (gigs hosted). The street address is served here like it is
 * on every gig card's venue join; the owner's auth user id never leaves the
 * server — inquiries resolve it server-side from this row's id.
 *
 * response_rate (S20 D3): % of last-90d inbound conversations the venue
 * answered, via the 0024 SECURITY DEFINER aggregate (conversations/messages
 * are participant-private — a bare aggregate would zero out post-cutover).
 * NULL below 3 inbound threads: a one-sample 0% or 100% reads as reputation.
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
             AS open_gigs,
           CASE WHEN rs.inbound_count >= 3
                THEN ROUND(100.0 * rs.responded_count / rs.inbound_count)::int
                ELSE NULL END AS response_rate
    FROM venue_profiles vp
    LEFT JOIN LATERAL app_venue_response_stats(vp.id) rs ON TRUE
    WHERE vp.id = ${parsed.data}
      AND vp.venue_name IS NOT NULL AND vp.venue_name <> ''
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (rows.length === 0) throw ApiError.notFound('Venue not found');

  return Response.json({ venue: rows[0] });
});
