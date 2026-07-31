import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { getStripe, stripeEnabled } from '@/lib/stripe';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';
import { withRlsContext } from '@/app/api/utils/rls';

const connectLimiter = getRateLimiter('stripe-connect', { windowMs: 60 * 60 * 1000, max: 10 });

/**
 * GET /api/stripe/connect (P8.1) — the caller's payout-account status.
 * Talent get paid; venues will fund charges — both may onboard.
 */
export const GET = withRoute('stripe.connect.status', async () => {
  const user = await authGuard.requireRole('TALENT', 'VENUE');

  // RLS (S2): stripe_accounts_own scopes the row to the request context.
  const rows = await withRlsContext<Array<{ stripe_account_id: string; onboarded: boolean }>>(
    user,
    sql`
      SELECT stripe_account_id, onboarded FROM stripe_accounts
      WHERE user_id = ${user.id} LIMIT 1
    `
  );

  return Response.json({
    configured: stripeEnabled(),
    connected: rows.length > 0,
    onboarded: rows[0]?.onboarded ?? false,
  });
});

/**
 * POST — create (or resume) Connect Express onboarding; responds with the
 * Stripe-hosted onboarding URL. 503 when the platform has no Stripe keys, so
 * the client can show "payments not live yet" instead of a broken flow.
 */
export const POST = withRoute('stripe.connect.start', async (request) => {
  const user = await authGuard.requireRole('TALENT', 'VENUE');
  await enforceRateLimit(connectLimiter, clientKey(request, user.id));

  if (!stripeEnabled()) {
    throw new ApiError(503, 'Payments are not live yet — Stripe is not configured');
  }
  const stripe = getStripe();

  const existing = await withRlsContext<Array<{ stripe_account_id: string }>>(
    user,
    sql`
      SELECT stripe_account_id FROM stripe_accounts WHERE user_id = ${user.id} LIMIT 1
    `
  );

  let accountId = existing[0]?.stripe_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email,
      metadata: { afterdark_user_id: user.id },
    });
    accountId = account.id;
    await withRlsContext(
      user,
      sql`
        INSERT INTO stripe_accounts (user_id, stripe_account_id)
        VALUES (${user.id}, ${accountId})
        ON CONFLICT (user_id) DO NOTHING
      `
    );
    await auditLogger.record({
      actorId: user.id,
      action: 'stripe.account_created',
      entityType: 'stripe_account',
      entityId: accountId,
    });
  }

  const origin = process.env.BETTER_AUTH_URL ?? 'http://localhost:4000';
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${origin}/dashboard/settings?stripe=refresh`,
    return_url: `${origin}/dashboard/settings?stripe=done`,
  });

  return Response.json({ url: link.url }, { status: 201 });
});
