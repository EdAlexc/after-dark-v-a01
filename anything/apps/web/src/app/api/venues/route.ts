import sql from '@/app/api/utils/sql';
import { parseQuery } from '@/app/api/utils/validation';
import { VenueListQuerySchema } from '@/app/api/utils/schemas';
import { VENUE_PAGE_SIZE, buildVenueListQuery } from '@/app/api/utils/venue-query';
import { withRoute } from '@/app/api/utils/route-kit';

/**
 * Public venue directory (S19 — §6.3: party people "browse venues to book
 * for private parties"). Serves only public-profile columns for profiles
 * that set a venue name — never auth-table data, never the owner's user id.
 */
export const GET = withRoute('venues.list', async (request) => {
  const filters = parseQuery(request.url, VenueListQuerySchema);
  const { text, values } = buildVenueListQuery(filters);
  const rows = await sql(text, values);
  const hasMore = rows.length > VENUE_PAGE_SIZE;
  const venues = hasMore ? rows.slice(0, VENUE_PAGE_SIZE) : rows;
  return Response.json({ venues, page: filters.page, pageSize: VENUE_PAGE_SIZE, hasMore });
});
