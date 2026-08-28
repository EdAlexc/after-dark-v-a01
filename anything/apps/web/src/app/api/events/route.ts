import sql from '@/app/api/utils/sql';
import { parseQuery } from '@/app/api/utils/validation';
import { EventListQuerySchema } from '@/app/api/utils/schemas';
import { EVENT_PAGE_SIZE, buildEventsListQuery } from '@/app/api/utils/event-listings-query';
import { withRoute } from '@/app/api/utils/route-kit';

/**
 * Public event listings ("Browse Events" — the party-people/visitor half of
 * "Browse Gigs & Events"). Serves upcoming PUBLISHED events with public venue
 * display columns and an open-roles count; applying to those roles is the
 * gig surface's job and stays talent-only there.
 */
export const GET = withRoute('events.list', async (request) => {
  const filters = parseQuery(request.url, EventListQuerySchema);
  const { text, values } = buildEventsListQuery(filters);
  const rows = await sql(text, values);
  const hasMore = rows.length > EVENT_PAGE_SIZE;
  const events = hasMore ? rows.slice(0, EVENT_PAGE_SIZE) : rows;
  return Response.json({ events, page: filters.page, pageSize: EVENT_PAGE_SIZE, hasMore });
});
