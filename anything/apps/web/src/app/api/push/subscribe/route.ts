import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { parseBody } from '@/app/api/utils/validation';
import { PushSubscribeSchema, PushUnsubscribeSchema } from '@/app/api/utils/schemas';
import { pushConfigured, vapidPublicKey } from '@/app/api/utils/push';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';
import { withRlsContext, serviceContext } from '@/app/api/utils/rls';

const subscribeLimiter = getRateLimiter('push-subscribe', {
  windowMs: 60 * 60 * 1000,
  max: 30,
});

/**
 * S9 Web Push opt-in. Key-gated like /api/stripe/*: without the VAPID pair
 * the GET reports enabled:false and writes answer 503 — the UI simply
 * doesn't offer the toggle. Subscriptions are per-browser rows owned by
 * the session user (RLS 0019); the endpoint URL is treated as a credential
 * and never echoed back to the client list-style.
 */
export const GET = withRoute('push.status', async () => {
  const user = await authGuard.requireSession();
  if (!pushConfigured()) {
    return Response.json({ enabled: false, vapidPublicKey: null, subscribed: false });
  }
  const rows = await withRlsContext<Array<{ count: number }>>(
    user,
    sql`SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = ${user.id}`
  );
  return Response.json({
    enabled: true,
    vapidPublicKey: vapidPublicKey(),
    subscribed: (rows[0]?.count ?? 0) > 0,
  });
});

export const POST = withRoute('push.subscribe', async (request) => {
  const user = await authGuard.requireSession();
  await enforceRateLimit(subscribeLimiter, clientKey(request, user.id));
  if (!pushConfigured()) throw new ApiError(503, 'Push is not configured');

  const body = await parseBody(request, PushSubscribeSchema);
  // A browser endpoint is unique per physical profile; re-registering after
  // an account switch must re-home it. The old owner's row isn't visible to
  // this user's RLS context, so the cleanup runs as SERVICE.
  await withRlsContext(
    serviceContext('push-subscribe'),
    sql`DELETE FROM push_subscriptions WHERE endpoint = ${body.endpoint}`
  );
  await withRlsContext(
    user,
    sql`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (${user.id}, ${body.endpoint}, ${body.keys.p256dh}, ${body.keys.auth})
      ON CONFLICT (endpoint) DO NOTHING
    `
  );
  return Response.json({ subscribed: true }, { status: 201 });
});

export const DELETE = withRoute('push.unsubscribe', async (request) => {
  const user = await authGuard.requireSession();
  await enforceRateLimit(subscribeLimiter, clientKey(request, user.id));

  const body = await parseBody(request, PushUnsubscribeSchema);
  // RLS + the user_id predicate: you can only ever delete your own rows.
  await withRlsContext(
    user,
    sql`
      DELETE FROM push_subscriptions
      WHERE endpoint = ${body.endpoint} AND user_id = ${user.id}
    `
  );
  return Response.json({ subscribed: false });
});
