/**
 * Single source of truth for legal-document versioning (TENANT_GUARDRAIL §4.2
 * G1/G2). Both pages and any future "you must re-accept the updated terms"
 * flow read these, so a policy revision is one edit in one place.
 *
 * Bump `version` AND `effective` whenever the substance changes — the date is
 * what a user or regulator relies on.
 */

export const LEGAL_VERSION = {
  privacy: { version: '1.0', effective: '2026-07-30' },
  terms: { version: '1.0', effective: '2026-07-30' },
} as const;

/** Contact addresses published in the legal pages. */
export const LEGAL_CONTACT = {
  support: 'support@afterdark.example',
  privacy: 'privacy@afterdark.example',
  security: 'security@afterdark.example',
} as const;

/** Alpha-stage banner text, shown on both documents. */
export const ALPHA_NOTICE =
  'AfterDark is in closed alpha. Features described here may change, and the ' +
  'platform is not yet processing live payments.';
