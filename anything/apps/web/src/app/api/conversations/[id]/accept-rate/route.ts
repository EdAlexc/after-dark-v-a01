import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { notify } from '@/app/api/utils/notify';
import { parseBody } from '@/app/api/utils/validation';
import { AcceptRateSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';
import { z } from 'zod';

const ConversationIdSchema = z.string().uuid();

/**
 * POST /api/conversations/[id]/accept-rate (P5.2) — accept the counterpart's
 * RATE_PROPOSAL. The agreed rate is written onto the talent's application for
 * the conversation's gig, so a later hire freezes THIS number into the shift.
 *
 * Rules that matter:
 *  - only a participant may accept, and only the OTHER side's proposal
 *    (you cannot accept your own offer on someone's behalf);
 *  - the conversation must be gig-anchored — free-floating threads have no
 *    application to write to;
 *  - a SYSTEM message records the acceptance in the thread itself.
 */
export const POST = withRoute('conversations.accept-rate', async (request, context) => {
  const user = await authGuard.requireRole('TALENT', 'VENUE');
  const params = await context.params;
  const parsed = ConversationIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();
  const { message_id } = await parseBody(request, AcceptRateSchema);

  // RLS (S2): participant policies bound the read to the caller's threads.
  const rows = await withRlsContext<Array<{
    id: string;
    gig_id: string | null;
    venue_user_id: string;
    counterpart_user_id: string;
    message_id: string;
    sender_id: string;
    kind: string;
    rate_cents: number | null;
  }>>(
    user,
    sql`
      SELECT c.id, c.gig_id, c.venue_user_id, c.counterpart_user_id,
             m.id AS message_id, m.sender_id, m.kind, m.rate_cents
      FROM conversations c
      JOIN messages m ON m.conversation_id = c.id
      WHERE c.id = ${parsed.data} AND m.id = ${message_id}
        AND (c.venue_user_id = ${user.id} OR c.counterpart_user_id = ${user.id})
      LIMIT 1
    `
  );
  if (rows.length === 0) throw ApiError.notFound();
  const row = rows[0];

  if (row.kind !== 'RATE_PROPOSAL' || row.rate_cents == null) {
    throw ApiError.badRequest('That message is not a rate proposal');
  }
  if (row.sender_id === user.id) {
    throw ApiError.badRequest('You cannot accept your own proposal');
  }
  if (!row.gig_id) {
    throw ApiError.badRequest('This conversation is not linked to a gig');
  }

  // The application belongs to the talent side of the thread, whoever that is.
  const talentUserId =
    row.venue_user_id === user.id ? row.counterpart_user_id : user.id;

  // Either side may accept: the talent updates their own application, the
  // venue updates an application to their own gig (applications_venue_update).
  const updated = await withRlsContext<Array<{ id: string }>>(
    user,
    sql`
      UPDATE applications a
      SET proposed_rate_cents = ${row.rate_cents}, updated_at = NOW()
      FROM talent_profiles tp
      WHERE a.talent_id = tp.id AND tp.user_id = ${talentUserId}
        AND a.gig_id = ${row.gig_id}
        AND a.status IN ('PENDING', 'SHORTLISTED')
      RETURNING a.id
    `
  );
  if (updated.length === 0) {
    throw ApiError.badRequest(
      'No open application to apply this rate to — the talent must apply to the gig first'
    );
  }

  const dollars = (row.rate_cents / 100).toFixed(2);
  await withRlsContext(
    user,
    sql`
      INSERT INTO messages (conversation_id, sender_id, content, kind)
      VALUES (${row.id}, ${user.id}, ${'Rate of $' + dollars + '/hr accepted'}, 'SYSTEM')
    `
  );

  await auditLogger.record({
    actorId: user.id,
    action: 'rate.accept',
    entityType: 'application',
    entityId: updated[0].id,
    metadata: { rateCents: row.rate_cents, conversationId: row.id },
  });
  await notify(row.sender_id, 'application.status', {
    status: 'RATE_ACCEPTED',
    rateCents: row.rate_cents,
    conversationId: row.id,
  });

  return Response.json({ accepted: true, applicationId: updated[0].id });
});
