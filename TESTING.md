# TESTING — AfterDark

> How to verify the app end-to-end: automated suites, manual flows, security probes, and the
> shared preview accounts. Companion to [CLAUDE.md](CLAUDE.md) (architecture) and
> [DEV_TIMELINE.MD](DEV_TIMELINE.MD) (status). Last full pass: **2026-07-30** (P3–P8
> marketplace loop — every check below was executed and green on that date; the full
> apply → hire → check-in/out → payout → release loop ran against a Neon branch).

---

## 1. What is real vs. mock (test accordingly)

Real, DB-backed, and covered by the procedures below: auth (email/password + social),
onboarding/roles, talent & venue profiles, settings (account, password, 2FA), **gig create →
publish → browse → detail → lifecycle transitions**, public talent directory, landing "Hot Gigs
Tonight", legal pages, 18+/21+ age gating, self-serve data export + account deletion, and —
new with P3–P8 — **applications (apply → shortlist → hire → withdraw), in-app notifications,
messaging with rate negotiation, availability calendar + Available Tonight, shifts with
idempotent check-in/out, and the payout ledger with 24h escrow release** (Stripe transfers
key-gated; the ledger advances without keys). The **only surface still on sample data** is the
venue "Gig Calendar" page (`/dashboard/venue/schedule` — not a PRD screen). Admin (P9) and
PWA (P10) don't exist yet. Full matrix: CLAUDE.md §4.

## 2. Shared preview accounts (deployed site + any DB seeded with them)

One account per role instance, for the whole dev team. Created by
`yarn db:preview-accounts` (idempotent; re-run to re-assert). They exist on the **production
Neon DB** (project `after-dark`), so they work on the deployed site right now.

| Role | Email | Password | What you can exercise |
|---|---|---|---|
| TALENT | `talent.preview@afterdark.dev` | `AfterDark-Talent-2026!` | Browse, apply/withdraw, messages + propose-rate, availability calendar, shift check-in/out, earnings, profile, settings |
| VENUE | `venue.preview@afterdark.dev` | `AfterDark-Venue-2026!` | Venue dashboard (Open Gigs, Active Operations, Payouts Pending), create-gig, applicant shortlist/hire, messages + accept-rate, talent directory |
| PARTY | `party.preview@afterdark.dev` | `AfterDark-Party-2026!` | Read-only discovery: landing, browse, gig detail. All principal writes are role-denied server-side |

The venue account owns three starter gigs (2 published, 1 draft) so dashboards and browse are
never empty. ⚠️ These are **shared alpha credentials committed to the repo** — rotate them
(edit `scripts/create-preview-accounts.ts`, re-run, update this table) before any real user or
real payment data enters the database.

## 3. Automated suites

Run from `anything/apps/web` (all wired into CI on every PR):

```bash
yarn test        # vitest — 520 tests, no DB needed (route handlers run against mocked sql/auth)
yarn typecheck   # tsc --noEmit, strict
yarn lint        # oxlint (correctness rule set from anything/.oxlintrc.json), warnings = failures
yarn build       # production build — must print the full route table (all routes marked ƒ)
```

(373 → 520 with P3–P8: the authZ matrix grew to **231 generated tests** as ~21 routes were
added, plus new suites for marketplace logic and the 0007–0011 migrations. Local quirk: in a
`.claude/worktrees/*` checkout oxlint needs `--no-ignore` because the parent repo's
`.gitignore` ignores `.claude/`; CI checkouts are unaffected.)

Coverage highlights by area:

- **Query builders** (`gigs-query`, `talent-query`): placeholder numbering, SQLi regression
  payloads, bounded parameterized LIMIT/OFFSET, tonight-window semantics, page bounds.
- **Gig lifecycle** (`gig-lifecycle`): full transition matrix — happy path, undo edges
  (unpublish/reopen), terminal states, no state-skipping.
- **Route authZ** (`api/gigs`, `api/gigs/[id]`, `api/venue/gigs`, `api/talent`): 401/403/404
  matrix, tenant isolation (non-owner venue gets 404, not 403), draft-leak regression,
  idempotent PATCH, concurrent-update guard, UUID validation before SQL.
- **Client money/time helpers** (`lib/gigs`): 5% fee math (net+fee=gross invariant), NUMERIC
  string parsing, HOT/NEW urgency windows, shift-hour math.
- **AuthZ matrix** (`api/utils/authz-matrix.ts` + its suite, 231 tests): every route × every
  actor (anon/TALENT/VENUE/PARTY/ADMIN) × own-vs-other-tenant, plus a **coverage gate** that
  fails CI when a `route.ts` has no matrix row. This is the artifact TENANT_GUARDRAIL §6.1
  asks for — read it first when reviewing any authZ question. New with P8: the `UNAVAILABLE`
  outcome class (503) for key-gated Stripe routes.
- **Marketplace logic** (`marketplace-logic.test.ts` + `marketplace-migrations.test.ts`):
  `splitPayout` fee math in cents (rounding, gross=fee+net invariant), application and shift
  transition matrices per actor (no skipping, terminal states, service-only PAID edge),
  `computeShiftPayCents` from real timestamps (never negative), notification payload
  redaction, and structural checks on migrations 0007–0011 (RLS enabled per table, UNIQUE
  idempotency constraint, payouts CHECK constraint, no PAN/IBAN columns anywhere).
- **DSR** (`api/utils/account-data.ts`): export completeness and self-describing exclusions,
  no credential material in any query, per-collection LIMITs, and erasure ordering
  (pseudonymize the audit trail *before* deleting the user, or the link is unrecoverable).
- **Security**: middleware auth gate + callbackUrl smuggling, **nonce CSP** (per-request nonce,
  no `unsafe-inline` script-src), security headers, Sentry PII scrub, RLS migration structure,
  **deleted-account session invalidation**, rate-limit windows, redirect sanitizer, migration
  runner ordering.

## 4. Local end-to-end verification (repeatable procedure)

1. **Disposable DB**: create a Neon branch of the `after-dark` project (console or MCP), copy
   its **pooled** connection string.
2. **Env**: in `anything/apps/web/.env.local` set `DATABASE_URL`, `BETTER_AUTH_SECRET`
   (`openssl rand -base64 32` — ⚠ it also encrypts 2FA enrollments; rotating it invalidates
   them), `BETTER_AUTH_URL=http://localhost:4000`. (`AUTH_SECRET_ENCRYPTION_KEY` is obsolete
   since migration 0005 — harmless if present.)
3. **Schema + data**:
   ```bash
   yarn db:migrate          # applies 0001–0011
   yarn db:seed             # demo venue+talent, 4 gigs across statuses (refuses prod)
   yarn db:preview-accounts # the §2 accounts (safe anywhere, idempotent)
   ```
   Optional keys for the P4/P8 surfaces: `BLOB_READ_WRITE_TOKEN` (real image storage),
   `STRIPE_SECRET_KEY`+`STRIPE_WEBHOOK_SECRET` (real transfers), `CRON_SECRET` (lets you call
   the release job with a bearer instead of an ADMIN session). All optional — the loop
   completes without them.
4. **Run**: `yarn dev` → http://localhost:4000, then walk §5. Delete the Neon branch when done.

## 5. Manual flow checklist (the alpha loop as it exists today)

Each line is a check; all passed 2026-07-30 in Chrome (desktop + mobile viewport).

**Public / anonymous**
- Landing renders; **Hot Gigs Tonight** shows real published gigs starting within 24h with a
  `TONIGHT` badge (falls back to next upcoming gigs labeled `FEATURED`; friendly empty state
  when the DB has none).
- Gig card → `/gigs/[id]` deep link **survives refresh**; payout hero shows rate, computed
  shift payout and hours; venue card shows type/capacity/gigs-hosted; escrow note present.
- Fee estimator: type a proposed rate → estimated total, −5% fee, and net recompute live
  (e.g. $300 × 6h = $1800 → −$90 → $1710). Blank rate falls back to the base rate.
- `/dashboard/*` and `/onboarding` redirect anonymous visitors to sign-in with a safe
  `callbackUrl`.

**Venue loop** (sign in as `venue.preview@…`)
- Sidebar shows the real account name (no hardcoded demo identity), no fake unread badges.
- Dashboard stats are real: Active Gigs, draft count, Filling Rate ("n of m"), **Payouts
  Pending in dollars with an "n awaiting release" count** (from the payout ledger); only
  Avg-Time-to-Hire remains muted.
- Open Gigs "Applicants" column shows real counts (with a yellow "n new" chip for pending);
  clicking it opens the Applicants review page.
- **Active Operations rail is real**: shifts appear when you hire, with Check In / Check Out
  buttons per status and a live "payout held in escrow" note after checkout.
- Open Gigs table lists the venue's own gigs across all statuses with per-row actions:
  DRAFT → Publish/Cancel · PUBLISHED → Mark Filled/Unpublish/Cancel · FILLED →
  Complete/Reopen/Cancel. Acting shows a toast and stats/table refresh without reload.
- Create-gig wizard still publishes (POST `/api/gigs`), and the new gig appears in browse,
  landing (if tonight), and Open Gigs.
- Browse Talent lists real public talent profiles (stage name, rates, genres; no email/user id).

**Talent loop** (sign in as `talent.preview@…`)
- Browse Gigs hits the real API: only PUBLISHED gigs, HOT/NEW badges derived from times,
  filters map to validated query params (tonight toggle, pay range, single role/neighborhood
  server-side; multi-select + search refine client-side), pagination Prev/Next appears when
  a page overflows (12/page).
- Card → detail → estimator as above. **Submit Application is live**: apply with a proposed
  rate + cover message → "✓ Applied" state; withdraw and re-apply revives the same row.
- Dashboard is fully real: stats (earnings from released payouts, active applications,
  upcoming bookings from hired shifts, profile completion), Upcoming Bookings with
  **On My Way / Check In / Check Out**, My Applications with status chips, Hot Tonight rail
  from live listings, and an Earnings card (released vs escrowed, net of the 5% fee).

**Legal surface & cookies (P2.1 — G1/G3, verified 2026-07-30)**
- `/legal/privacy`, `/legal/terms`, `/contact` all return 200 **logged out** (they must be
  readable by a regulator or a prospective user who has no account).
- Each document shows a version and effective date sourced from `src/lib/legal.ts` — bump both
  there when the text changes substantively.
- Footer legal links resolve; no `href="#"` remains in the footer. "Cookie Policy" anchors to
  `/legal/privacy#cookies`.
- **Cookie audit**: load a legal page logged-out and confirm **no `Set-Cookie` response header
  and no non-`better-auth` cookies** in DevTools → Application. That is what lets us ship
  without a consent banner; the moment an analytics tag appears, G3 changes.

**Age gate (P2.5 — G12)**
- Signup shows an "I am 18 or older" checkbox; **Join is disabled until it is ticked**, and
  submitting without it errors rather than creating an account.
- After signup, `user.age_confirmed_at` is stamped via `POST /api/account/age-confirm` (no
  body — the timestamp is server-side `NOW()`, never client-supplied). Replaying it is a
  no-op: the first attestation wins, so the legal record can't be rewritten.
- Creating a gig with the 21+ toggle persists `age_requirement = 21`; the detail page shows a
  **21+ ONLY** badge and an inline "You must be 21 or older to work this gig" line.
- `age_requirement: 16` (or anything outside 18/21) is rejected 400 by schema *and* by a DB
  CHECK constraint.

**Privacy & Data — DSR (P2.2 — G4, verified 2026-07-30)**
1. Settings → **Privacy & Data** → *Export* downloads
   `afterdark-data-export-<date>.json` with `Content-Disposition: attachment` and
   `Cache-Control: no-store, private`.
2. The file contains `user`, `talent_profile`, `venue_profile`, `gigs`, `audit_log`, plus a
   `meta.excluded` list naming what is deliberately withheld (password hash, 2FA secret and
   backup codes, session tokens). **Grep it for credential material — there must be none.**
3. *Delete* requires **both** the account password and the typed word `DELETE`; either one
   wrong returns 400 and changes nothing.
4. After deletion the user row is gone, profiles/gigs cascade, and the audit trail survives
   with `actor_id` rewritten to `deleted:<hmac>` — never the original id.
5. **Regression to watch (found and fixed in P2):** a deleted account's cookie must stop
   working *immediately*. better-auth caches the session in the cookie for 7 days, so
   `getSession` still succeeds after erasure — `AuthGuard` now confirms the user row exists on
   every authenticated request. Canary: delete an account, then reuse the same cookie on any
   authenticated endpoint and expect **401**, not 200. (The same check signs out a session
   whose database was swapped underneath it, which is how it first showed up locally.)

**Party loop** (sign in as `party.preview@…`)
- Can browse all public surfaces; any principal write (e.g. `POST /api/gigs`) returns 403.

**Settings (any account)**
- Profile/account/password cards render **populated** on a hard refresh and save. (Regression
  to watch: the settings page once shipped with a `useSearchParams`+`Suspense` wrapper that
  never resolved during hydration under the nonce-CSP/force-dynamic setup — the form rendered
  but stayed empty and every control was dead. Fixed 2026-07-30; a hard refresh of
  `/dashboard/settings` showing real values is the canary.)

**Two-factor authentication (better-auth twoFactor plugin — full loop, verified 2026-07-30)**
1. Settings → Two-Factor → Enable → confirm password → QR + manual secret + **10 one-time
   backup codes** appear (QR is a locally-rendered data URL — verify **no** third-party QR
   host in the Network tab). Enter a live TOTP code → "2FA is Active".
2. Sign out, sign in with email+password → redirected to `/account/two-factor` (callbackUrl
   preserved) — **the session is not created until the second factor passes**. Enter a TOTP
   code → land on the original destination.
3. Repeat sign-in and choose "Use a backup code instead" → a backup code signs you in (each
   works once). "Trust this device for 30 days" skips the challenge on that browser.
4. Settings → Disable → password → back to "Enable". Wrong codes/passwords surface errors;
   10 consecutive failures lock the account for 15 minutes (plugin lockout).

**The marketplace loop (P3–P8 — the alpha spine, verified 2026-07-30)**

Run with two browser profiles (venue + talent) or two cookie jars. Every step also lists its
API shape so it can be scripted.

1. **Venue publishes** a gig (wizard or `POST /api/gigs` with `status: "PUBLISHED"`).
2. **Talent applies** from the gig page with a proposed rate (`POST /api/gigs/[id]/apply`,
   `{proposed_rate_cents, cover_message}`). Re-applying → 400 "already applied". PARTY → 403.
3. **Negotiate**: talent opens a thread from the gig ("Inquire" → `POST /api/conversations`
   `{gig_id}` — the server resolves the venue owner; venue user ids never reach the client).
   Propose a rate (RATE_PROPOSAL message); the counterpart's thread shows an **Accept rate**
   button → `POST /api/conversations/[id]/accept-rate` `{message_id}` writes the rate onto
   the application and drops a SYSTEM line into the thread. Unread badges update on the
   sidebar within one 10s poll.
4. **Venue hires**: Applicants page → Shortlist → Hire (`PATCH /api/applications/[id]`).
   Hire is atomic: application HIRED + gig FILLED + **shift created** with the agreed rate
   snapshotted in cents. Talent cannot hire themselves (400); a rival venue gets 404.
   **Deep-link regression**: after the gig flips to FILLED, the hired talent's gig links must
   still return 200 (fixed 2026-07-30 — anon still 404s).
5. **Shift**: talent (or venue) checks in, then out (`POST /api/shifts/[id]`
   `{to, idempotency_key}`). **Idempotency canary**: send the same key twice — the replay
   returns the recorded outcome and the audit/transition tables gain exactly one row.
   Checkout computes `shift_pay_cents` from the actual timestamps and inserts a payout row:
   `status HELD`, `gross = fee + net`, fee = exactly 5% (DB CHECK enforces the invariant).
6. **Release**: `POST /api/payouts/release` (ADMIN session or `Authorization: Bearer
   $CRON_SECRET`; Vercel Cron hits it hourly via GET + the same bearer). Within 24h of
   checkout it releases **0** rows; backdate `check_out_at` 25h on a test branch and it
   releases exactly once (second call → 0), flips the shift to PAID, and the talent gets a
   `payout.released` notification. Without Stripe keys the ledger advances and `transfers`
   stays 0; with keys each release becomes a Connect transfer.
7. **Both dashboards reflect it**: venue Payouts Pending returns to $0; talent Total
   Earnings/Earnings card show the released net.

**Availability (P6)**
- Schedule page: pick a day → slot editor (Early Evening / Prime Time / After Hours), set
  Free/Block + notes → Save → dots appear on the calendar (green available, red blocked,
  cyan shift, amber conflict = shift over a blocked day). State survives refresh
  (`GET /api/availability?month=YYYY-MM` returns `slots` + the month's shifts).
- **Available Tonight** toggle persists via `PUT /api/talent/profile` — and (regression,
  fixed 2026-07-30) a partial PUT like this must NOT reset `profile_completion_pct`; the
  banner percentage must survive the toggle.
- Slot writes are capped at 3/day by a DB UNIQUE; a second write to the same slot upserts.

**Notifications (P3.4)**
- Bell shows an unread count badge; the dropdown lists application/message/shift/payout
  events with human wording and deep links; "Mark all read" zeroes the badge
  (`GET/POST /api/notifications`). Events arrive from real actions only — no seeded noise.

**Media pipeline (P4 — G11)**
- Upload a JPEG with GPS EXIF as an avatar (any phone photo). The stored value is webp,
  ≤1600px, and **exiftool on the downloaded copy shows no GPS/EXIF**. Without
  `BLOB_READ_WRITE_TOKEN` the value is a processed `data:image/webp` URL; with it, a Blob
  URL. Oversized/wrong-MIME uploads → 400 with a clear message.

## 6. API security probes (run against local or a preview deploy)

All executed 2026-07-30 with these exact results:

```bash
BASE=http://localhost:4000
# Draft & filled gigs are invisible to the public (404, not 403 — existence stays hidden)
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/gigs/<draft-gig-uuid>     # → 404
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/gigs/<published-gig-uuid> # → 200
# Injection-shaped ids are rejected before touching SQL
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/gigs/1;DROP%20TABLE%20gigs" # → 404
# Writes demand authN + role
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH -H 'Content-Type: application/json' \
  -d '{"status":"FILLED"}' $BASE/api/gigs/<published-gig-uuid>               # → 401
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/venue/gigs                # → 401
# Public listing never leaks drafts, even with a smuggled status param
curl -s "$BASE/api/gigs?status=DRAFT" | grep -c DRAFT                        # → 0
```

```bash
# Data-subject endpoints are session-scoped — there is no id to tamper with
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/account/export             # → 401 anon
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H 'Content-Type: application/json' \
  -d '{"password":"x","confirm":"DELETE"}' $BASE/api/account                   # → 401 anon
# Erasure needs BOTH factors
#   wrong password  → 400 "Password is incorrect"
#   confirm != DELETE → 400 "Type DELETE to confirm account deletion"
```

```bash
# Marketplace probes (P3–P8), all executed 2026-07-30 with these exact results
# PARTY is read-only: principal writes are role-denied
#   apply as party  → 403 · shift transition as party → 403 · gig-anchored thread → 403
# Fee tampering is impossible by construction: the apply/shift/payout schemas accept no
# fee/gross/net fields — the 5% split is computed server-side at checkout (grep the zod
# schemas; a smuggled "fee_cents" is stripped as an unknown key).
# Payout release is privileged:
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/payouts/release    # → 401 anon
#   talent/venue session → 403 · wrong bearer → 401 · CRON_SECRET bearer or ADMIN → 200
# Stripe surface is key-gated, not broken:
curl -s $BASE/api/stripe/connect                    # (authed) → {"configured":false,...}
#   POST /api/stripe/connect without keys → 503; webhook without a valid signature → 400
# Cross-tenant: a rival venue PATCHing someone else's application/shift → 404 (not 403);
# a talent reading another talent's applications gets only their own rows (list is
# session-scoped — there is no id parameter to tamper with).
```

**CSP**: `curl -sI $BASE/ | grep -i content-security-policy` → `script-src 'self' 'nonce-…'
'strict-dynamic'` (a **fresh nonce per request** — run twice and diff), no `unsafe-inline` in
script-src, `frame-ancestors 'self'` (+ configured builder origins). Pages must load with an
**empty browser console** — a CSP regression shows up as blocked-script errors instantly.

**Sentry**: with no `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` set, zero Sentry network traffic.
With a DSN, trigger an error and confirm in the Sentry UI that the event has no cookies,
headers, email, or phone — only `user.id` (scrubber: `src/lib/sentry-scrub.ts` + tests).

## 7. RLS (verified; production cutover pending)

`migrations/0004_rls.sql` declares the policies and `0006` GRANTs a least-privilege role;
**every P3–P8 migration (0007–0011) ships its tables' policies + GRANTs in the same file**
(the P2.4 convention), so the cutover inherits the new tables with no extra step — the
structural suite asserts each new table has RLS enabled.
**As of 2026-07-30 these are proven to work** — but they are still inert in production,
because the app connects as the table owner and owners bypass non-forced RLS. The full
runbook, including why the cutover is gated on wiring rather than an env var, is
[`docs/rls-cutover.md`](docs/rls-cutover.md).

Re-verify against any Neon branch:

```bash
# 1. Create the role on the branch, then re-run migrations so 0006 GRANTs to it
#    CREATE ROLE afterdark_app WITH LOGIN PASSWORD '…' NOBYPASSRLS;
yarn db:migrate && yarn db:seed

# 2. Prove isolation as the non-owner role (10 checks; exits non-zero on any failure)
OWNER_URL=<owner conn> RLS_URL=<afterdark_app conn> yarn db:verify-rls
```

What it asserts, and why each matters:

| Check | Why |
|---|---|
| Connected role has `rolbypassrls = false` | Without this the rest proves nothing |
| Context-less read sees only `PUBLISHED` gigs | Default deny for unscoped queries |
| Another venue's DRAFT invisible **by direct id** | Existence itself must not leak |
| …still invisible with the attacker's own valid context | Context is not a skeleton key |
| Venue **can** read its own drafts with context | Positive control — the policy scopes, not blanket-denies |
| Cross-tenant `UPDATE` affects 0 rows | Writes are scoped, not just reads |
| `audit_logs` `UPDATE`/`DELETE` denied | Append-only by privilege, not merely by convention |
| Role cannot run DDL | Blast radius of a compromised app credential |
| Public talent directory still readable | The product still works under RLS |

⚠️ Never point this at the production branch: it inserts a second "rival" tenant on purpose.

## 8. Known gaps (do not report as regressions)

- **Admin (P9) and PWA/service-worker (P10) do not exist yet** — the ADMIN role works at the
  API layer (matrix-verified) but has no UI.
- **Stripe has no keys configured anywhere** — `/api/stripe/*` 503s by design and payout
  release advances the ledger without transfers. See DEV_TIMELINE P8 honest-status for the
  first-key checklist. Money movement is therefore untested against real Stripe test-mode.
- The venue **"Gig Calendar"** page (`/dashboard/venue/schedule`) is still hardcoded sample
  data — not a PRD screen; either wire it to `/api/venue/gigs` or drop it.
- **RLS is verified but not yet enforcing in production** — the app still connects as the
  table owner. App-level authZ (proven by the matrix suite) is the active control; RLS is the
  defence-in-depth layer awaiting the cutover in `docs/rls-cutover.md`.
- Pre-P4 media (the preview accounts' original avatars) is still base64 in Postgres; new
  writes are processed, but the backfill is pending (Backlog #10). AV scanning absent.
- Messaging/notifications are **polling** (5–10s), not push/SSE — by design until post-alpha.
- The in-memory rate limiter is per-instance (P10.3 makes it shared) — limits are best-effort
  on serverless.
- Legal copy is written to match what the code actually does, but has **not been reviewed by
  counsel**; that is required before general availability, not before alpha.
- No automated retention-purge job yet — log retention relies on provider defaults
  (`docs/retention.md` §4).
- Map views deferred (Backlog #1). Multi-select browse filters refine client-side within the
  fetched page until the API grows array params (Backlog #27).
