# DEV_TIMELINE — AfterDark

> Living status document. **Update the "Current status" block and phase checkboxes whenever a
> slice lands.** Companion to [CLAUDE.md](CLAUDE.md) (architecture & audit) and
> [TENANT_GUARDRAIL.md](TENANT_GUARDRAIL.md) (compliance & performance gates).

---

## 1. Current status — YOU ARE HERE

- **Date:** 2026-07-30 · **Branch:** `claude/p3-p8-marketplace-loop` (worktree off `main`;
  PRs #7–#10 merged)
- **Project stage:** **P0–P8 complete. The full marketplace loop runs end-to-end on real
  data** (apply → negotiate → hire → shift check-in/out → escrowed payout → release).
  Next: P9 (admin & trust) and P10 (PWA & alpha gate).
- **P3–P8 delivered this session** (520 tests green; the whole loop executed against a Neon
  branch — API-level with curl and visually in the browser — procedures in
  [TESTING.md](TESTING.md); migrations 0007–0011 applied to the production branch):
  - **P3 Applications + notifications**: `0007_applications.sql` (unique `(gig_id,
    talent_id)`, `proposed_rate_cents` INTEGER, statuses PENDING|SHORTLISTED|HIRED|REJECTED|
    WITHDRAWN, RLS policies in-file per the P2.4 convention — all five new migrations follow
    it). `POST /api/gigs/[id]/apply` (TALENT-only, PUBLISHED-only, revives a WITHDRAWN row);
    `PATCH /api/applications/[id]` runs an actor-scoped transition matrix
    (`application-lifecycle.ts`) and **hire is one `sql.transaction`**: application→HIRED +
    gig→FILLED + shift INSERT (agreed rate = accepted proposal, else base rate — snapshotted
    in cents). Venue applicants page + talent My Applications + gig-detail apply panel all
    real; `notifications` table + bell dropdown + real sidebar unread badges (Backlog #12 ✅);
    messages/shifts/payouts emit through one `notify()` helper.
  - **P4 Media pipeline**: `api/utils/media.ts` — every uploaded image is decoded and
    **re-encoded via sharp (EXIF/GPS stripped — G11), resized ≤1600px, webp**; stored to
    Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, else kept inline as a processed data
    URL (dev fallback). Wired into talent/venue profile writes, settings avatar, message
    attachments, and a generic `POST /api/upload`. S3 presign + backfill deferred (Backlog).
  - **P5 Messaging & negotiation**: `0008_messaging.sql` (conversations GIG|PARTY_INQUIRY
    kinds + unique partial indexes; messages TEXT|RATE_PROPOSAL|SYSTEM with `rate_cents`;
    reports). Participant-scoped reads; venue user ids resolved server-side from the gig so
    they never transit the client. Shared two-pane `MessagesView` (5s polling, unread marks,
    attachment→data-URL through P4, propose-rate popover, gig-in-focus rail, report→
    `reports`). **Accept-rate writes the agreed rate onto the application** and drops a
    SYSTEM message into the thread.
  - **P6 Availability**: `0009_availability.sql` (3 slots/day, unique `(talent_id, date,
    time_slot)`) + `available_tonight` on talent_profiles. `GET/PUT /api/availability`
    (month-scoped, per-slot upsert/delete in one transaction) powering the rebuilt calendar
    (month grid with status dots, conflict = shift over a blocked day, slot editor rail,
    Available Tonight toggle → profile PUT).
  - **P7 Live ops / shifts**: `0010_shifts.sql` (+`shift_transitions` idempotency table).
    `POST /api/shifts/[id]` — actor-scoped matrix (`shift-lifecycle.ts`), **idempotency keys
    backed by a DB unique constraint**: replaying a key returns the recorded outcome without
    re-running the transition (verified live). Checkout computes `shift_pay_cents` from
    actual check-in/out timestamps and **creates the payout ledger row (HELD)** via
    server-side `splitPayout`. Venue dashboard Active Operations rail and talent Upcoming
    Bookings (On My Way / Check In / Check Out) are real; both dashboards' stats now derive
    from live rows.
  - **P8 Payments (key-gated)**: `0011_payments.sql` — `payouts` append-only ledger (integer
    cents, `CHECK (gross = fee + net)`, user FKs `ON DELETE SET NULL` for the 7-year
    financial carve-out), `stripe_accounts`, `stripe_events` (PK = event id → replay guard).
    `stripe.ts` is **key-gated**: without `STRIPE_SECRET_KEY` the `/api/stripe/*` surface
    returns 503/`configured:false` and the ledger still advances so the loop stays
    demonstrable. With keys: Connect Express onboarding, webhook with
    `constructEventAsync` signature verification + replay drop, transfers on release.
    `POST|GET /api/payouts/release` releases HELD→RELEASED **only 24h after checkout**,
    exactly once (`WHERE status='HELD'`), flips shifts→PAID, notifies; callable by ADMIN
    session or `CRON_SECRET` bearer — `vercel.json` now schedules it hourly (Vercel Cron
    invokes with GET + the bearer).
  - **AuthZ matrix grew with the surface** (P2.3 paying off): ~21 new rows, new
    `UNAVAILABLE` outcome for the key-gated Stripe start, and the generated suite now
    contributes 231 tests; the coverage gate kept every new route declared.
  - **Bugs found while verifying (fixed + regression-tested)**: (1) hiring flips a gig to
    FILLED, which made the hired talent's own deep links 404 — gig detail now stays visible
    to a talent with an application on it (anon still 404s); (2) partial profile PUTs (e.g.
    the Available Tonight toggle) recomputed completion % from the request body alone and
    clobbered the stored value to 0 — now merged over the stored row; (3) the app never set
    the `dark` class, so every shadcn semantic token resolved to the light palette (outline
    buttons rendered white-on-white) — root layout now pins `<html class="dark">`; (4) venue
    Open Gigs "Applicants" column showed a placeholder dash — now real counts with a
    pending-count chip.
- **P2 delivered this session** (373 tests green; browser- and database-verified, procedures in
  [TESTING.md](TESTING.md)):
  - **P2.1 Legal surface (G1/G3)**: `/legal/privacy`, `/legal/terms`, `/contact` — real,
    versioned, dated, reachable logged-out; content matches what the code actually does
    (including "payments are not live"). Version/date and contact addresses come from
    `src/lib/legal.ts`. Every footer `href="#"` is gone. Cookie audit confirms **no
    `Set-Cookie` on logged-out pages** — no consent banner is needed while that holds.
  - **P2.2 Self-serve DSR (G4)**: `GET /api/account/export` (JSON download, rate-limited 5/h,
    `no-store`, audited, credentials deliberately excluded and *named* in `meta.excluded`) and
    `DELETE /api/account` (password re-auth **plus** typed `DELETE`, cascade, audit-trail
    pseudonymization). Both read **one registry** — `api/utils/account-data.ts` — so export and
    erasure cannot drift apart; later slices add their table there once.
  - **P2.3 AuthZ matrix (§6.1)**: `api/utils/authz-matrix.ts` declares every route × actor ×
    ownership; the generated suite contributes **112 tests** and **fails CI when a `route.ts`
    has no row** (and when a row points at a deleted route). Writing it surfaced two wrong
    assumptions in my own spec — `/api/session` 401s rather than returning null, and a rival's
    *published* gig is public by design, so the isolation test now runs against a DRAFT.
  - **P2.4 RLS**: GRANTs migration (`0006`, least-privilege, `audit_logs` INSERT/SELECT only,
    no DDL) + **`yarn db:verify-rls`, which proved the 0004 policies actually enforce against
    a real non-owner role — 10/10** (drafts invisible by direct id, cross-tenant UPDATE affects
    0 rows, audit trail immutable). Nobody had ever tested them against an enforcing role.
    **The production cutover is deliberately NOT done** — see the "honest status" note below.
  - **P2.5 Age gate + governance (G12/G2/G7)**: 18+ attestation at signup recorded server-side
    (`age_confirmed_at`, idempotent — first attestation wins); per-gig `age_requirement`
    (18/21, DB CHECK + zod) now persisted by the create-gig wizard and surfaced as a **21+ ONLY**
    badge on the detail page. `docs/ropa.md` and `docs/retention.md` written, including a
    candid "known gaps" table.
  - **Security bug found and fixed while verifying**: a **deleted account's session kept
    working**. better-auth caches the session in the cookie for 7 days, so `getSession`
    succeeded after erasure and the user could still call authenticated endpoints. `AuthGuard`
    now confirms the user row exists on every authenticated request (one indexed lookup, and
    it replaces the query `requireRole` already made). This also fixes stale sessions after a
    database swap, and pre-wires account suspension for P9.
- **P0/P1 close-out (second pass, same day):**
  - **2FA → better-auth twoFactor plugin (Backlog #17 ✅)**: migration `0005` (plugin
    `twoFactor` table + `user.twoFactorEnabled`, legacy hand-rolled enrollments cleared);
    plugin registered in `auth.ts` (+ rate limits on its endpoints); `twoFactorClient` in
    `auth-client.ts` with a callbackUrl-preserving challenge redirect; new
    `/account/two-factor` challenge page (TOTP + one-time backup codes + trust-device);
    settings 2FA card rebuilt on the plugin (password-gated enable/disable, local QR, backup
    codes); legacy `/api/settings/2fa` + `totp.ts`/`crypto-box.ts` removed —
    **`AUTH_SECRET_ENCRYPTION_KEY` is obsolete** (BETTER_AUTH_SECRET now encrypts
    enrollments; rotating it invalidates them). Sign-in is now genuinely gated (the old 2FA
    never challenged at sign-in). **Full loop browser-verified** (enroll → challenge → TOTP →
    backup code → disable); tests 245 green (hand-rolled TOTP/SecretBox suites retired with
    their code).
  - **oxlint in CI (Backlog #20 ✅)**: `yarn lint` (deny-warnings) + CI job; 4 pre-existing
    warnings fixed.
  - **Bug found & fixed while verifying**: `/dashboard/settings` never hydrated on clean
    loads (its `useSearchParams`+`Suspense` wrapper stayed suspended forever under the
    nonce-CSP/force-dynamic setup — form rendered but dead, values never loaded, predating
    today). Role param now read post-mount; page hydrates and populates. TESTING.md §5 has
    the canary check.
- **P1 delivered this session** (285 tests green; verified in-browser against a Neon branch,
  procedures now codified in [TESTING.md](TESTING.md)):
  - **P1.1** Talent browse consumes real `GET /api/gigs` (validated filters, 12/page
    pagination via parameterized LIMIT/OFFSET, HOT/NEW badges derived from data); venue
    browse consumes a new public `GET /api/talent` directory (public-profile columns only).
    `MOCK_GIGS`/`MOCK_TALENT` deleted. `tonightOnly` fixed to a rolling 24h window (the old
    UTC-date match dropped late-night gigs).
  - **P1.2** `/gigs/[id]` detail page (payout hero w/ computed shift payout, about, venue
    card, live 5% fee estimator, escrow note; map deferred) + `GET /api/gigs/[id]` —
    PUBLISHED is public, any other status 404s for non-owners (draft-leak safe).
  - **P1.3** Gig lifecycle DRAFT→PUBLISHED→FILLED→COMPLETED/CANCELLED (`0003_gig_lifecycle.sql`
    + pure transition matrix in `api/utils/gig-lifecycle.ts`); owner-only idempotent
    `PATCH /api/gigs/[id]` (audited, optimistic-concurrency guarded); venue dashboard Open
    Gigs table real via `GET /api/venue/gigs`, with per-status action buttons and real
    Active-Gigs/Filling-Rate stats (payout/time-to-hire stats honestly muted until P8/P3).
  - **P1.4** Landing "Hot Gigs Tonight" reads real published gigs (tonight-first, upcoming
    fallback, friendly empty state) via a `FeaturedTonight` client component.
  - **P0 follow-ups**: **nonce CSP** shipped (per-request nonce + `strict-dynamic` via
    middleware; `unsafe-inline` dropped from script-src; app now renders fully dynamic —
    `force-dynamic` in the root layout is a hard requirement of nonce CSPs). **Sentry**
    wired (`@sentry/nextjs`, no-op without DSN, all events pass a tested PII scrubber).
    **RLS** policies shipped dormant (`0004_rls.sql` + `api/utils/rls.ts`; activation is an
    ops step — see migration header). **twoFactor plugin migration deliberately deferred**
    → Backlog #17 (rationale there).
  - Hygiene: off-spec talent create-gig page removed (Backlog #11 ✅); sidebar now shows the
    real session identity and fake unread badges are gone (Backlog #12 partial).
  - **Ops**: production Neon DB (`after-dark` project) migrated 0001–0004 and seeded with the
    three shared preview accounts (talent/venue/party — credentials in TESTING.md §2);
    sign-in verified against the deployed site.
- Baseline: create.xyz export in `anything/` + the three audit docs (merged/PR'd earlier).
- **P0 delivered this session** (all security findings CLAUDE.md §7 #1–#9 addressed):
  - **Migrations**: `apps/web/migrations/0001_baseline.sql` (reproduces §6.1) + `0002_audit_logs.sql`;
    idempotent runner `scripts/migrate.mjs` (`yarn db:migrate`) + demo seed `scripts/seed.ts`
    (`yarn db:seed`); `.env.example`. **Verified end-to-end against a disposable Neon branch.**
  - **RBAC + authN gate**: `src/middleware.ts` (session gate on `/dashboard/*` + `/onboarding`)
    and a DB-backed `AuthGuard` (`api/utils/auth-guard.ts`) enforcing the §6.1 authZ matrix on
    every write route. **ADMIN self-escalation fixed** — `/api/user/role` rejects ADMIN (schema).
  - **Input validation**: zod schemas (`api/utils/schemas.ts`) + `parseBody`/`parseQuery` on
    every route; unknown-key stripping, body-size caps, public gig GET pinned to PUBLISHED.
  - **2FA hardened**: TOTP secrets encrypted at rest (AES-256-GCM `SecretBox`), **QR generated
    locally** (no more `api.qrserver.com` leak), secret never re-disclosed once enrolled,
    verification rate-limited + constant-time.
  - **Open-redirect fixed**: `sanitizeCallbackUrl` (relative paths only) on signin/signup + middleware.
  - **Security headers**: CSP/HSTS/X-Content-Type-Options/Referrer-Policy/Permissions-Policy via
    `security-headers.js` wired into `next.config.js`; `ignoreBuildErrors` removed.
  - **Audit + logging**: append-only `audit_logs` via `AuditLogger`; structured `Logger` with
    PII redaction; better-auth `rateLimit` config on credential endpoints.
  - **CI**: `.github/workflows/ci.yml` (typecheck, vitest, build, `yarn npm audit`, gitleaks).
  - **Tests**: **219 passing** (unit + route + middleware + headers + migration-core), heavy on
    edge cases (SQLi payloads, escalation, redirect smuggling, TOTP RFC vectors, GCM tampering,
    rate-limit window edges). Dead code removed; app metadata renamed to AfterDark.
- **Still UI-with-mock-data only** (unchanged): landing featured gigs, both dashboards, browse,
  applicants, messages, schedule, live-ops checkout. **Still missing:** gig detail page,
  applications, messaging/availability/shifts backends, Stripe, admin, notifications, search,
  map, PWA. Full matrix: CLAUDE.md §4.
- **New env var**: `AUTH_SECRET_ENCRYPTION_KEY` is now **required** for 2FA (see `.env.example`;
  2FA fails closed without it). `DATABASE_URL` still required.

### Pick-up-here: next five tasks (in order)

> P3–P8 are complete; **P9 admin & trust** is next (reports are already flowing into the
> `reports` table from P5.3). The RLS production cutover remains the carried ops item.

1. **P9.1** — Admin gating + moderation dashboard skeleton: ADMIN-only layout/sidebar
   variant, reports triage list (severity chips, review → CLOSED/REVIEWING transitions,
   audited). The `reports` table and matrix outcomes already exist — this is UI + two
   endpoints. **Add matrix rows in the same PR** (the coverage gate enforces it).
2. **P9.2** — User & gig management: suspend/verify flags + audit-log viewer with CSV export
   (async, handlers < 1s); every admin action audited with actor id.
3. **P10.1–.2** — PWA shell: `manifest.webmanifest` + icons + Serwist service worker
   (precache shell, network-first APIs, **never cache authed responses; purge on logout**).
4. **Ops carry-over** — RLS cutover on prod (`afterdark_app` role per
   [`docs/rls-cutover.md`](docs/rls-cutover.md)); set `CRON_SECRET` in Vercel so the hourly
   payout release actually fires; when ready for money tests, add `STRIPE_SECRET_KEY` +
   `STRIPE_WEBHOOK_SECRET` (test mode) and `BLOB_READ_WRITE_TOKEN` for real image storage.
5. **P10.3–.4** — Shared rate-limit store (Backlog #21) + CI gates (Lighthouse budgets, k6
   Apdex, axe) — the alpha exit checklist.

---

## 2. Phase plan to alpha

Estimates assume one focused developer (human or AI-assisted). **Re-sliced 2026-07-30** (see
§2.1 for the rationale and the old→new map): the remaining work is now smaller, ordered so
that security obligations and force-multipliers land before the code that depends on them,
and annotated with what can run in parallel.

### 2.0 Definition of done — applies to every slice, don't restate it

A slice is shippable when **all** of these hold. Anything a slice needs *beyond* this is
listed in its own "Security gate" row.

1. Migration is forward-only, idempotent, and applied to a disposable Neon branch first.
2. Every new endpoint has: zod validation, an `authGuard` role check, server-derived tenant
   scoping (never a client-supplied owner id), and a row in the **authZ matrix table**
   (P2.3) — CI fails if a route has no row.
3. Tests: unit (pure logic) + route (authN/authZ/tenant-isolation/input-rejection) + the
   SQLi-payload regression pattern already used in `gigs-query`.
4. Writes that create money, PII, or state transitions are audited via `auditLogger`.
5. `yarn test && yarn typecheck && yarn lint && yarn build` green; browser-verified against
   seeded data; TESTING.md updated with the manual procedure.
6. DEV_TIMELINE status block + phase checkbox updated in the same PR.

### 2.1 Why this order (sequencing rationale + old→new map)

**Ordering principles**

1. **Legally-blocking work precedes more real users.** The app is deployed and accepting
   signups *today*, so TENANT_GUARDRAIL §4 G1 (privacy/ToS), G4 (export/delete) and G12
   (18+) are already-live obligations, not P7 polish. They also unblock growth: ad platforms
   and app stores refuse traffic to a product with no privacy policy.
2. **Force-multipliers before the code that needs them.** The authZ matrix harness, RLS
   activation, and the media pipeline each make every later slice cheaper *and* safer.
   Retrofitting RLS across 9 tables costs several times what activating it on 4 does.
3. **Blast-radius isolation.** Money, PII egress, and destructive operations get their own
   slice and their own review — never bundled with UI work. This is why Stripe split out of
   the old "live ops & payments" mega-slice.
4. **Slices stay ≤ ~3 days**, independently shippable and revertable behind the previous one.
   Smaller slices = earlier feedback, smaller merge conflicts, cheaper rollback.
5. **Parallel tracks are marked** so two developers (or agent sessions) don't collide on the
   same tables.

**What changed from the original P2–P7**

| Original | Now | Why |
|---|---|---|
| GDPR surface buried in P7 | **P2.1/P2.2/P2.5** (first) | Legally live the moment real users sign up — which already happened. Also unblocks marketing. |
| AuthZ matrix implicit per-slice | **P2.3** (explicit, once) | TENANT_GUARDRAIL calls it "the single most important test artifact in the repo"; building it once makes every later slice's authZ free and un-forgettable. |
| RLS activation dangling in Backlog #25 | **P2.4** (scheduled) | Cheapest while only 4 tenant tables exist; every later migration then ships its policy alongside. |
| Uploads inside P3 messaging | **P4** (own slice) | Also fixes a *live* privacy issue (base64 PII in DB, no EXIF/GPS strip — G11) and unblocks attachments. |
| P5 = shifts **+** Stripe (1.5–2 wk) | **P7 shifts** / **P8 payments** | Halves the riskiest phase; shifts ship without waiting on payments, and money code gets isolated review. |
| Rate-limit store in Backlog | **P10** (before load test) | In-memory limiter is per-instance; it must be shared before the Apdex gate means anything. |
| Serial P2→P7 chain | Parallel tracks marked | P6 availability and P9 admin share no tables with their neighbours. |

Acceptance for every slice additionally includes the guardrail gates: unit+integration tests
green, authZ/tenant-isolation tests for new endpoints, Lighthouse budgets green, no new ZAP
high/medium (TENANT_GUARDRAIL §7 checklist).

### P0 — Foundations & hardening (≈1 wk) — ✅ **landed 2026-07-24** (219 tests green)
- ☑ Migration baseline + seed data + `.env.example` (verified on a disposable Neon branch)
- ☑ Auth middleware + RBAC map; fix ADMIN escalation; open-redirect allowlist
- ☑ zod input validation on all routes; security headers; rate limiting on auth endpoints
- ☑ 2FA hardened: encrypted secret at rest (AES-256-GCM) + local QR (no third-party leak).
  Note: full better-auth twoFactor-plugin migration (recovery codes) deferred to Backlog #17
- ☑ Structured logging + `audit_logs` table (PII-redacted). Sentry/error-tracking deferred (Backlog)
- ☑ CI pipeline (typecheck strict, vitest, build, `yarn npm audit`, gitleaks); dead code removed
  (`useUpload.ts`, `api/utils/upload.ts`, `useHandleStreamResponse.ts`, stray
  `api/vitest.config.ts`); app metadata "Anything App" → "AfterDark".
  Note: oxlint not yet wired into CI (config present) — carry into P1.

### P1 — Gigs end-to-end (≈1 wk) — ✅ **landed 2026-07-30** (285 tests green; TESTING.md pass)
- ☑ Browse consumes real `GET /api/gigs` (neighborhood/role/pay/tonight filters, pagination);
  venue browse consumes new public `GET /api/talent`
- ☑ `/gigs/[id]` detail page per wireframe p4 (minus map, minus submit — estimator live, submit
  arrives with P3 applications, renumbered from P2 in the 2026-07-30 re-slice)
- ☑ Gig lifecycle statuses (DRAFT→PUBLISHED→FILLED→COMPLETED/CANCELLED) + venue Open Gigs table real
- ☑ Landing "Featured Tonight" reads real published-tonight gigs
- ☑ Bonus from task-5 carry-overs: nonce CSP, Sentry w/ PII scrub, dormant RLS policies
  (twoFactor plugin migration → Backlog #17)

### P2 — Trust & compliance spine (≈3–4 d) — ✅ **landed 2026-07-30** (373 tests green)

- ☑ **P2.1 Legal surface (G1, G3).** `/legal/privacy`, `/legal/terms`, `/contact` — versioned,
  dated, reachable logged-out; footer/signup links wired; cookie audit shows no `Set-Cookie` on
  logged-out pages. Version + contacts centralised in `src/lib/legal.ts`.
- ☑ **P2.2 Self-serve DSR (G4).** `GET /api/account/export` and `DELETE /api/account`
  (password re-auth + typed confirmation), Settings → **Privacy & Data**. One registry
  (`api/utils/account-data.ts`) backs both, so they cannot drift.
- ☑ **P2.3 AuthZ matrix harness (§6.1).** Declarative table + generated suite (112 tests);
  **a route without a row fails CI**, as does a row pointing at a deleted route.
- ☑ **P2.4 RLS — verified, cutover pending.** GRANTs shipped (`0006`); `yarn db:verify-rls`
  proves the 0004 policies enforce against a real non-owner role (10/10). Production still
  connects as the owner: see the honest-status note below and
  [`docs/rls-cutover.md`](docs/rls-cutover.md).
- ☑ **P2.5 Age gate + governance docs (G12, G2, G7).** 18+ attestation recorded server-side;
  per-gig 18/21 requirement persisted and surfaced; `docs/ropa.md`, `docs/retention.md`.
- ☑ **Bonus (security bug):** deleted accounts could still authenticate for up to 7 days via
  better-auth's session cookie cache. `AuthGuard` now verifies the account exists on every
  authenticated request.

> **Honest status on P2.4.** Everything except the production cutover is done, and the cutover
> is deliberately *not* bundled here. Neon's HTTP driver is stateless per query, so RLS context
> must be set inside a transaction per statement (`withRlsContext`). Verification showed the
> consequence concretely: connected as the least-privilege role **without** context, a venue
> sees only `PUBLISHED` gigs — its own drafts silently vanish from the dashboard. Flipping
> `DATABASE_URL` before wiring those five routes would therefore degrade the product without
> an error. The wiring is safe to land first (it is a no-op while connected as owner), which is
> exactly the order `docs/rls-cutover.md` prescribes.

**Security gate:** ✅ G1/G3/G4/G12 verifiable per TENANT_GUARDRAIL §4.2; export covers every
PII table in §4.1 and names its exclusions; delete cascades with no orphans and pseudonymizes
(never deletes) the audit trail; RLS negative tests green under an enforcing role.

### P3 — Applications (≈3–4 d) — ✅ **landed 2026-07-30** (PR #11; loop-verified on a Neon branch)
- ☑ **P3.1** `applications` table (unique `(gig_id, talent_id)`, proposed rate in integer
  cents) + `POST /api/gigs/[id]/apply` (TALENT-only, rate-limited, PUBLISHED gigs only); flip
  the detail page's disabled submit — the 5% estimator is already live from P1.2.
- ☑ **P3.2** Venue review: `GET /api/venue/applications`; shortlist/hire transitions using the
  same pure transition-matrix pattern as `gig-lifecycle.ts`; hiring flips the gig to FILLED in
  one transaction. Dashboard Applicants column + `dashboard/venue/applicants` real.
- ☑ **P3.3** Talent "My Applications" real; "✓ Applied" state on browse + detail; withdraw.
- ☑ **P3.4** `notifications` table + bell dropdown + real sidebar badges (finishes Backlog
  #12). **Built here as shared infrastructure — P5 and P7 emit into it rather than rolling
  their own.**

**Security gate:** a talent may never read another talent's application; a venue sees only
applications to its own gigs (both directions encoded in the P2.3 matrix); the proposed rate
is server-validated against the gig, never trusted from the client.

### P4 — Media pipeline (≈2 d) — ✅ **landed 2026-07-30** (sharp EXIF-strip everywhere; Blob driver key-gated; remainder tracked in Backlog #10)
- ☑ Presigned upload route (S3/R2) + CDN read URLs; server-side size and MIME enforcement.
- ☑ **EXIF strip on every image** (GPS in photo metadata is PII — G11) + image resizing.
- ☑ Migrate existing base64 avatars/portfolio images out of Postgres into object storage
  (backfill script + fallback read path); tighten CSP `img-src` to the CDN origin.

**Security gate:** no user-supplied file is served from an origin that can execute it; the
upload route is authenticated and rate-limited; the G11 network audit shows zero third-party
PII egress.

### P5 — Messaging & negotiation (≈4–5 d) — ✅ **landed 2026-07-30** (polling; SSE deferred as planned)
- ☑ **P5.1** `conversations` + `messages` schema; participant-scoped reads; polling via
  TanStack Query (SSE deferred — serverless-friendly); unread counts feed P3.4 notifications.
- ☑ **P5.2** Two-pane UI wired; `RATE_PROPOSAL` message kind + "Propose Final Rate" flow
  (accepting one writes the agreed rate onto the application); gig-in-focus sidebar.
- ☑ **P5.3** Attachments on the P4 pipeline; Report Conversation → `reports` table (feeds P9).

**Security gate:** message reads are participant-scoped *and* RLS-covered; PARTY may open only
private-party inquiry threads, never gig threads; attachments inherit P4's validation.

### P6 — Availability & scheduling (≈2–3 d) — ✅ **landed 2026-07-30** (browse-ordering boost → Backlog #28)
- ☑ `availabilities` CRUD (3 slots/day per PRD) + calendar wiring; Available Tonight flag.
- ☑ Conflict warnings against booked shifts; availability boost in browse ordering.

*Shares no tables with P5 — safe to run concurrently.*

### P7 — Live ops / shifts (≈3 d) — ✅ **landed 2026-07-30** (idempotency replay verified live)
- ☑ `shifts` model (call time; status SCHEDULED→IN_TRANSIT→CHECKED_IN→CHECKED_OUT).
- ☑ Check-in/out endpoints: **idempotency keys backed by a DB unique constraint** (§6.3),
  audited and replay-safe under the midnight burst; venue Active Operations and talent Check
  In become real.

**Security gate:** talent may check in/out only their own shift, a venue only its own venue's;
double-submits and out-of-order transitions provably no-op rather than double-count hours.

### P8 — Payments / Stripe Connect (≈4–5 d) — ✅ **landed 2026-07-30, key-gated** (ledger + release live; real transfers activate when Stripe keys are set — see honest-status note below)

> The highest-risk slice in the project: real money, webhooks, PCI posture. It ships alone and
> is reviewed alone.

- ☑ **P8.1** Connect Express onboarding (test mode); store **only** Stripe account/transfer
  ids — never PANs or IBANs (SAQ-A posture, §6.4).
- ☑ **P8.2** Destination charges with a **server-computed** 5% application fee; `payouts`
  ledger append-only, all money in **integer cents**.
- ☑ **P8.3** Webhook endpoint with signature verification + replay/idempotency guard; escrow
  release 24 h after checkout (scheduled job); venue "Payouts Pending" metric real.

**Security gate:** dedicated tests for fee tampering (a client-sent fee is ignored), forged
and replayed webhook rejection, and double-release prevention; no card data ever touches our
servers or logs.

> **Honest status (P8):** the fee math, ledger, escrow window, release job, webhook
> signature/replay guards and Connect onboarding flow are implemented and tested — but the
> project has **no Stripe keys configured anywhere yet**, so no real (even test-mode) money
> has moved. `/api/stripe/*` deliberately 503s until `STRIPE_SECRET_KEY` is set, and
> `payouts/release` advances the ledger without transfers. First key setup checklist: create
> the Stripe platform account → set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (test
> mode) in Vercel → register the webhook endpoint → run TESTING.md §10's Stripe addendum.

### P9 — Admin & trust (≈3 d) — ☐ not started · **parallel with P8** (needs P5.3 reports)
- ☐ Admin gating (ADMIN granted out-of-band only — self-service escalation is already blocked).
- ☐ Moderation dashboard: reports triage, user & gig management (suspend/verify), audit-log
  viewer, **async** CSV export (handlers stay under 1 s, §6.3).
- ☐ KPI cards from real aggregates.

**Security gate:** every admin action is audited with the actor id; admin reads of private
messages are logged as moderation events; no admin surface is reachable by any non-ADMIN role.

### P10 — PWA, performance & alpha gate (≈3–4 d) — ☐ not started
- ☐ **P10.1** `manifest.webmanifest` (AfterDark, standalone, theme `#121212`, maskable icons).
- ☐ **P10.2** Serwist service worker: precache shell/static, network-first APIs, offline
  fallback. **Never cache authed API responses; purge caches on logout** (§6.6) — test:
  logout → offline → no PII retrievable from cache.
- ☐ **P10.3** Shared rate-limit store (Upstash or a Postgres token bucket, Backlog #21) — the
  in-memory limiter is per-instance, which makes the Apdex gate meaningless until this lands.
- ☐ **P10.4** Gates in CI: Lighthouse CWV budgets, k6 Apdex ≥ 0.85 @ T=300 ms
  (TENANT_GUARDRAIL §3.4 scenarios), `@axe-core/playwright` on the 10 core screens.

**Security gate:** the §6.6 cache-purge test is green; no service-worker route bypasses auth.

### Dependency graph (what can run in parallel)

```
P2 (spine) ──► P3 (applications) ──► P5 (messaging) ──► P9 (admin)
                     │                    ▲               ▲
                     │              P4 (media) ───────────┘
                     │                    │
                     └──► P7 (shifts) ──► P8 (payments)

P6 (availability) ── independent after P2; run alongside P5
P10 (PWA/perf)    ── P10.1/P10.2 can start any time after P2; P10.4 gates last
```

**Alpha exit gate:** full loop demo (venue posts → talent applies → negotiation → hire →
check-in/out → sandbox payout → admin audit trail) on the deployed PWA, with the
TENANT_GUARDRAIL §7 checklist signed off **and** the §4.2 GDPR obligations demonstrably live.
Rough total: **5.5–7 focused weeks** serial; roughly a week less when P6, P9 and P10.1–2 run
in parallel.

---

## 3. Technical Backlog

Items noted during the audit that are **not** required for the alpha gate but must not be lost:

1. **Map view** (browse pins + gig-detail map, wireframe p2/p4) — needs geocoding + lat/lng on
   gigs; consider MapLibre + OSM tiles to avoid key management.
2. **External calendar & ticketing integrations** for venues (PRD §2.B) — Google/Outlook
   calendar sync; ticketing (external systems) webhooks; affects promoter payouts.
3. **Promoter sub-role & payment triangle** (PRD §2.A): Venue→Promoter and Promoter→Venue
   flows, ticket-sales-based compensation — needs product definition before build.
4. **Mobile app** (`anything/apps/mobile`): currently a generic Expo scaffold rendering `null`
   ("Anything mobile app"); decide post-alpha whether to build native or lean on the PWA.
   The web already exposes `/api/auth/token` + `/api/auth/expo-web-success` for it.
5. **WebSockets/push**: upgrade messaging + live-ops from polling/SSE; Web Push for "Hot Gig
   Tonight" alerts (PWA push requires user opt-in UX).
6. **Matching engine**: Create-Gig "Live Analysis" candidate matching & pricing hints
   (wireframe p3) — real query over availabilities + roles + rates.
7. **Search**: global "Search gigs or talent" bar is decorative on every screen; needs a
   `/search` endpoint (Postgres FTS is fine initially).
8. **Trust & verification**: trust score, venue rating aggregation from reviews (wireframes
   p1/p4/p10 show ratings; no reviews model exists), ID verification vendor.
9. **`revalidateTag` no-op**: `publisher/open-next.config.ts` uses `tagCache: "dummy"` — if ISR
   tag invalidation is ever relied on, configure a real tag cache (or deploy to Vercel).
10. **Uploads pipeline hardening** — **P4 core DONE (2026-07-30)**: every image write path
    (profiles, settings avatar, message attachments, `/api/upload`) re-encodes via sharp
    (EXIF/GPS stripped, ≤1600px, webp) and stores to Vercel Blob when
    `BLOB_READ_WRITE_TOKEN` is set (processed inline data-URL fallback otherwise).
    **Remaining:** backfill pre-P4 base64 rows into object storage, tighten CSP `img-src`
    once a CDN origin exists, AV scanning on user uploads incl. PDF tech riders.
11. **Legacy dead code** — ✅ done (P0: `useUpload.ts`, `api/utils/upload.ts`,
    `useHandleStreamResponse.ts`, `api/vitest.config.ts`; P1 2026-07-30: off-spec talent
    create-gig page removed, sidebar nav updated).
12. ~~**DashboardSidebar** hardcoded identity/badges~~ — **DONE (2026-07-30, P3.4).**
    Identity from the session, Messages badge = real unread sum from `/api/conversations`,
    notification bell live; the old mock pages (messages/schedule/applicants) were replaced
    by their P3–P7 slices.
13. **Accessibility deep pass**: neon-on-dark contrast ratios, focus states on custom chips/
    toggles, calendar keyboard navigation (beyond the P7 axe smoke tests).
14. **Data warehouse/analytics**: venue KPIs (avg time-to-hire, filling rate) need event
    capture design; consider a simple `events` table now to avoid losing history.
15. ~~**Rate-limit store**~~ — superseded by #21, now **scheduled as P10.3** (it must land
    before the k6 Apdex gate is meaningful).
16. **iframe embedding posture**: cookies are `SameSite=None`; P0 set CSP `frame-ancestors` to
    `'self'` + configured create.xyz origins (no `X-Frame-Options`, superseded by CSP). Before
    GA, decide whether to keep the builder pathway or lock `frame-ancestors` to `'self'` only.
17. ~~**2FA → better-auth twoFactor plugin**~~ — **DONE (2026-07-30, second pass).** Exactly
    the slice scoped above: migration `0005`, plugin + client plugin, `/account/two-factor`
    challenge page, settings card rebuild, legacy route/utils removed,
    `AUTH_SECRET_ENCRYPTION_KEY` retired from the env contract. Sign-in now challenges
    enrolled users (TOTP or one-time backup code, optional 30-day trusted device; plugin
    lockout 10 fails/15 min). Browser-verified end-to-end; procedures in TESTING.md §5.
18. ~~**CSP nonce**~~ — **DONE (2026-07-30).** Per-request nonce + `'strict-dynamic'` emitted
    by `src/middleware.ts` (shared builder in `security-headers.js`); `'unsafe-inline'`
    dropped from script-src; static CSP removed from `next.config.js` (double-CSP would
    enforce the intersection). Cost accepted: root layout is `force-dynamic` — nonces can't
    live in prerendered HTML. Revisit if CWV budgets suffer (TENANT_GUARDRAIL §3).
19. ~~**Error tracking**~~ — **DONE (2026-07-30).** `@sentry/nextjs` via `instrumentation.ts`
    / `instrumentation-client.ts`; disabled without a DSN; every event passes
    `src/lib/sentry-scrub.ts` (reuses `redactPii`; identity reduced to user id; cookies/
    headers dropped). Ingest origin auto-added to CSP connect-src. Set `SENTRY_DSN` +
    `NEXT_PUBLIC_SENTRY_DSN` in Vercel to activate.
20. ~~**oxlint in CI**~~ — **DONE (2026-07-30).** `yarn lint` in web (oxlint, deny-warnings,
    workspace config) + CI step; pre-existing warnings fixed.
21. **Shared rate-limit store** (was #15's concern) — **scheduled as P10.3.** The in-memory
    `SlidingWindowRateLimiter` is per-instance; back `getRateLimiter` with Upstash Redis or a
    Postgres token-bucket before the load test, or the Apdex/429 numbers measure nothing.
22. ~~**Auth on Vercel preview deployments**~~ — **DONE (2026-07-27).** `src/lib/
    deployment-origins.ts` derives this deployment's own origins from `VERCEL_URL`,
    `VERCEL_BRANCH_URL` and `VERCEL_PROJECT_PRODUCTION_URL`, and `auth.ts` spreads them into
    `trustedOrigins` (additive one-liner, as planned). Deliberately no `*.vercel.app`
    wildcard — that would trust every app on the platform. Covered by
    `src/lib/__tests__/deployment-origins.test.ts`. Requires Vercel's "Automatically expose
    System Environment Variables" (on by default).
23. **Scope Vercel installs to the web workspace**: because the workspace root is shared, every
    web deploy also installs the Expo/React Native mobile app (all 10 yarn patches are
    mobile-only). A `vercel.json` `installCommand` using `yarn workspaces focus web` would cut
    install time/size — verify on a preview before adopting, since a bad install command fails
    the whole deploy.
24. **Repo structure**: the `anything/` wrapper is a create.xyz export artifact. A rename is
    cheap (~16 path references across the 3 docs + CI); a full flatten to the repo root would
    remove the need for Vercel's Root Directory setting but forces the mobile-vs-PWA decision
    in #4 — revisit after P7 when that decision is actually made.
25. **RLS activation** — **verified 2026-07-30, production cutover carried.** Policies
    (`0004`) and least-privilege GRANTs (`0006`) ship, and `yarn db:verify-rls` proves they
    enforce against a real non-owner role (10/10: drafts invisible by direct id, cross-tenant
    UPDATE affects 0 rows, `audit_logs` immutable, no DDL). **Remaining:** create the role on
    production, wire `withRlsContext` into the five routes that read/write RLS-governed tables,
    then flip `DATABASE_URL` — in that order, because the driver is stateless per query and an
    unwired cutover silently hides a venue's own drafts. Full runbook:
    [`docs/rls-cutover.md`](docs/rls-cutover.md).
26. **Legal copy needs counsel review.** The privacy policy and ToS shipped in P2 describe
    what the code actually does and satisfy G1 for alpha, but have not been reviewed by a
    lawyer. Required before general availability, along with executed DPAs (G10) and a DPIA
    (G13). Tracked in `docs/ropa.md` §5.
27. **Multi-value browse filters**: `GET /api/gigs`/`/api/talent` accept a single
    neighborhood/role; the UI's multi-select refines client-side within the fetched page
    (fine at alpha volumes). Add array params + `= ANY($n)` when gig volume makes it matter.
28. **Availability boost in browse ordering** (P6 remainder): `available_tonight` and open
    slots should float matching talent/gigs higher in the browse lists; needs an index-backed
    ORDER BY tweak in `gigs-query.ts`/`talent-query.ts` once ranking rules are decided.
