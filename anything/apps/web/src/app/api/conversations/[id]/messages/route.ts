import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { notify } from '@/app/api/utils/notify';
import { parseBody } from '@/app/api/utils/validation';
import { MessageCreateSchema } from '@/app/api/utils/schemas';
import { sanitizeMediaField } from '@/app/api/utils/media';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';
import { withRlsContext } from '@/app/api/utils/rls';
import { z } from 'zod';

const messageLimiter = getRateLimiter('messages-send', { windowMs: 60 * 1000, max: 30 });
const ConversationIdSchema = z.string().uuid();

interface ConversationRow {
  id: string;
  venue_user_id: string;
  counterpart_user_id: string;
  gig_id: string | null;
}

/** Loads the conversation iff the caller participates; 404 otherwise. */
async function requireParticipant(
  user: { id: string; role?: string | null },
  id: string
): Promise<ConversationRow> {
  // RLS (S2): the participant policy enforces the same predicate the WHERE
  // clause states — defense in depth, same 404 semantics.
  const rows = await withRlsContext<ConversationRow[]>(
    user,
    sql`
      SELECT id, venue_user_id, counterpart_user_id, gig_id FROM conversations
      WHERE id = ${id}
        AND (venue_user_id = ${user.id} OR counterpart_user_id = ${user.id})
      LIMIT 1
    `
  );
  if (rows.length === 0) throw ApiError.notFound();
  return rows[0];
}

/**
 * GET /api/conversations/[id]/messages (P5.1) — the thread, oldest-first, and
 * marks the counterpart's messages read (opening the thread IS reading it).
 */
export const GET = withRoute('messages.list', async (_request, context) => {
  const user = await authGuard.requireSession();
  const params = await context.params;
  const parsed = ConversationIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();

  const conversation = await requireParticipant(user, parsed.data);

  // RLS (S2): reading is messages_participant_read; the mark-read UPDATE is
  // the recipient acting on the counterpart's rows — allowed by
  // messages_participant_update (per-command policies, 0014).
  const [messages] = await withRlsContext<[Record<string, unknown>[], unknown[]]>(user, [
    sql`
      SELECT id, sender_id, content, kind, rate_cents, attachment_url, created_at, read_at
      FROM messages
      WHERE conversation_id = ${conversation.id}
      ORDER BY created_at ASC
      LIMIT 500
    `,
    sql`
      UPDATE messages SET read_at = NOW()
      WHERE conversation_id = ${conversation.id}
        AND sender_id <> ${user.id} AND read_at IS NULL
    `,
  ]);

  return Response.json({ messages, conversation });
});

/**
 * POST — send a message. Rate proposals carry integer cents; attachments are
 * data URLs that ride the P4 pipeline (EXIF-stripped, re-encoded) before
 * anything is persisted.
 */
export const POST = withRoute('messages.send', async (request, context) => {
  const user = await authGuard.requireSession();
  await enforceRateLimit(messageLimiter, clientKey(request, user.id));

  const params = await context.params;
  const parsed = ConversationIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();
  const conversation = await requireParticipant(user, parsed.data);

  const body = await parseBody(request, MessageCreateSchema, { maxBytes: 8_000_000 });

  const attachmentUrl = body.attachment_url
    ? await sanitizeMediaField(body.attachment_url, 'attachment', user.id)
    : null;

  const inserted = await withRlsContext<Array<Record<string, unknown>>>(
    user,
    sql`
      INSERT INTO messages (conversation_id, sender_id, content, kind, rate_cents, attachment_url)
      VALUES (${conversation.id}, ${user.id}, ${body.content}, ${body.kind},
              ${body.kind === 'RATE_PROPOSAL' ? body.rate_cents : null}, ${attachmentUrl})
      RETURNING id, sender_id, content, kind, rate_cents, attachment_url, created_at, read_at
    `
  );

  const recipient =
    conversation.venue_user_id === user.id
      ? conversation.counterpart_user_id
      : conversation.venue_user_id;
  await notify(recipient, 'message.received', {
    conversationId: conversation.id,
    kind: body.kind,
  });

  return Response.json({ message: inserted[0] }, { status: 201 });
});
