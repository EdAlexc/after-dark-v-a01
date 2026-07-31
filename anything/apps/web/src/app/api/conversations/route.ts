import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { ConversationCreateSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';
import { withRlsContext } from '@/app/api/utils/rls';

const createLimiter = getRateLimiter('conversations-create', {
  windowMs: 60 * 60 * 1000,
  max: 30,
});

/**
 * GET /api/conversations (P5.1) — the caller's threads with the counterpart's
 * display card, last message, and unread count. Participant-scoped by
 * construction: the WHERE clause is the session user on either side.
 */
export const GET = withRoute('conversations.list', async () => {
  const user = await authGuard.requireSession();

  // RLS (S2): conversations/messages resolve through participant policies.
  const conversations = await withRlsContext<Record<string, unknown>[]>(
    user,
    sql`
    SELECT c.id, c.gig_id, c.kind, c.created_at,
           c.venue_user_id, c.counterpart_user_id,
           CASE WHEN c.venue_user_id = ${user.id} THEN cu.name ELSE vu.name END AS other_name,
           CASE WHEN c.venue_user_id = ${user.id} THEN c.counterpart_user_id ELSE c.venue_user_id END AS other_user_id,
           g.title AS gig_title, g.status AS gig_status, g.base_rate AS gig_base_rate,
           g.start_time AS gig_start_time,
           last.content AS last_content, last.kind AS last_kind, last.created_at AS last_at,
           (SELECT COUNT(*)::int FROM messages m
             WHERE m.conversation_id = c.id AND m.read_at IS NULL
               AND m.sender_id <> ${user.id}) AS unread_count
    FROM conversations c
    JOIN "user" vu ON vu.id = c.venue_user_id
    JOIN "user" cu ON cu.id = c.counterpart_user_id
    LEFT JOIN gigs g ON g.id = c.gig_id
    LEFT JOIN LATERAL (
      SELECT content, kind, created_at FROM messages m
      WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
    ) last ON true
    WHERE c.venue_user_id = ${user.id} OR c.counterpart_user_id = ${user.id}
    ORDER BY COALESCE(last.created_at, c.created_at) DESC
    LIMIT 50
  `
  );
  return Response.json({ conversations });
});

/**
 * POST /api/conversations — open (or return the existing) thread with a
 * counterpart, optionally anchored to a gig.
 *
 * Role semantics (§6.3): a PARTY user may only open PARTY_INQUIRY threads to
 * venues — that is their entire write surface. Gig threads are venue↔talent.
 */
export const POST = withRoute('conversations.create', async (request) => {
  const user = await authGuard.requireRole('TALENT', 'VENUE', 'PARTY');
  await enforceRateLimit(createLimiter, clientKey(request, user.id));
  const body = await parseBody(request, ConversationCreateSchema);

  // Gig-anchored inquiries resolve the counterpart server-side from the gig,
  // so clients never need (or see) a venue's auth user id.
  let counterpartId = body.counterpart_user_id ?? null;
  if (!counterpartId && body.gig_id) {
    const gigOwner = (await sql`
      SELECT vp.user_id FROM gigs g JOIN venue_profiles vp ON vp.id = g.venue_id
      WHERE g.id = ${body.gig_id} AND g.status IN ('PUBLISHED', 'FILLED')
      LIMIT 1
    `) as Array<{ user_id: string }>;
    if (gigOwner.length === 0) throw ApiError.notFound('Gig not found');
    counterpartId = gigOwner[0].user_id;
  }
  if (!counterpartId) throw ApiError.badRequest('No counterpart resolved');
  if (counterpartId === user.id) {
    throw ApiError.badRequest('You cannot message yourself');
  }

  const otherRows = (await sql`
    SELECT id, role FROM "user" WHERE id = ${counterpartId} LIMIT 1
  `) as Array<{ id: string; role: string | null }>;
  if (otherRows.length === 0) throw ApiError.notFound('User not found');
  const other = otherRows[0];

  // Work out which side is the venue. Exactly one participant must be one.
  const meIsVenue = user.role === 'VENUE';
  const otherIsVenue = other.role === 'VENUE';
  if (meIsVenue === otherIsVenue) {
    throw ApiError.badRequest('Conversations connect a venue with talent or a guest');
  }
  const venueUserId = meIsVenue ? user.id : other.id;
  const nonVenueUserId = meIsVenue ? other.id : user.id;
  const nonVenueRole = meIsVenue ? other.role : user.role;
  const kind = nonVenueRole === 'PARTY' ? 'PARTY_INQUIRY' : 'GIG';

  // PARTY users never join gig threads (read-only persona everywhere else).
  if (kind === 'PARTY_INQUIRY' && body.gig_id) {
    throw ApiError.forbidden('Private-party inquiries are not tied to gigs');
  }

  // Gig anchor must be a real, visible gig owned by the venue side.
  if (body.gig_id) {
    const gigRows = await sql`
      SELECT g.id FROM gigs g JOIN venue_profiles vp ON vp.id = g.venue_id
      WHERE g.id = ${body.gig_id} AND vp.user_id = ${venueUserId}
        AND g.status IN ('PUBLISHED', 'FILLED')
      LIMIT 1
    `;
    if (gigRows.length === 0) throw ApiError.notFound('Gig not found');
  }

  const existing = await withRlsContext<Array<{ id: string }>>(
    user,
    sql`
      SELECT id FROM conversations
      WHERE venue_user_id = ${venueUserId} AND counterpart_user_id = ${nonVenueUserId}
        AND (gig_id = ${body.gig_id ?? null} OR (gig_id IS NULL AND ${body.gig_id ?? null}::uuid IS NULL))
      LIMIT 1
    `
  );
  if (existing.length > 0) {
    return Response.json({ conversation: { id: existing[0].id }, created: false });
  }

  // RLS (S2): conversations_participant WITH CHECKs the caller is a side.
  const created = await withRlsContext<Array<{ id: string }>>(
    user,
    sql`
      INSERT INTO conversations (gig_id, venue_user_id, counterpart_user_id, kind)
      VALUES (${body.gig_id ?? null}, ${venueUserId}, ${nonVenueUserId}, ${kind})
      RETURNING id, gig_id, kind, created_at
    `
  );

  await auditLogger.record({
    actorId: user.id,
    action: 'conversation.create',
    entityType: 'conversation',
    entityId: created[0].id,
    metadata: { kind, gigId: body.gig_id ?? null },
  });

  return Response.json({ conversation: created[0], created: true }, { status: 201 });
});
