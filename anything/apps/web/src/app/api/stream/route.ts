import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRlsContext, type RlsUser } from '@/app/api/utils/rls';
import { withRoute } from '@/app/api/utils/route-kit';
import { logger } from '@/app/api/utils/logger';
import {
  EMPTY_FINGERPRINT,
  changedKeys,
  type StreamFingerprint,
} from '@/app/api/utils/stream-keys';

const log = logger.child('stream');

/**
 * S9 realtime — Server-Sent Events replacing the 5 s client polling.
 *
 * Serverless-friendly shape: each connection is authenticated ONCE
 * (per-connection auth is the S9 gate), then streams compact `invalidate`
 * events for up to STREAM_MAX_MS (~50 s, under function limits) and closes;
 * EventSource reconnects automatically, re-running auth. Inside the window
 * the server watches a cheap per-user fingerprint every STREAM_TICK_MS and
 * only emits when something changed — the payload is TanStack Query keys,
 * so the transport swap hides behind the exact caches the UI already uses.
 *
 * Events carry query keys ONLY — never row data — so nothing tenant-scoped
 * can leak through this channel; the invalidated queries refetch through
 * their own authenticated routes.
 */

async function fingerprintFor(user: RlsUser): Promise<StreamFingerprint> {
  // One round trip; every subquery is indexed and user-scoped. Runs under the
  // caller's RLS context (S12): notifications/messages/shifts are all
  // policy-scoped to the requesting user, so a context-less read would return
  // the empty shape post-cutover and the stream would go permanently silent.
  const userId = user.id;
  const rows = await withRlsContext<Array<StreamFingerprint>>(
    user,
    sql`
    SELECT
      (SELECT COALESCE(MAX(id), 0) FROM notifications WHERE user_id = ${userId})::text AS notif,
      (SELECT COALESCE(MAX(m.id::text), '')
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE c.venue_user_id = ${userId} OR c.counterpart_user_id = ${userId}
      ) AS msg,
      (SELECT COALESCE(MAX(st.id::text), '')
         FROM shift_transitions st
         JOIN shifts s ON s.id = st.shift_id
         JOIN talent_profiles tp ON tp.id = s.talent_id
         JOIN gigs g ON g.id = s.gig_id
         JOIN venue_profiles vp ON vp.id = g.venue_id
        WHERE tp.user_id = ${userId} OR vp.user_id = ${userId}
      ) AS shift
  `
  );
  return rows[0] ?? EMPTY_FINGERPRINT;
}

export const GET = withRoute('stream.events', async (request) => {
  // Per-connection auth (S9 gate): no session → 401 before any stream exists;
  // suspension 403s here like everywhere else.
  const user = await authGuard.requireSession();

  const maxMs = Number(process.env.STREAM_MAX_MS ?? 50_000);
  const tickMs = Math.max(500, Number(process.env.STREAM_TICK_MS ?? 4_000));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let interval: ReturnType<typeof setInterval> | undefined;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        clearTimeout(deadline);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime — nothing to release.
        }
      };

      const emit = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          close();
        }
      };

      let previous: StreamFingerprint | null = null;
      const tick = async () => {
        try {
          const next = await fingerprintFor({ id: user.id });
          if (previous !== null) {
            const keys = changedKeys(previous, next);
            if (keys.length > 0) emit('invalidate', { keys });
          }
          previous = next;
        } catch (error) {
          log.warn('fingerprint tick failed', { error });
        }
      };

      emit('hello', { retryMs: 2_000 });
      await tick();

      interval = setInterval(() => void tick(), tickMs);
      // Close before the platform kills the function; EventSource reconnects.
      deadline = setTimeout(close, Math.max(0, maxMs));
      request.signal.addEventListener('abort', close);
      if (maxMs <= 0) close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Defense in depth: some proxies buffer streaming responses otherwise.
      'X-Accel-Buffering': 'no',
    },
  });
});
