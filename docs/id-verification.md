# ID Verification — Vendor Decision (S8, Backlog #8)

> Status: **Proposed** (decision doc only — implementation is deliberately post-alpha).
> Owner: platform. Written 2026-07-31 as part of slice S8 (trust & reviews).

## Why (and why not yet)

Trust signals shipped in S8 — shift-scoped reviews, venue rating aggregation, talent
trust score v1 — are all **behavioral**: they accrue from completed marketplace activity.
They cannot answer "is this person who they claim to be" on day one. Identity
verification closes that gap, but it is a heavy, PII-laden integration (government ID
images, biometric selfie checks) that would dominate any alpha slice while the closed
cohort is personally invited anyway. Decision now, integration when signup opens.

## Requirements

1. **Data minimization (G11/GDPR):** verification artifacts (ID photos, selfies) must
   live with the vendor, never in our Postgres/Blob. We store only a boolean +
   vendor reference id + timestamp.
2. **Age assurance:** must return a date-of-birth check — AfterDark is 18+ platform-wide
   and gigs can require 21+ (`gigs.age_requirement`, G12). Attestation covers alpha;
   verification should harden it at GA.
3. **Payout compatibility:** talent get paid via Stripe Connect Express (P8), which
   already performs its own KYC at onboarding. Whatever we add must not duplicate a
   second document-upload flow for the same person.
4. **Webhook-driven:** results arrive by signed webhook (we already run that pattern —
   `/api/stripe/webhook` with signature + replay guard, P8).

## Options considered

| Vendor | Fit | Notes |
|---|---|---|
| **Stripe Identity** | **Recommended** | Same platform as our payments; Connect Express KYC and Identity share Stripe's verification infra, so talent verify once inside a flow they already complete to get paid. Per-check pricing, no monthly minimum — right shape for a closed alpha → GA ramp. Webhook + signature model identical to P8's. |
| Persona | Strong | Best-in-class configurable flows and non-US coverage; adds a second vendor DPA (G10), separate webhook/secret surface, and a monthly platform fee we don't need at this scale. Revisit if we outgrow Stripe Identity's flow rigidity. |
| Onfido (Entrust) | Adequate | Mature biometrics; enterprise pricing and contract shape are wrong for alpha; SDK-heavy integration. |
| Build in-house | Rejected | Storing government IDs ourselves is exactly the PII liability the media pipeline (P4/S3) was built to avoid. |

## Decision

**Stripe Identity**, gated behind the same key-present pattern as `/api/stripe/*`:
absent keys → the surface simply doesn't exist. One vendor, one DPA (already required
for payouts, G10), one webhook discipline, and verification state hangs off the
existing `stripe_accounts` linkage.

Planned shape (post-alpha slice, not scheduled):
- `user.identity_verified_at TIMESTAMPTZ` + `identity_verification_ref TEXT` (vendor id
  only, no artifacts) via migration;
- `POST /api/identity/start` (TALENT|VENUE, key-gated 503 like Stripe Connect) creating
  a VerificationSession; webhook route confirms → sets the flag → audit row;
- UI: "Verified" badge on talent cards/profiles next to the S8 trust score; verification
  nudge on the Stripe Connect onboarding card;
- Trust score v2 folds `identity_verified` in as a component (trust.ts is already the
  single computation point).

## Revisit triggers

- Open (non-invite) signup → schedule the implementation slice before it.
- Non-US expansion → re-evaluate Persona for document coverage.
- Any incident of impersonation in the alpha cohort → pull the slice forward
  (docs/incident-runbook.md §3 owns the response).
