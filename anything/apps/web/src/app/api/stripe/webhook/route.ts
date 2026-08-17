import type Stripe from 'stripe';
import sql from '@/app/api/utils/sql';
import { auditLogger } from '@/app/api/utils/audit';
import { getStripe, stripeEnabled, webhookSecret } from '@/lib/stripe';
import { logger } from '@/app/api/utils/logger';
import { withRoute, jsonError } from '@/app/api/utils/route-kit';
import { serviceContext, withRlsContext } from '@/app/api/utils/rls';

const log = logger.child('stripe.webhook');

/**
 * POST /api/stripe/webhook (P8.3).
 *
 * Defence order matters and is deliberate:
 *  1. **Signature verification** — an unsigned or mis-signed payload is
 *     rejected with 400 before we even parse it as an event (forged-webhook
 *     test, §6.4).
 *  2. **Replay guard** — the event id INSERTs into stripe_events, whose
 *     primary key makes a replayed delivery fail closed: we return 200 (so
 *     Stripe stops retrying) but run no handler twice.
 *  3. Handlers are minimal and idempotent on top of that anyway.
 *
 * No session/auth: Stripe is the caller. The signature *is* the authn.
 * RLS (S2): all writes run under SERVICE context — stripe_events is
 * deny-by-default to user contexts, and the payout/account updates are
 * platform bookkeeping, not user actions.
 */
const STRIPE_SERVICE = serviceContext('system:stripe');
export const POST = withRoute('stripe.webhook', async (request) => {
  if (!stripeEnabled() || !webhookSecret()) {
    // Not configured: acknowledge nothing, reveal nothing.
    return jsonError(503, 'Stripe is not configured');
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return jsonError(400, 'Missing signature');

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret() as string
    );
  } catch (error) {
    log.warn('webhook signature verification failed', { error });
    return jsonError(400, 'Invalid signature');
  }

  // Replay guard: first delivery wins; duplicates are acknowledged and dropped.
  const recorded = await withRlsContext<Array<{ id: string }>>(
    STRIPE_SERVICE,
    sql`
      INSERT INTO stripe_events (id, type) VALUES (${event.id}, ${event.type})
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `
  );
  if (recorded.length === 0) {
    log.info('replayed webhook dropped', { eventId: event.id, type: event.type });
    return Response.json({ received: true, replay: true });
  }

  switch (event.type) {
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      const onboarded = Boolean(account.charges_enabled && account.payouts_enabled);
      await withRlsContext(
        STRIPE_SERVICE,
        sql`
          UPDATE stripe_accounts SET onboarded = ${onboarded}, updated_at = NOW()
          WHERE stripe_account_id = ${account.id}
        `
      );
      break;
    }
    case 'transfer.created': {
      const transfer = event.data.object as Stripe.Transfer;
      const payoutId = transfer.metadata?.afterdark_payout_id;
      if (payoutId) {
        await withRlsContext(
          STRIPE_SERVICE,
          sql`
            UPDATE payouts SET stripe_transfer_id = ${transfer.id}
            WHERE id = ${Number(payoutId)} AND stripe_transfer_id IS NULL
          `
        );
      }
      break;
    }
    default:
      log.info('unhandled webhook type', { type: event.type });
  }

  // S15 audit-coverage: webhook-driven money/account state changes join the
  // trail like every other mutation (first deliveries only — replays return
  // above; unhandled types write no state, so nothing to record).
  if (event.type === 'account.updated' || event.type === 'transfer.created') {
    await auditLogger.record({
      actorId: 'system:stripe',
      action: 'stripe.webhook',
      entityType: 'stripe_event',
      entityId: event.id,
      metadata: { type: event.type },
    });
  }

  return Response.json({ received: true });
});
