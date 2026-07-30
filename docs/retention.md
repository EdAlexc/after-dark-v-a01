# Data Retention Schedule

> GDPR Art. 5(1)(e) storage limitation / TENANT_GUARDRAIL §4.2 **G7**.
> Last reviewed: **2026-07-30** (P2). Companion to [`ropa.md`](ropa.md).
>
> The user-facing version of this is §5 of [/legal/privacy](../anything/apps/web/src/app/legal/privacy/page.tsx) —
> change both together or the policy becomes a lie.

## 1. Schedule

| Data | Retention | Trigger | Mechanism | Status |
|---|---|---|---|---|
| Account (`user`, `account`) | Life of account | User deletes account | `DELETE /api/account` → cascade | ✅ **Automated** |
| Talent / venue profile | Life of account | Same | FK `ON DELETE CASCADE` | ✅ Automated |
| Gigs | Life of the owning venue account | Same | Cascade via `venue_profiles` | ✅ Automated |
| 2FA enrollment (`twoFactor`) | Life of account, or until user disables 2FA | Same | Cascade / plugin disable | ✅ Automated |
| Sessions (`session`) | ≤ 7 days | Expiry | better-auth cookie cache + expiry | ✅ Automated |
| Audit trail (`audit_logs`) | **Indefinite, pseudonymized on erasure** | Account deletion | `actor_id` → HMAC token before the user row is deleted | ✅ Automated |
| Server logs / IP addresses | ≤ 90 days | Age | Platform log retention (Vercel) | ⚠️ **Provider default — confirm and document the configured value** |
| Error reports (Sentry) | ≤ 90 days | Age | Sentry project setting | ⚠️ Inactive until a DSN is set |
| Financial records | 7 years | Statutory | Not yet applicable | ⛔ **Lands with P8 payments** |
| Messages & attachments | Life of account | Account deletion | Not yet applicable | ⛔ **Lands with P5** |

## 2. Why the audit trail is kept

Deleting the audit trail on erasure would destroy the record of security-relevant events —
exactly what Art. 5(2) accountability requires us to keep, and what an incident investigation
depends on. So instead of deleting it we **pseudonymize** it: `actor_id` is replaced with
`deleted:<HMAC-SHA256(user id, server secret)>` (`pseudonymizeActorId`).

The properties that matter:

- **Not reversible** without the server secret, so the trail no longer identifies a person.
- **Deterministic**, so a sequence of actions is still recognisable as one (now-anonymous)
  actor — which is what makes the trail useful at all.
- Written **before** the user row is deleted, because afterwards there is no way to know which
  rows were theirs.

Metadata was already PII-redacted at insert time (`redactPii`), so no free-text personal data
is retained.

## 3. Erasure coverage

`DELETE /api/account` and `GET /api/account/export` both read one registry —
`src/app/api/utils/account-data.ts`. That is deliberate: it is the standard way these two
requirements drift apart (an export that omits what deletion removes, or vice versa).

**When a later slice adds a table holding personal data, add it to that registry in the same
PR.** Tables landing soon: `applications` (P3), `messages` + attachments (P5), `shifts` (P7),
`payouts` (P8 — subject to the 7-year financial carve-out, so it must be *anonymized* rather
than deleted).

## 4. Open gaps

1. **No scheduled purge job.** Log retention currently relies on provider defaults rather than
   an owned, tested job. Scheduled with the P10 hardening work.
2. **Log retention values unconfirmed.** The 90-day figure is our stated policy; the actual
   Vercel configuration needs to be checked against it and recorded here.
3. **Backups.** Neon's point-in-time recovery window means deleted rows persist in backups for
   the recovery period. Document the window and state it in the privacy policy before GA.
