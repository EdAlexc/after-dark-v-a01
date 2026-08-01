/**
 * Deterministic per-environment preview password (S1 credential hygiene) —
 * HMAC(PREVIEW_ACCOUNTS_SECRET, email). Extracted so the P10.4 gate runners
 * (axe smoke, Lighthouse login, k6) derive the SAME credentials the
 * provisioning script created, without importing that script's side effects.
 * Never log the result outside the provisioning script's own stdout.
 */

import { createHmac } from 'node:crypto';

export function derivePreviewPassword(secret: string, email: string): string {
  const digest = createHmac('sha256', secret).update(email).digest('base64url');
  return `Ad!${digest.slice(0, 18)}`;
}
