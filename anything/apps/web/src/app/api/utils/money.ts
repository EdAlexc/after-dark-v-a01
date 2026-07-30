/**
 * Money math (working agreement §11: integer cents, always).
 *
 * The 5% marketplace fee lives HERE and only here on the server. Clients may
 * *display* estimates (lib/gigs.ts feeBreakdown), but every persisted amount
 * is computed from these functions — a client-supplied fee is not an input
 * anywhere in the API surface (TENANT_GUARDRAIL §6.4 fee-tamper test).
 */

export const MARKETPLACE_FEE_PCT = 5;

/** Dollars (string or number, e.g. Neon NUMERIC) → integer cents. */
export function dollarsToCents(value: string | number): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Fee on a gross amount, rounded half-up to the nearest cent. */
export function feeCents(grossCents: number): number {
  return Math.round((grossCents * MARKETPLACE_FEE_PCT) / 100);
}

export interface PayoutSplit {
  grossCents: number;
  feeCents: number;
  netCents: number;
}

/** gross = fee + net, guaranteed exactly (the DB CHECK re-verifies). */
export function splitPayout(grossCents: number): PayoutSplit {
  const fee = feeCents(grossCents);
  return { grossCents, feeCents: fee, netCents: grossCents - fee };
}
