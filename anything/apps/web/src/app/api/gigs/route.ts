import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody, parseQuery } from '@/app/api/utils/validation';
import { GigCreateSchema, GigListQuerySchema } from '@/app/api/utils/schemas';
import { buildGigsListQuery } from '@/app/api/utils/gigs-query';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

const createLimiter = getRateLimiter('gigs-create', { windowMs: 60 * 60 * 1000, max: 30 });

/** Public listing. Only PUBLISHED gigs are ever served (drafts stay private). */
export const GET = withRoute('gigs.list', async (request) => {
  const filters = parseQuery(request.url, GigListQuerySchema);
  const { text, values } = buildGigsListQuery(filters);
  const gigs = await sql(text, values as (string | number)[]);
  return Response.json({ gigs });
});

/** Creates a gig for the calling venue (venue id derived from session, §6.2). */
export const POST = withRoute('gigs.create', async (request) => {
  const user = await authGuard.requireRole('VENUE');
  enforceRateLimit(createLimiter, clientKey(request, user.id));

  const gig = await parseBody(request, GigCreateSchema);

  const venueRows = await sql`
    SELECT id FROM venue_profiles WHERE user_id = ${user.id} LIMIT 1
  `;
  if (venueRows.length === 0) {
    throw ApiError.badRequest('No venue profile found');
  }
  const venueId = venueRows[0].id;

  const result = await sql`
    INSERT INTO gigs (venue_id, title, role_needed, description, start_time, end_time, base_rate, tips_included, status)
    VALUES (${venueId}, ${gig.title}, ${gig.role_needed}, ${gig.description}, ${gig.start_time}, ${gig.end_time}, ${gig.base_rate}, ${gig.tips_included}, ${gig.status})
    RETURNING *
  `;

  await auditLogger.record({
    actorId: user.id,
    action: 'gig.create',
    entityType: 'gig',
    entityId: String(result[0]?.id ?? ''),
    metadata: { status: gig.status, venueId: String(venueId) },
  });

  return Response.json({ gig: result[0] }, { status: 201 });
});
