# DEV_TIMELINE — AfterDark

> Living status document. **Update the "Current status" block and phase checkboxes whenever a
> slice lands.** Companion to [CLAUDE.md](CLAUDE.md) (architecture & audit) and
> [TENANT_GUARDRAIL.md](TENANT_GUARDRAIL.md) (compliance & performance gates).

---

## 1. Current status — YOU ARE HERE

- **Date:** 2026-07-30 · **Branch:** `claude/p1-gigs-live` (worktree off `main`)
- **Project stage:** **P1 (gigs live end-to-end) landed + most P0 follow-ups. Next is P2
  (applications).**
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
    Active-Gigs/Filling-Rate stats (payout/time-to-hire stats honestly muted until P5/P2).
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
1. P2.1 — `applications` slice: migration (`applications` table + unique (gig_id, talent_id)),
   `POST /api/gigs/[id]/apply` (talent-only, proposed rate + cover message), wire the detail
   page's apply panel (estimator already live; flip the disabled submit).
2. P2.2 — Venue applicant review: `GET /api/venue/applications` + shortlist/hire transitions
   (audited); make the dashboard Applicants column + `dashboard/venue/applicants` real.
3. P2.3 — Talent "My Applications" (`dashboard/talent/applicants`) real; application status
   chips on browse/detail ("✓ Applied").
4. P2.4 — In-app `notifications` table + bell dropdown; real sidebar badge counts
   (application received / status changed) — finishes Backlog #12.
5. Carry-over: better-auth twoFactor plugin migration (Backlog #17 — do it as its own slice
   with a sign-in challenge page); oxlint in CI (Backlog #20); RLS activation ops step
   (dedicated non-owner DB role — 0004 policies are already in place).

---

## 2. Phase plan to alpha

Estimates assume one focused developer (human or AI-assisted); slices are independently
shippable behind the previous one. Acceptance for every slice additionally includes the
guardrail gates: unit+integration tests green, authZ/tenant-isolation tests for new endpoints,
Lighthouse budgets green, no new ZAP high/medium (TENANT_GUARDRAIL §7 checklist).

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
  arrives with P2 applications)
- ☑ Gig lifecycle statuses (DRAFT→PUBLISHED→FILLED→COMPLETED/CANCELLED) + venue Open Gigs table real
- ☑ Landing "Featured Tonight" reads real published-tonight gigs
- ☑ Bonus from task-5 carry-overs: nonce CSP, Sentry w/ PII scrub, dormant RLS policies
  (twoFactor plugin migration → Backlog #17)

### P2 — Applications (≈1 wk) — ☐ not started
- ☐ `applications` table/API; apply panel w/ proposed rate + cover message + 5% fee net estimator
- ☐ Venue applicant review (shortlist/hire) real; talent "My Applications" real
- ☐ In-app `notifications` (application received / status changed); sidebar badges real

### P3 — Messaging & negotiation (≈1–1.5 wk) — ☐ not started
- ☐ `conversations` + `messages` (polling or SSE); two-pane UI wired; unread counts
- ☐ Rate-proposal message kind + "Propose Final Rate" flow; gig-in-focus sidebar
- ☐ Attachments via object storage presign (replaces base64 pattern); Report Conversation → `reports`

### P4 — Availability & scheduling (≈0.5–1 wk) — ☐ not started
- ☐ `availabilities` CRUD + calendar wiring (3 slots/day per PRD); Available Tonight flag
- ☐ Conflict warnings vs booked shifts; profile boost surfacing in browse ordering

### P5 — Live ops & payments (≈1.5–2 wk) — ☐ not started
- ☐ `shifts` model; check-in/check-out endpoints (idempotent, audited) + venue Active Operations
  & talent Check In real
- ☐ Stripe Connect Express onboarding (test mode); destination charges w/ 5% application fee;
  escrow release 24h after checkout; `payouts` ledger; webhook signature verification
- ☐ Venue "Payouts Pending" metric real

### P6 — Admin & trust (≈1 wk) — ☐ not started
- ☐ Admin gating (role granted via DB/console only); moderation dashboard: reports triage,
  user & gig management table (suspend/verify), audit-log viewer + CSV export
- ☐ KPI cards (users, disputes, traffic) from real aggregates

### P7 — PWA & alpha polish (≈1 wk) — ☐ not started
- ☐ `manifest.webmanifest` (name AfterDark, standalone, theme `#121212`, maskable icons)
- ☐ Service worker via Serwist: precache shell/static, network-first APIs, offline fallback page
- ☐ Installability + Lighthouse PWA pass; CWV budgets in CI; Apdex k6 gate (TENANT_GUARDRAIL §3)
- ☐ GDPR user-facing surface: privacy policy, ToS, contact, account export & delete (see §5
  TENANT_GUARDRAIL §4 — legally required before real users, even alpha testers)

**Alpha exit gate:** full loop demo (venue posts → talent applies → negotiation → hire →
check-in/out → sandbox payout → admin audit trail) on the deployed PWA, with TENANT_GUARDRAIL
§7 checklist signed off. Rough total: **7–9 focused weeks.**

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
10. **Uploads pipeline hardening**: image resizing/thumbnailing, EXIF-strip (GPS metadata =
    PII), AV scanning on user uploads incl. PDF tech riders.
11. **Legacy dead code** — ✅ done (P0: `useUpload.ts`, `api/utils/upload.ts`,
    `useHandleStreamResponse.ts`, `api/vitest.config.ts`; P1 2026-07-30: off-spec talent
    create-gig page removed, sidebar nav updated).
12. **DashboardSidebar** hardcoded identity/badges — **partially done 2026-07-30**: identity
    now comes from the session, hardcoded unread badges removed. Remaining: real badge
    counts once notifications land (P2.4), venue-name (vs user-name) display, other demo
    strings in mock-data pages (messages/schedule/applicants — replaced by their slices).
13. **Accessibility deep pass**: neon-on-dark contrast ratios, focus states on custom chips/
    toggles, calendar keyboard navigation (beyond the P7 axe smoke tests).
14. **Data warehouse/analytics**: venue KPIs (avg time-to-hire, filling rate) need event
    capture design; consider a simple `events` table now to avoid losing history.
15. **Rate-limit store**: P0 rate limiting can be in-memory per-lambda; multi-region scale
    needs a shared store (Upstash Redis or Postgres-based) — revisit at load-test time.
16. **iframe embedding posture**: cookies are `SameSite=None`; P0 set CSP `frame-ancestors` to
    `'self'` + configured create.xyz origins (no `X-Frame-Options`, superseded by CSP). Before
    GA, decide whether to keep the builder pathway or lock `frame-ancestors` to `'self'` only.
17. **2FA → better-auth twoFactor plugin** — **deliberately deferred again 2026-07-30** after
    scoping. Why: it is a full slice, not a config tweak — the plugin needs its own schema
    (`twoFactor` table + `user.twoFactorEnabled`), a sign-in challenge page (today's
    hand-rolled 2FA is a settings control and **does not gate sign-in at all** — the plugin
    version will, which is the real win alongside recovery codes), a rewrite of the settings
    2FA card, changes to the DO-NOT-REWRITE `auth.ts` beyond its "config tuning" safe list,
    and it obsoletes `SecretBox`/`AUTH_SECRET_ENCRYPTION_KEY` (env-contract change across
    three docs). Existing enrollees are unaffected either way (different columns; old 2FA
    never gated sign-in). Do it as its own verified slice — see Pick-up-here item 5.
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
20. **oxlint in CI**: repo has `.oxlintrc.json` but CI doesn't run it yet; add a lint job.
21. **Shared rate-limit store** (was #15's concern): the in-memory `SlidingWindowRateLimiter` is
    per-instance. For multi-region/serverless fan-out, back `getRateLimiter` with Upstash Redis
    or a Postgres token-bucket at load-test time.
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
25. **RLS activation** (policies shipped dormant 2026-07-30 in `0004_rls.sql`): create a
    dedicated **non-owner** Postgres role on Neon, GRANT it table access, point
    `DATABASE_URL` at it, and route tenant-table queries through
    `api/utils/rls.ts#withRlsContext`. Until then the policies are inert (owners bypass
    non-forced RLS). Verify per TESTING.md §7. Pair with the shared rate-limit store (#21)
    as pre-load-test hardening.
26. **Multi-value browse filters**: `GET /api/gigs`/`/api/talent` accept a single
    neighborhood/role; the UI's multi-select refines client-side within the fetched page
    (fine at alpha volumes). Add array params + `= ANY($n)` when gig volume makes it matter.
