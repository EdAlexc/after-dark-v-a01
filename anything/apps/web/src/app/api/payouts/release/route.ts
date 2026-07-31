import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { notify } from '@/app/api/utils/notify';
import { getStripe, stripeEnabled } from '@/lib/stripe';
import { logger } from '@/app/api/utils/logger';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { serviceContext, withRlsContext } from '@/app/api/utils/rls';

const log = logger.child('payouts.release');

/**
 * POST /api/payouts/release (P8.3) — escrow release: HELD payouts whose shift
 * checked out ≥ 24 h ago become RELEASED (wireframe p4's "released 24 hours
 * after gig completion" promise).
 *
 * Callable two ways, both privileged:
 *  - ADMIN session (manual release from the P9 dashboard later);
 *  - `Authorization: Bearer <CRON_SECRET>` for the scheduled job.
 *
 * Double-release safety: the UPDATE is scoped `WHERE status = 'HELD'`, so a
 * row can only transition once no matter how many runs overlap. With Stripe
 * configured, each released row becomes a transfer to the talent's Connect
 * account carrying the payout id in metadata; without keys the ledger still
 * advances so the alpha loop is demonstrable end-to-end.
 */
function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = request.headers.get('authorization');
  return Boolean(cronSecret && bearer === `Bearer ${cronSecret}`);
}

async function runRelease(viaCron: boolean): Promise<Response> {
  // RLS (S2): escrow release is a system batch over every tenant's rows —
  // it runs under SERVICE context whether the cron or an admin triggered it
  // (payouts have no user-context UPDATE policy at all).
  const RELEASE_SERVICE = serviceContext(viaCron ? 'system:cron' : 'system:admin-release');
  // Claim the batch: HELD → RELEASED, 24h after checkout, all-or-nothing per row.
  const released = await withRlsContext<
    Array<{ id: number; net_cents: number; talent_user_id: string | null; shift_id: string }>
  >(
    RELEASE_SERVICE,
    sql`
      UPDATE payouts p
      SET status = 'RELEASED', released_at = NOW()
      FROM shifts s
      WHERE p.shift_id = s.id
        AND p.status = 'HELD'
        AND s.check_out_at IS NOT NULL
        AND s.check_out_at < NOW() - INTERVAL '24 hours'
      RETURNING p.id, p.net_cents, p.talent_user_id, p.shift_id
    `
  );

  let transfers = 0;
  if (stripeEnabled() && released.length > 0) {
    const stripe = getStripe();
    for (const payout of released) {
      if (!payout.talent_user_id) continue;
      const accounts = await withRlsContext<Array<{ stripe_account_id: string }>>(
        RELEASE_SERVICE,
        sql`
          SELECT stripe_account_id FROM stripe_accounts
          WHERE user_id = ${payout.talent_user_id} AND onboarded = TRUE
          LIMIT 1
        `
      );
      if (accounts.length === 0) {
        log.warn('release without onboarded account — ledger advanced, transfer skipped', {
          payoutId: payout.id,
        });
        continue;
      }
      try {
        const transfer = await stripe.transfers.create({
          amount: payout.net_cents,
          currency: 'usd',
          destination: accounts[0].stripe_account_id,
          metadata: { afterdark_payout_id: String(payout.id) },
        });
        await withRlsContext(
          RELEASE_SERVICE,
          sql`
            UPDATE payouts SET stripe_transfer_id = ${transfer.id} WHERE id = ${payout.id}
          `
        );
        transfers += 1;
      } catch (error) {
        // Ledger says RELEASED but the transfer failed → flag it loudly.
        log.error('stripe transfer failed', { payoutId: payout.id, error });
        await withRlsContext(
          RELEASE_SERVICE,
          sql`UPDATE payouts SET status = 'FAILED' WHERE id = ${payout.id}`
        );
      }
    }
  }

  // Mark the underlying shifts PAID (service-only edge in shift-lifecycle).
  if (released.length > 0) {
    const shiftIds = released.map((payout) => payout.shift_id);
    await withRlsContext(
      RELEASE_SERVICE,
      sql`
        UPDATE shifts SET status = 'PAID', updated_at = NOW()
        WHERE id = ANY(${shiftIds}) AND status = 'CHECKED_OUT'
      `
    );
    for (const payout of released) {
      if (payout.talent_user_id) {
        await notify(payout.talent_user_id, 'payout.released', {
          payoutId: payout.id,
          netCents: payout.net_cents,
        });
      }
    }
    await auditLogger.record({
      actorId: viaCron ? 'system:cron' : 'admin',
      action: 'payouts.release',
      entityType: 'payout',
      metadata: { count: released.length, transfers, stripe: stripeEnabled() },
    });
  }

  return Response.json({ released: released.length, transfers, stripe: stripeEnabled() });
}

export const POST = withRoute('payouts.release', async (request) => {
  const viaCron = isCronRequest(request);
  if (!viaCron) {
    const user = await authGuard.requireRole('ADMIN');
    log.info('manual release', { actor: user.id });
  }
  return runRelease(viaCron);
});

// Vercel Cron invokes its "crons" paths with GET + `Authorization: Bearer
// <CRON_SECRET>`; only that exact credential runs the job here — a plain GET
// still fails loudly so a misconfigured cron shows up fast.
export const GET = withRoute('payouts.release.get', async (request) => {
  if (isCronRequest(request)) return runRelease(true);
  throw ApiError.badRequest('Use POST (admin) or the cron bearer');
});
