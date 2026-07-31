import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody, parseQuery } from '@/app/api/utils/validation';
import { GigCreateSchema, GigListQuerySchema } from '@/app/api/utils/schemas';
import { GIG_PAGE_SIZE, buildGigsListQuery } from '@/app/api/utils/gigs-query';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';
import { withRlsContext } from '@/app/api/utils/rls';
import { track } from '@/app/api/utils/events';
import { isHotWindow, pushHotGigToTalent } from '@/app/api/utils/push';

const createLimiter = getRateLimiter('gigs-create', { windowMs: 60 * 60 * 1000, max: 30 });

/** Public listing. Only PUBLISHED gigs are ever served (drafts stay private). */
export const GET = withRoute('gigs.list', async (request) => {
  const filters = parseQuery(request.url, GigListQuerySchema);
  const { text, values } = buildGigsListQuery(filters);
  const rows = await sql(text, values);
  // The builder over-fetches by one row so hasMore needs no COUNT query.
  const hasMore = rows.length > GIG_PAGE_SIZE;
  const gigs = hasMore ? rows.slice(0, GIG_PAGE_SIZE) : rows;
  return Response.json({ gigs, page: filters.page, pageSize: GIG_PAGE_SIZE, hasMore });
});

/** Creates a gig for the calling venue (venue id derived from session, §6.2). */
export const POST = withRoute('gigs.create', async (request) => {
  const user = await authGuard.requireRole('VENUE');
  await enforceRateLimit(createLimiter, clientKey(request, user.id));

  const gig = await parseBody(request, GigCreateSchema);

  const venueRows = await sql`
    SELECT id FROM venue_profiles WHERE user_id = ${user.id} LIMIT 1
  `;
  if (venueRows.length === 0) {
    throw ApiError.badRequest('No venue profile found');
  }
  const venueId = venueRows[0].id;

  // RLS (S2): the insert must satisfy gigs_owner_all's WITH CHECK, which
  // keys on the request context once the app runs as the non-owner role.
  const result = await withRlsContext<Record<string, unknown>[]>(
    user,
    sql`
      INSERT INTO gigs (venue_id, title, role_needed, description, start_time, end_time, base_rate, tips_included, age_requirement, status)
      VALUES (${venueId}, ${gig.title}, ${gig.role_needed}, ${gig.description}, ${gig.start_time}, ${gig.end_time}, ${gig.base_rate}, ${gig.tips_included}, ${gig.age_requirement}, ${gig.status})
      RETURNING *
    `
  );

  await auditLogger.record({
    actorId: user.id,
    action: 'gig.create',
    entityType: 'gig',
    entityId: String(result[0]?.id ?? ''),
    metadata: { status: gig.status, venueId: String(venueId) },
  });

  // KPI capture (S6): publishing straight from the wizard counts.
  if (gig.status === 'PUBLISHED') {
    await track(user, 'gig.published', {
      venueId: String(venueId),
      gigId: String(result[0]?.id ?? ''),
      payload: { role: gig.role_needed },
    });
    // S9: Hot Tonight push (id-only payload; no-op without VAPID keys).
    if (isHotWindow(gig.start_time)) {
      await pushHotGigToTalent(String(result[0]?.id ?? ''));
    }
  }

  return Response.json({ gig: result[0] }, { status: 201 });
});
