import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { parseBody, parseQuery } from '@/app/api/utils/validation';
import { NotificationsListQuerySchema, NotificationsReadSchema } from '@/app/api/utils/schemas';
import { withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';

const NOTIFICATIONS_PAGE_SIZE = 30;

/**
 * GET /api/notifications (P3.4) — own latest notifications + unread count.
 * S20 F5 adds ?page= so the history page can walk the whole feed (sentinel
 * +1 row = hasMore, the house pagination pattern); page 1 with no param is
 * byte-compatible with what the bell always read. POST marks read (specific
 * ids or everything). Self-scoped: there is no id parameter that could reach
 * another user's feed.
 */
export const GET = withRoute('notifications.list', async (request) => {
  const user = await authGuard.requireSession();
  const { page } = parseQuery(request.url, NotificationsListQuerySchema);
  const offset = (page - 1) * NOTIFICATIONS_PAGE_SIZE;

  // RLS (S2): notifications_own scopes both reads via request context.
  const [rows, unread] = await withRlsContext<[
    Record<string, unknown>[],
    Array<{ count: number }>,
  ]>(user, [
    sql`
      SELECT id, kind, payload, read_at, created_at
      FROM notifications
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT ${NOTIFICATIONS_PAGE_SIZE + 1} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int AS count FROM notifications
      WHERE user_id = ${user.id} AND read_at IS NULL
    `,
  ]);

  const hasMore = rows.length > NOTIFICATIONS_PAGE_SIZE;
  const notifications = hasMore ? rows.slice(0, NOTIFICATIONS_PAGE_SIZE) : rows;

  return Response.json({
    notifications,
    unreadCount: (unread as Array<{ count: number }>)[0]?.count ?? 0,
    page,
    hasMore,
  });
});

export const POST = withRoute('notifications.read', async (request) => {
  const user = await authGuard.requireSession();
  const body = await parseBody(request, NotificationsReadSchema);

  if (body.ids && body.ids.length > 0) {
    await withRlsContext(
      user,
      sql`
        UPDATE notifications SET read_at = NOW()
        WHERE user_id = ${user.id} AND read_at IS NULL AND id = ANY(${body.ids})
      `
    );
  } else {
    await withRlsContext(
      user,
      sql`
        UPDATE notifications SET read_at = NOW()
        WHERE user_id = ${user.id} AND read_at IS NULL
      `
    );
  }
  return Response.json({ success: true });
});
