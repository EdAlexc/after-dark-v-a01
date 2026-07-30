/**
 * Stripe Connect client (P8) — key-gated like Sentry: with no
 * STRIPE_SECRET_KEY the whole payments surface reports "not configured"
 * instead of half-working. Nothing else in the app may import the stripe SDK
 * directly; this module is the single choke point.
 *
 * Posture (TENANT_GUARDRAIL §6.4): destination charges with a server-computed
 * 5% application fee; we store only Stripe account/transfer/charge ids —
 * card and bank data live at Stripe (SAQ-A).
 */

import Stripe from 'stripe';

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;

/** Throws when called without a key — call stripeEnabled() first. */
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)');
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

export function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET ?? null;
}
