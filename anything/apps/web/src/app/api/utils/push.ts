/**
 * Web Push sending (S9 / Backlog #5) — key-gated like Stripe: without the
 * VAPID pair in env the whole surface is inert (subscribe answers 503, the
 * fan-out is a no-op). Payloads are ID-ONLY by contract (the S9 gate): the
 * service worker fetches nothing and shows a generic notification; content
 * loads when the user opens the app — so no gig titles, names, or any
 * tenant data ever transit the browser vendors' push services.
 *
 * Like notify()/track(), sending NEVER throws. Gone subscriptions (404/410
 * from the push service) are pruned in passing.
 */

import webpush from 'web-push';
import sql from './sql';
import { logger } from './logger';
import { withRlsContext, serviceContext } from './rls';

const log = logger.child('push');

/** Hard cap per fan-out so a publish burst can't run the function long. */
export const PUSH_FANOUT_LIMIT = 500;

/** "Hot" = starts within the next 24 h (matches the browse HOT badge). */
export function isHotWindow(startTime: string | null | undefined): boolean {
  if (!startTime) return false;
  const start = Date.parse(startTime);
  if (Number.isNaN(start)) return false;
  const delta = start - Date.now();
  return delta >= 0 && delta < 24 * 60 * 60 * 1000;
}

export function pushConfigured(): boolean {
  return Boolean(
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  );
}

export function vapidPublicKey(): string | null {
  return process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null;
}

let vapidApplied = false;
function ensureVapid(): void {
  if (vapidApplied || !pushConfigured()) return;
  webpush.setVapidDetails(
    process.env.WEB_PUSH_VAPID_SUBJECT ?? 'mailto:support@afterdark.app',
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY!,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY!
  );
  vapidApplied = true;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Id-only payload shape — the ONLY thing this module will ever send. */
export interface PushPayload {
  kind: 'hot_gig';
  gigId: string;
}

/**
 * Fan a hot-gig alert out to opted-in TALENT devices. Fire-and-forget;
 * resolves the number of successful sends (0 when unconfigured).
 */
export async function pushHotGigToTalent(gigId: string): Promise<number> {
  if (!pushConfigured()) return 0;
  ensureVapid();

  let subscriptions: SubscriptionRow[];
  try {
    // SERVICE context: the fan-out legitimately reads across users (0019).
    subscriptions = await withRlsContext<SubscriptionRow[]>(
      serviceContext('push-fanout'),
      sql`
        SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
        FROM push_subscriptions ps
        JOIN "user" u ON u.id = ps.user_id
        WHERE u.role = 'TALENT' AND u.suspended_at IS NULL
        ORDER BY ps.created_at DESC
        LIMIT ${PUSH_FANOUT_LIMIT}
      `
    );
  } catch (error) {
    log.error('push fan-out query failed', { error });
    return 0;
  }

  const payload: PushPayload = { kind: 'hot_gig', gigId };
  const body = JSON.stringify(payload);
  let sent = 0;
  const gone: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { TTL: 60 * 60 } // hot gigs are stale within the hour
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          gone.push(subscription.id);
        } else {
          log.warn('push send failed', { status, error });
        }
      }
    })
  );

  if (gone.length > 0) {
    try {
      await withRlsContext(
        serviceContext('push-fanout'),
        sql`DELETE FROM push_subscriptions WHERE id = ANY(${gone})`
      );
    } catch (error) {
      log.warn('pruning gone subscriptions failed', { error });
    }
  }

  return sent;
}
