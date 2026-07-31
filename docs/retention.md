# Data Retention Schedule

> GDPR Art. 5(1)(e) storage limitation / TENANT_GUARDRAIL §4.2 **G7**.
> Last reviewed: **2026-07-31** (S2 — owned purge job + legal-hold mechanism).
> Companion to [`ropa.md`](ropa.md).
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
| Sessions (`session`) | ≤ 7 days | Expiry | better-auth expiry + **daily purge deletes expired rows** (`/api/retention/purge`) | ✅ Automated (S2) |
| Verification tokens (`verification`) | Until expiry | Expiry | Daily purge deletes expired rows | ✅ Automated (S2) |
| Rate-limit counters (`rate_limit_counters`, `"rateLimit"`) | ≤ 1 day / ≤ 7 days | Window age | Daily purge (S1 stores hold `user:`/`ip:` keys — operational data only) | ✅ Automated (S2) |
| Audit trail (`audit_logs`) | **Indefinite, pseudonymized on erasure** | Account deletion | `actor_id` → HMAC token before the user row is deleted | ✅ Automated |
| Messages & attachments | Life of account | Account deletion | FK cascade from either participant (P5) | ✅ Automated |
| Server logs / IP addresses | ≤ 90 days | Age | Platform log retention (Vercel) | ⚠️ **Provider default — confirm and document the configured value** |
| Error reports (Sentry) | ≤ 90 days | Age | Sentry project setting | ⚠️ Inactive until a DSN is set |
| Financial records (`payouts` ledger) | 7 years | Statutory | Anonymize-not-delete carve-out (see §3) | 🟡 Ledger real since P8; anonymization job lands with Stripe activation |

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

## 4. The purge job (S2)

`POST/GET /api/retention/purge`, on the daily Vercel Cron (09:30 UTC, `vercel.json`),
authenticated by `CRON_SECRET` (or an ADMIN session for a manual run). Each run deletes:
expired `session` rows, expired `verification` rows, and stale rate-limit windows
(`rate_limit_counters` > 1 day, better-auth `"rateLimit"` > 7 days). **Every run writes an
`audit_logs` row** (`action = retention.purge`) with per-table counts — including runs
suspended by a hold — so the job's own history is provable. Tests:
`src/app/api/retention/__tests__/purge.test.ts` (hold semantics included).

### Remaining gaps

1. **Log retention values unconfirmed.** The 90-day figure is our stated policy; the actual
   Vercel configuration needs to be checked against it and recorded here.
2. **Backups.** Neon's point-in-time recovery window means deleted rows persist in backups for
   the recovery period. Document the window and state it in the privacy policy before GA.

## 5. Legal hold

Every schedule above is **suspended for data relevant to an active incident investigation
or legal claim** (see [`incident-runbook.md`](incident-runbook.md) §3 "Preserve evidence"):
do not purge, rotate away, or "clean up" logs, audit rows, or snapshots tied to an open
incident until its log entry is closed. The hold is scoped — everything unrelated keeps its
normal schedule.

**Mechanism (S2):** holds are rows in `legal_holds` (migration 0014), placed and released by
the incident lead with owner/admin DB access:

```sql
-- Place a hold on one user's data (scope USER) or on everything (GLOBAL):
INSERT INTO legal_holds (scope, user_id, reason, created_by)
VALUES ('USER', '<user id>', 'incident 2026-xx-yy — see runbook log', '<who>');

-- Release it when the incident log entry closes:
UPDATE legal_holds SET released_at = NOW() WHERE id = '<hold id>';
```

The purge job consults active holds structurally: a `GLOBAL` hold suspends the entire run;
a `USER` hold excludes that user's sessions from deletion. Verification/rate-limit rows are
non-attributable token artifacts, so `GLOBAL` is their hold lever. The table is
ADMIN/SERVICE-only under RLS — the subject of an investigation cannot see the hold.
