import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { parseBody } from '@/app/api/utils/validation';
import { NotificationsReadSchema } from '@/app/api/utils/schemas';
import { withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';

/**
 * GET /api/notifications (P3.4) — own latest notifications + unread count.
 * POST marks read (specific ids or everything). Self-scoped: there is no id
 * parameter that could reach another user's feed.
 */
export const GET = withRoute('notifications.list', async () => {
  const user = await authGuard.requireSession();

  // RLS (S2): notifications_own scopes both reads via request context.
  const [notifications, unread] = await withRlsContext<[
    Record<string, unknown>[],
    Array<{ count: number }>,
  ]>(user, [
    sql`
      SELECT id, kind, payload, read_at, created_at
      FROM notifications
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 30
    `,
    sql`
      SELECT COUNT(*)::int AS count FROM notifications
      WHERE user_id = ${user.id} AND read_at IS NULL
    `,
  ]);

  return Response.json({
    notifications,
    unreadCount: (unread as Array<{ count: number }>)[0]?.count ?? 0,
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
