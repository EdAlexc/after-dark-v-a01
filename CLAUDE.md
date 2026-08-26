# CLAUDE.md — AfterDark

> Guidance for humans and AI developers working in this repository.
> Read this first, then [DEV_TIMELINE.MD](DEV_TIMELINE.MD) for current status and next tasks,
> and [TENANT_GUARDRAIL.md](TENANT_GUARDRAIL.md) before shipping anything user-facing.

**AfterDark** is a premium marketplace connecting NYC nightlife venues (clubs, lounges, bars)
with nightlife talent (DJs, mixologists, security, promoters, stage managers). It manages the full
gig lifecycle: post → discover → apply → negotiate → schedule → live check-in/out → guaranteed
payout via Stripe Connect. Target: a **progressive web app (PWA)**, desktop & mobile responsive,
with high multi-user/multi-tenant concurrency and PII/transactional data protection.

---

## 1. Repository map

| Path | What it is |
|---|---|
| `AfterDark_PRD.md` | Product Requirements Document v1.0 (personas, screens, DB schema draft, design notes) |
| `AfterDark-UI-wireframe.pdf` | 10-page hi-fi wireframe (Visily). Page inventory in §5.2 below |
| `AfterDark-ux-workflow.jpg` | Screen-flow diagram: deep-link navigation between all 10 screens |
| `anything/` | create.xyz ("Anything") export — Yarn 4 workspace monorepo containing the app |
| `anything/apps/web/` | **The product**: Next.js 16 (App Router) + React 19 web app |
| `anything/apps/mobile/` | Expo 54 / RN 0.81 scaffold — **generic, unbuilt** (renders `null`, still named "Anything mobile app") |
| `anything/publisher/` | Deploy tooling: `@opennextjs/aws` build for AWS Lambda + S3 |
| `CLAUDE.md` / `DEV_TIMELINE.MD` / `TENANT_GUARDRAIL.md` | This audit & planning set (2026-07-24) |
| `TESTING.md` | Verification playbook: automated suites, manual E2E checklists, security probes, shared preview accounts (2026-07-30) |
| `docs/ropa.md` · `docs/retention.md` | GDPR Art. 30 record of processing + retention schedule (P2; keep in sync with `/legal/privacy`) |
| `docs/incident-runbook.md` | G9 breach/incident runbook: 72 h drill, contact tree, tabletop log (2026-07-31) |
| `docs/mobile-decision.md` · `docs/id-verification.md` | S11 mobile ADR (PWA-first, Expo deferred; #24 flatten plan) · S8 ID-verification vendor ADR |
| `docs/rls-cutover.md` | Runbook for switching the app to the least-privilege DB role (P2.4 remainder) |

## 2. Commands & environment

```bash
cd anything                 # Yarn 4.12 workspaces (node-modules linker)
yarn install
cd apps/web
yarn dev                    # Next.js dev server on port 4000
yarn build                  # production build (strict — ignoreBuildErrors removed in P0)
yarn typecheck              # tsc --noEmit
yarn lint                   # oxlint (workspace .oxlintrc.json), warnings fail
yarn test                   # vitest run (1142 tests as of S20)
yarn test:e2e               # Playwright E2E journeys (S16/S18/S19/S20, 21 tests) — needs a running
                            #   production build + seeded DB (TESTING.md §3); CI Gate 1b
yarn db:migrate             # apply migrations/*.sql (forward-only runner; --dry-run supported)
yarn db:grants              # (re)apply scripts/grants.sql to the afterdark_app role (owner conn; S2)
yarn db:seed                # demo venue+talent+gigs (dev/local only; refuses prod)
yarn db:preview-accounts    # shared preview accounts; passwords derived from PREVIEW_ACCOUNTS_SECRET (S1)
yarn db:verify-rls          # proves RLS isolation against a non-owner role (never run on prod; 28 checks — CI runs it per-PR since S12)
yarn db:backfill-media      # move inline data: images into Blob; --verify asserts zero remain (S3)
yarn pwa:icons              # regenerate public/icons/* deterministically from vector art (P10.1)
yarn gate:axe               # P10.4 axe smoke: 10 screens, fail on critical (needs running server)
yarn gate:lhci              # P10.4 Lighthouse §3.2 budgets, 3 passes (needs running server)
# k6 run k6/alpha-gates.js  # P10.4 Apdex smoke (k6 binary; CI runs it via setup-k6-action)
```

- **Required env**: `DATABASE_URL` (Neon Postgres) and `BETTER_AUTH_SECRET` (signs sessions
  **and encrypts 2FA enrollments** — rotating it invalidates them; `openssl rand -base64 32`).
  `AUTH_SECRET_ENCRYPTION_KEY` is obsolete since migration 0005 (harmless if set). Optional:
  `BETTER_AUTH_URL`, `CREATE_BUILDER_EMBED` (S1 — builder iframe + SameSite=None are
  opt-in now, off by default), `RATE_LIMIT_STORE` (S1 — rate-limiter backend override),
  `PREVIEW_ACCOUNTS_SECRET` (S1 — preview passwords derive from it, never committed),
  `RESEND_API_KEY`+`EMAIL_FROM` (S13 — password-reset + verification emails; with both
  set, email verification is ENFORCED for new signups; unset = whole email surface
  no-ops loudly), `GOOGLE_CLIENT_ID/SECRET`, `APPLE_CLIENT_ID/SECRET/APP_BUNDLE_IDENTIFIER`,
  `EXPO_PUBLIC_PROXY_BASE_URL`, `NEXT_PUBLIC_CREATE_*`, `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`
  (error tracking — no-op unset), `WEB_PUSH_VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`
  (S9 — hot-gig Web Push; whole surface inert without the pair),
  `STREAM_MAX_MS`/`STREAM_TICK_MS` (S9 — SSE window/tick tuning), `TELEMETRY_SAMPLE`
  (S18 — api_timings sampling 0..1, default 1), `SENTRY_AUTH_TOKEN`+`SENTRY_ORG`+
  `SENTRY_PROJECT` (S18 — build-time source-map upload; unkeyed builds skip the wrapper).
  See `apps/web/.env.example`; no real `.env` is committed.
- **Migrations live in `apps/web/migrations/`** (P0). `0001_baseline.sql` reproduces §6.1;
  `0002_audit_logs.sql` adds the audit trail; `0003_gig_lifecycle.sql` widens gig status to
  the full lifecycle (P1); `0004_rls.sql` ships RLS policies (verified enforcing — see
  `yarn db:verify-rls` — but inert until the connection role changes, Backlog #25);
  `0005_two_factor_plugin.sql` adds the better-auth twoFactor schema; `0006_compliance_spine.sql`
  adds age gating + least-privilege GRANTs (P2); `0007`–`0012` add the P3–P9 marketplace
  tables with their RLS policies in-file; `0013_shared_rate_limits.sql` adds the S1 shared
  rate-limit stores; `0014_rls_completion.sql` adds the S2 cutover policy set (SERVICE/ADMIN
  platform context, gig read carve-outs, messages per-command policies, `legal_holds`). The
  `0022_telemetry.sql` adds the S18 RUM/timing stores (SERVICE-only writes, 30-day purge);
  `0023_venue_directory.sql` adds the S19 venue FTS + directory indexes;
  `0024_discovery_dashboard.sql` adds the S20 `saved_talent` bookmarks (RLS in-file) +
  the D3 response-rate SECURITY DEFINER aggregate. The
  runner records applied files in `_migrations`; because it is forward-only, role GRANTs are
  re-asserted via `yarn db:grants` (`scripts/grants.sql` is the living set). ⚠ Applying
  migrations to the production DB is a **manual operator step** — drift took auth down on
  2026-08-22 (DEV_TIMELINE §1); after any merge that adds a migration, run
  `yarn db:migrate` against prod (or check `--dry-run` says "No pending").
- Web tests: Vitest (`vitest.config.mts`). Shared logic + every route has an edge-case suite
  under `__tests__/`. `yarn test` is wired and gated in CI (`.github/workflows/ci.yml`).
- Platform files marked `DO NOT REWRITE` (`src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`)
  are create.xyz integration points — extend via config, don't rewrite. (P0 added only an
  additive `rateLimit` config block to `auth.ts`, which the header explicitly permits.)
- **Shared API utilities** (`src/app/api/utils/`, reuse these — don't re-roll): `route-kit`
  (`withRoute` + `ApiError`), `auth-guard` (`authGuard.requireRole`), `validation`
  (`parseBody`/`parseQuery`) + `schemas`, `rate-limit`, `crypto-box` (`SecretBox`), `totp`,
  `audit` (`auditLogger`), `logger`, `sql-builder`, `gigs-query`, `profile-completion`.
  `src/lib/safe-redirect.ts` guards all `callbackUrl` handling.

### 2.1 Deployment (Vercel)

The app is **not** at the repository root — the repo root has no `package.json` at all. Vercel
resolves framework detection, install, build, and the expected `.next` output location all
relative to the Root Directory, so it must be pointed at the app:

| Vercel setting | Value | Why |
|---|---|---|
| **Root Directory** | `anything/apps/web` | The Next.js app lives 3 levels down. Left at the repo root, Vercel detects no framework, builds nothing, and every path returns the platform `404: NOT_FOUND`. Not settable from `vercel.json` — dashboard only. |
| **Include files outside the Root Directory** | enabled | The Yarn workspace root is `anything/` (above the root dir): `yarn.lock`, `.yarnrc.yml`, and the 10 committed `.yarn/patches/*.patch` all live there. |
| **Node version** | 22 | Next 16. |

**Yarn version — solved by a committed release, not by Corepack.** Vercel's build image ships
Yarn 1.22.x, which cannot install this workspace: it rejects the Berry `patch:` resolutions (all
10 patches use them), can't read the v4 lockfile, and fails outright with
`error Workspaces can only be enabled in private projects.` Vercel's
`ENABLE_EXPERIMENTAL_COREPACK=1` flag is *supposed* to make it honor
`packageManager: yarn@4.12.0`, but it did not take on this project. The durable fix is
`.yarn/releases/yarn-4.12.0.cjs` + `yarnPath` in `.yarnrc.yml`: Yarn 1.22 honors `yarnPath` and
hands off to that binary, so builds no longer depend on any Vercel flag and local/CI/Vercel all
run a byte-identical Yarn. The workspace root also carries `"private": true` (required by Yarn 1
for workspaces; correct hygiene regardless).

To bump Yarn later, run `yarn set version <version> --yarn-path` from `anything/` and commit the
new release. Plain `yarn set version` is a **no-op** here — Yarn 4 defers to Corepack and only
rewrites `packageManager` without downloading a binary.

**Diagnosing a 404 on a deployment:** if you get the *white Vercel platform* 404 page
(`404: NOT_FOUND` + a `Code`/`ID` box), the request never reached Next.js. A genuine app-level
miss renders the dark AfterDark 404 from `src/app/not-found.tsx` instead. That distinction tells
you which side of the boundary to debug.

> **A "successful" deploy that 404s on every path is the Root Directory symptom.** With Root
> Directory left at the repo root, Vercel finds no `package.json`, detects no framework, and
> falls back to serving the repo as static files — the build *succeeds*, uploads nothing
> runnable, and every path (including `/`) returns the platform 404. Confirm it in the
> deployment's **Build Logs**: a correct build prints the Next.js route table (`Route (app)`,
> `┌ ƒ /`, ~36 routes — all `ƒ` dynamic since the P1 nonce-CSP change). If the log is a few
> lines with no route table, the Root Directory is wrong. **This cannot be fixed from the repo** — `vercel.json` has no `rootDirectory`
> property (see the property table in Vercel's Project Configuration docs); it is Project
> Settings → Build & Deployment → Root Directory, or `vercel link --repo` from the CLI.

**Env vars to set in Vercel** (Production + Preview): `DATABASE_URL` (Neon **pooled** string),
`BETTER_AUTH_SECRET` (⚠ also encrypts 2FA enrollments — rotate and they reset),
`BETTER_AUTH_URL`. (`AUTH_SECRET_ENCRYPTION_KEY` is obsolete since migration 0005; leaving it
set is harmless.) The build itself passes
without them (every page is `'use client'`, so nothing touches the DB at build time), but the
running app will not.

**Auth on preview deployments** works without per-preview config: `src/lib/deployment-origins.ts`
reads Vercel's `VERCEL_URL`, `VERCEL_BRANCH_URL` and `VERCEL_PROJECT_PRODUCTION_URL` at runtime
and `auth.ts` appends them to `trustedOrigins`, so each preview trusts its own generated
hostname instead of failing better-auth's CSRF check with "Invalid origin". This relies on
Vercel's **Automatically expose System Environment Variables** setting (on by default) — if
sign-in on a preview starts returning "Invalid origin", check that first. There is intentionally
no `*.vercel.app` wildcard, which would trust every app on the platform.

Note the mobile workspace (`anything/apps/mobile`) is installed on every web deploy because it
shares the workspace root — see Technical Backlog #23 to scope installs to `web`.

## 3. Tech stack (as found)

- **Frontend**: Next.js 16 App Router, React 19, all pages `'use client'`; Tailwind v4,
  shadcn/ui (new-york) + Radix + Base UI, `motion`, `recharts`, `lucide-react`, `sonner` toasts,
  `react-hook-form`, TanStack Query.
- **Backend**: Next.js route handlers; `@neondatabase/serverless` tagged-template SQL
  (`src/app/api/utils/sql.ts`); **better-auth** (email/password + Google/Apple + bearer plugin
  for mobile), sessions via `sameSite=None; Secure; HttpOnly` cookies (iframe-friendly).
- **Deploy**: **Vercel is the active target** (setup + gotchas in §2.1). `publisher/open-next.config.ts`
  → AWS Lambda + S3 remains as inherited create.xyz tooling (`tagCache: "dummy"` —
  `revalidateTag()` is a no-op); it is unused by the Vercel pipeline.
- **Security/observability layers added since the audit**: middleware (auth gate + per-request
  **nonce CSP** — the root layout is `force-dynamic` because prerendered HTML can't carry a
  nonce), RBAC guard, zod validation, **shared Postgres rate limiting** (S1 — holds across
  serverless instances; in-memory dev/test fallback), security headers with the S1 embed
  lockdown (`frame-ancestors 'self'`, cookies `SameSite=Lax` unless `CREATE_BUILDER_EMBED`)
  and the S3 `img-src` pin (Blob host only when the token is set), structured logging +
  audit trail, optional **Sentry** (PII-scrubbed, no-op without DSN), RLS policies **wired
  through `withRlsContext` on every governed route** (S2 — dormant until the operator flips
  `DATABASE_URL`, runbook in `docs/rls-cutover.md`), a daily legal-hold-aware **retention
  purge** (S2), migrations + tests (P0–P1, S1–S3).
- **PWA (P10.1–P10.2, 2026-07-31)**: `manifest.webmanifest` + maskable icons (regenerate via
  `yarn pwa:icons`); dependency-free `public/sw.js` (never intercepts `/api`, navigations
  network-only with `public/offline.html` fallback, `/_next/static` cache-first, purge on
  logout via `src/lib/pwa.ts`); CSP `worker-src 'self'`. Verification: TESTING.md §9.
- **Observability (S18)**: first-party RUM (`WebVitalsReporter` → `POST /api/rum` →
  `rum_events`), per-request route timings captured in `withRoute` → `api_timings`,
  per-endpoint Apdex at the §3 T=300 ms bar + traffic/vitals cards on the admin
  dashboard; both telemetry tables RLS-governed, SERVICE-write-only, purged at 30 days.
  `withSentryConfig` source maps key-gated on `SENTRY_AUTH_TOKEN`.
- **Absent**: Stripe keys (code shipped key-gated), WebSockets (SSE landed in S9;
  Web Push is key-gated on the `WEB_PUSH_VAPID_*` pair).

## 4. Spec-vs-code audit (feature matrix)

Status legend: ✅ implemented & wired to DB · 🟡 UI exists but **mock data only** · ❌ missing entirely.

| Feature (PRD §) | Wireframe | Code location | Status |
|---|---|---|---|
| Landing page (3.1) | p5 | `src/app/page.tsx` | ✅ Hot Gigs Tonight real (P1.4); legal footer real (P2.1); rest static marketing copy |
| Sign up / sign in / logout | — | `src/app/account/*` | ✅ better-auth, social self-activating; S13 adds forgot/reset-password pages + email verification (key-gated on `RESEND_API_KEY`) |
| Onboarding (role select + basics) | — | `src/app/onboarding/page.tsx` → `/api/user/role` | ✅ (but accepts `ADMIN` — see §7) |
| Browse gigs: filters, list (3.2) | p2 | `dashboard/talent/browse/page.tsx` | ✅ real `GET /api/gigs` (P1.1): validated filters, pagination, HOT/NEW badges; multi-select (S5) and text search (S17 `q`) server-side |
| Browse talent (venue directory) | — | `dashboard/venue/browse/page.tsx` | ✅ real public `GET /api/talent` (P1.1); saved talent server-persisted (`saved_talent`, S20) w/ per-card Contact → real thread; public `/talent/[id]` profiles (S20) |
| PARTY persona: signup→onboarding, venue discovery, private-party inquiries (§6.3) | p5 "Party People" | `/dashboard` root router, `/venues{,/[id]}` → `/api/venues{,/[id]}`, `dashboard/party/messages` | ✅ S19: role reachable end-to-end; public venue directory; `venue_id` inquiry resolved server-side; PARTY still never a principal (matrix invariant) |
| Browse gigs: map view (3.2) | p2 | `components/GigsMap.tsx` in browse | ✅ MapLibre + OSM tiles (S10); pins = server-geocoded PUBLISHED gigs; escaped popups → `/gigs/[id]` |
| Gig details + application + 5% fee estimator (3.2) | p4 | `gigs/[id]/page.tsx` → `/api/gigs/[id]` + `/apply` | ✅ detail + estimator (P1.2) + live apply/withdraw w/ proposed rate, ✓-Applied states, Inquire→thread (P3/P5); visible to applicants after FILLED; single-pin location map + neighborhood fallback + venue response rate (S20) |
| Availability calendar, 3 slots (3.2) | p7 | `dashboard/talent/schedule/page.tsx` → `/api/availability` | ✅ real month grid + 3-slot editor + notes + Available Tonight + shift-conflict dots (P6) |
| Talent dashboard: stats, applications, upcoming, check-in (3.2) | p8 | `dashboard/talent/page.tsx` | ✅ real earnings (payout ledger), applications, bookings w/ On-My-Way/Check-In/Out, Hot Tonight rail (P3/P7/P8) |
| Talent public profile editor (3.2) | p9 | `dashboard/talent/profile/page.tsx` → `/api/talent/profile` | ✅ real; media now EXIF-stripped/resized via P4 (Blob when keyed, processed-inline fallback) |
| Venue dashboard: metrics, open gigs, live ops (3.3) | p10 | `dashboard/venue/page.tsx` | ✅ Open Gigs w/ lifecycle + real applicant counts; **Active Operations** = real shifts w/ check-in/out; **Payouts Pending** from ledger; time-to-hire + filling-rate trends real from the S6 event capture (`/api/venue/stats`) |
| Create gig wizard (3.3) | p3 | `dashboard/venue/create-gig/page.tsx` → POST `/api/gigs` | ✅ persists; **Live Analysis real** (S7): `/api/gigs/match-preview` candidate counts × availability probe + pricing percentiles |
| Applicant tracking: shortlist/hire (3.3) | p10 | `dashboard/{talent,venue}/applicants/page.tsx` | ✅ real; Shortlist/Hire/Pass/Reconsider; hire = atomic app→HIRED + gig→FILLED + shift INSERT (P3) |
| Messages: 2-pane chat, attachments, propose-rate (3.4) | p6 | `components/MessagesView.tsx` | ✅ real threads (polling), RATE_PROPOSAL + accept-rate→application, image attachments (P4), gig-in-focus rail, report→`reports` (P5) |
| Live ops check-in/check-out (2.A/2.B) | p8, p10 | `/api/shifts/[id]` + dashboards | ✅ actor-scoped transitions, idempotency keys on a DB UNIQUE, checkout creates HELD payout (P7) |
| Payments: Stripe Connect escrow & payouts (1, 2) | p4, p10 | `/api/stripe/*`, `/api/payouts/release` | 🟡 **key-gated**: 5% ledger, 24h escrow release (cron), webhook sig+replay guard all real; transfers activate when Stripe keys are set (none yet) (P8) |
| Admin moderation: disputes, audit logs, verification (3.4) | p1 | `dashboard/admin` + `/api/admin/*` | ✅ triage, suspend/reinstate (AuthGuard-enforced platform-wide), takedowns, audit viewer + CSV, KPI cards (P9) |
| Reports/disputes (schema §4) | p1 | `/api/reports` + admin triage | ✅ report → triage → REVIEWING/CLOSED w/ notes; moderation reads audited (P9) |
| Notifications (bell/badges in every wireframe) | p1–p10 | `components/NotificationsBell.tsx` → `/api/notifications` | ✅ real bell + unread sidebar badges; emitted by applications/messages/shifts/payouts (P3.4); paged history page `/dashboard/notifications` + "View all" (S20) |
| Global search "gigs or talent" (top bar) | p1–p10 | `components/GlobalSearch.tsx` + `/search` | ✅ Postgres FTS `/api/search` (S5); mounted on landing nav, sidebar, mobile drawer; URL-addressable results page |
| Venue↔external calendar & ticketing integrations (2.B) | — | — | ❌ (post-alpha candidate) |
| Settings (profile, password, 2FA) | — | `dashboard/settings/*` + `/api/settings*` | ✅ real (2FA = better-auth twoFactor plugin since 0005) |
| Legal surface: privacy, ToS, contact (footer, GDPR G1) | p1–p10 footer | `src/app/legal/*`, `src/app/contact` | ✅ real routes, versioned via `lib/legal.ts` (P2.1) |
| Data export & account deletion (GDPR G4) | — | `dashboard/settings` → `/api/account/*` | ✅ self-serve, audited, audit-trail pseudonymized (P2.2) |
| Age gating 18+ / per-gig 21+ (GDPR G12) | p3 toggle | signup + `gigs.age_requirement` | ✅ attested at signup; 21+ badge on detail (P2.5) |
| PWA (installable, offline, service worker) | — | `public/manifest.webmanifest`, `public/sw.js`, `src/lib/pwa.ts` | ✅ installable + offline fallback + logout cache purge (P10.1–P10.2); push notifications remain post-alpha |
| Talent create-gig page | — | — | ✅ removed 2026-07-30 (was off-PRD; Backlog #11) |

**API inventory (real endpoints):** `/api/auth/[...all]`, `/api/auth/token`,
`/api/auth/expo-web-success`, `/api/session`, `/api/user/role` (GET/POST), `/api/gigs`
(GET public paginated, POST venue), `/api/gigs/[id]` (GET public-when-published +
applicant carve-out, PATCH owner status transition), **`/api/gigs/[id]/apply`** (POST
talent), **`/api/applications/[id]`** (PATCH shortlist/hire/reject/withdraw),
**`/api/talent/applications`**, **`/api/venue/applications`**, `/api/venue/gigs` (own gigs
+ applicant counts), `/api/talent` (public directory), **`/api/talent/shifts`**,
**`/api/venue/shifts`** (+ payouts-pending aggregate), **`/api/shifts/[id]`** (POST
idempotent transition), **`/api/conversations`** (GET/POST),
**`/api/conversations/[id]/messages`** (GET marks-read/POST),
**`/api/conversations/[id]/accept-rate`** (POST), **`/api/notifications`** (GET/POST
mark-read), **`/api/reports`** (POST), **`/api/availability`** (GET month/PUT day),
**`/api/upload`** (POST, P4 pipeline), **`/api/payouts/release`** (POST admin|cron, GET
cron), **`/api/retention/purge`** (POST admin|cron, GET cron — G7 purge, legal-hold aware),
**`/api/stripe/connect`** (GET status/POST onboard — 503 without keys),
**`/api/stripe/webhook`** (POST, signature + replay guard), **`/api/admin/overview`**,
**`/api/admin/reports`** (+`/[id]` GET detail w/ audited moderation reads, PATCH triage),
**`/api/admin/users`** (+`/[id]` PATCH suspend/unsuspend), **`/api/admin/gigs`** (+`/[id]`
PATCH takedown), **`/api/admin/audit-logs`** (JSON + audited CSV export), `/api/talent/profile`,
`/api/venue/profile`, `/api/settings`, `/api/settings/change-password`,
`/api/account/export`, `/api/account` (DELETE), `/api/account/age-confirm`,
`/api/auth/two-factor/*` (better-auth twoFactor plugin),
**`/api/search`** (GET public FTS, S5 — gigs+talent, +venues arm S19), **`/api/venue/stats`**
(GET venue KPI aggregates, S6), **`/api/gigs/match-preview`** (GET venue Live Analysis, S7),
**`/api/venues`** (GET public directory, S19), **`/api/venues/[id]`** (GET public detail, S19
+ S20 response rate), **`/api/talent/[id]`** (GET public talent profile, S20),
**`/api/venue/saved-talent`** (GET list/PUT idempotent save-unsave toggle, S20),
**`/api/geocode`** (GET venue-only create-gig map-preview probe, S20),
**`/api/reviews`** (GET public list/aggregate, POST shift-scoped review, S8),
**`/api/stream`** (GET SSE invalidation stream, S9), **`/api/rum`** (POST anonymous
first-party web-vitals beacon, S18 — strict-validated, rate-limited), **`/api/push/subscribe`**
(GET/POST/DELETE Web Push opt-in, S9 — 503 without VAPID keys),
`/api/__create/check-social-secrets` (dev only). Every route is declared in
`api/utils/authz-matrix.ts`; CI fails if one is missing.

## 5. UI / UX specification

### 5.1 Design system
- Dark theme by default: background `#121212`, cards `#1E1E1E`, neon cyan accent (`#00FFCC`
  family) for CTAs/active states; red/pink for HIGH-severity & urgent badges (PRD §5, wireframes).
- Layout: fixed top bar (logo, global search, Browse/Dashboard nav, messages + notifications
  icons with unread dots, avatar) + role-modular left sidebar (`DashboardSidebar.tsx` already
  takes `role: 'talent' | 'venue'`; needs an `admin` variant, real user identity, real badge counts).
- Core reusable components per PRD §5: Sidebar Navigation, Data Table (admin + venue), Gig Card,
  Chat Interface. shadcn/ui is installed — prefer composing these from it.
- Footer (all pages): For Talent / For Venues / Legal & Connect columns — Privacy Policy, Terms
  of Service, Contact Support must become real routes (GDPR requirement, see TENANT_GUARDRAIL §4).

### 5.2 Wireframe page inventory (`AfterDark-UI-wireframe.pdf`)
1. **Admin Moderation** — KPI cards (Stripe connection, active disputes, total users, traffic
   req/s), Reports Triage w/ severity chips + Review actions, live Audit Logs feed, User & Gig
   Management data table (tabs All/Talent/Venues/Flagged; trust score, status, suspend), System
   Maintenance shortcuts, Export Audit Log, Security Overview.
2. **Browse Gigs** — filter rail (Available Tonight toggle, neighborhoods, pay-range slider
   $20–$500+/hr, role-type chips, genres), List/Map toggle, gig cards (photo, HOT badge, rate,
   venue, distance, starts-at, Apply), night-map with pins + "Hot Gigs Tonight" overlay panel.
3. **Create New Gig** — 4-step wizard: Identity & Role → Logistics (start/end, address, map
   preview) → Compensation (base rate, payment type flat/hourly, cash-tips toggle) → Equipment
   & Attire (+ 21+ age-requirement toggle). Right rail: **Live Analysis** (matching candidate
   count + top candidates + pricing hint), Save as Draft, auto-saved state, Est. outreach,
   Preview Listing, Publish Gig Publicly.
4. **Gig Details & Application** — breadcrumb, Featured/Hot badges, fixed payout hero,
   about/bullets, Attire & Appearance + Equipment & Technical cards, satellite map + "Show
   Address Text", venue card (rating, gigs hosted, response rate), **application panel**:
   availability confirmation banner, proposed hourly rate, estimated total, cover message,
   Marketplace Fee (5%) → **Your Estimated Net**, Submit Application, Inquire about Gig,
   escrow "Safety First" note ("payments held in escrow via Stripe Connect, released 24h
   after gig completion"), "Viewing as: Talent / Venue Owner" toggle.
5. **Landing** — hero ("Your Next Night Out **Starts Here.**", Post a Gig / Browse Gigs CTAs,
   Stripe Payments & Recharged Talent trust chips), **Featured Tonight** carousel (Tonight
   badges, rate + start time, View Details), **Fastest Path from Post to Payout** 3-step diagram
   (Post Your Gig → Hire Top Talent → Automatic Payment), **The Roles We Power** (Talent /
   Venues / Party People columns with Join CTAs), full-width cyan **READY TO OWN THE NIGHT?**
   CTA band, footer.
6. **Messages** — 3-pane: conversation list w/ unread counts & search; thread with system
   headers ("Conversation started regarding …"), attachment share (PDF tech rider), inline
   **rate proposal event** ("Marcus Chen proposed a rate of $500.00"), quick-action chips
   (Propose Rate / Share Setlist / Check Availability), compose w/ attach; right rail **Gig in
   Focus** card (status badge, date/time, budget range, View Full Listing) + venue summary +
   **Propose Final Rate** CTA + Report Conversation. Trust footer: "All communications and
   payments are secured via AfterDark platform."
7. **Availability Management** — month calendar w/ per-day states (Available / Booked w/ venue
   chip + time, Blocked, Conflict warning), **Available Tonight** boost toggle, month nav,
   **Sync Calendar**, right-rail Slot Editor per date: three time-slot checkboxes — Early
   Evening 6–10PM, Prime Time 10PM–2AM, After Hours 2–6AM — internal notes, Save; "changes
   synced instantly with your profile".
8. **Talent Dashboard** — welcome header w/ week summary + profile-view count, 24/7 concierge
   Contact Support card, **Available Tonight?** alert toggle w/ visibility note, stat cards
   (Active Apps, Upcoming Gigs, Total Earnings +% vs last month), Hot Gigs Tonight rail
   (HOT/Urgent cards), profile card (roles/genre chips, **Profile Completion %** w/ hint,
   Edit Profile, Availability), **Upcoming Bookings** (status dot, CHECK-IN OPEN → **Check In**
   button, Details), **My Applications** (Shortlisted/Pending chips), Manage All / View All.
9. **Public Profile Editor ("Craft Your Identity")** — Media Gallery (primary headshot + up to
   4 portfolio shots), The Basics (stage name, pronouns, home-base neighborhood, 500-char bio),
   Professional Specifications (primary-role chips, Vibes & Genres tags + add, hourly-rate
   range slider $/hr entry↔premium), Digital Presence (Instagram, TikTok, SoundCloud, website),
   Available Tonight toggle, "All changes saved locally" state, Preview Profile, Save Changes.
10. **Venue Dashboard** — header ("Manage your nightlife operations for {venue}"), Post New Gig
    CTA, KPI cards (**Payouts Pending** $ + due count, **Avg Time to Hire**, **Filling Rate**
    x of y gigs, Venue Rating), **Open Gigs** table (applicant counts, Urgent/Active status,
    drill-in) with **Applicants** side panel (candidate cards w/ rating, Shortlist / **Hire**),
    **Active Operations — Live Tonight** table (talent, role, call time, status Checked In /
    In Transit / Scheduled, shift pay, **Check-in / Checkout** controls per row).

### 5.3 UX workflow (`AfterDark-ux-workflow.jpg`)
Dense bidirectional deep-linking between all screens. Requirements it implies:
- Every gig card (landing, browse, dashboards, messages sidebar) links to Gig Details;
  Gig Details ↔ Messages (Inquire/negotiate) ↔ Talent Profile; Venue applicants → Talent
  profile → Messages; Create Gig → publishes into Browse + dashboards; Admin reaches all
  surfaces for moderation. Deep linking must survive refresh (URL-addressable state,
  e.g. `/gigs/[id]`, `/messages/[conversationId]`) — PRD §5 "Routing Architecture".
- PRD core flows to preserve: Talent: Landing → Sign Up → Profile & Availability → Browse →
  Gig Details → Apply w/ proposed rate → Negotiate in Messages → Dashboard → Check-in/out →
  Get paid. Venue: Landing → Sign Up → Profile (+ext. calendar/ticketing) → Dashboard →
  Create Gig → Review applicants → Shortlist/Hire → Negotiate → Live ops check-in/out.
  Payment directions: Venue/Promoter→Talent, Venue→Promoter, Promoter→Venue.
  Admin: Dashboard → Audit logs → Disputes → Verification.

## 6. Data architecture

### 6.1 Current (inferred from raw SQL — no migrations exist)
- better-auth managed: `user` (+custom columns `role`, `recovery_email`, `phone`,
  `social_links`, `totp_enabled`, `totp_secret`, `image`), `session`, `account`, `verification`.
- `talent_profiles` (stage_name, pronouns, neighborhood, bio, primary_role, genres_vibes json,
  hourly_rate_min/max, social_links json, avatar_url, portfolio_images json,
  profile_completion_pct, timestamps).
- `venue_profiles` (venue_name, neighborhood, address, description, venue_type, capacity,
  music_genres json, operating_hours json, avatar_url, gallery_images json, social_links json,
  rating, timestamps).
- `gigs` (venue_id, title, role_needed, description, start_time, end_time, base_rate,
  tips_included, status DRAFT|PUBLISHED, created_at).

### 6.2 Target alpha schema (PRD §4 + wireframe deltas)
Add, via a migration tool (recommend **drizzle-kit** or plain SQL migrations checked into
`anything/apps/web/migrations/`):
- `applications` (gig_id, talent_id, proposed_rate, cover_message, status
  PENDING|SHORTLISTED|HIRED|REJECTED, created_at) + unique (gig_id, talent_id).
- `conversations` (gig_id, venue_user_id, talent_user_id) and `messages` (conversation_id,
  sender_id, content, attachment_url, kind TEXT|RATE_PROPOSAL|SYSTEM, rate_amount, created_at,
  read_at). Rate proposals are first-class message kinds (wireframe p6).
- `availabilities` (talent_id, date, time_slot EARLY_EVENING|PRIME_TIME|AFTER_HOURS, status
  AVAILABLE|BOOKED|BLOCKED, notes) + unique (talent_id, date, time_slot).
- `shifts` / live ops (gig_id, talent_id, call_time, check_in_at, check_out_at, shift_pay,
  status SCHEDULED|IN_TRANSIT|CHECKED_IN|CHECKED_OUT|PAID) — powers p8 Check In & p10 Active
  Operations; state transitions must be idempotent & audited.
- `payouts` / `transactions` (shift_id or application_id, payer/payee user ids, gross, fee_pct
  = 5%, fee_amount, net, stripe_transfer_id, status PENDING|HELD|RELEASED|FAILED, timestamps)
  — ledger rows are append-only; money math in integer cents.
- `reports` (reporter_id, reported_entity_type+id, reason, severity LOW|MEDIUM|HIGH, status
  OPEN|REVIEWING|CLOSED) and `audit_logs` (actor_id, action, entity_type+id, metadata jsonb,
  created_at) — PRD admin views; audit_logs also serve GDPR/OWASP A09.
- `notifications` (user_id, kind, payload jsonb, read_at, created_at).
- Extend `gigs`: status enum to DRAFT|PUBLISHED|FILLED|COMPLETED|CANCELLED (PRD), plus
  neighborhood, attire, equipment_provided/required, age_requirement, payment_type
  FLAT|HOURLY, lat/lng for the map, is_featured/hot flags.

### 6.3 Multi-tenancy & concurrency model
- Tenant = venue (venue org owns gigs, applicants, ops data); talent are cross-tenant actors;
  every query MUST be scoped by the session user's profile id server-side — never trust client
  ids (current `/api/gigs` POST correctly derives venue from session; keep that pattern).
- **Party People** are a third actor type (landing "Roles We Power", wireframe p5): consumers,
  not marketplace principals. Their **sole** capability is **read-only discovery** — search and
  browse public events/parties and browse venues to book for private parties. They never post
  gigs, apply, negotiate rates, or touch the payout/live-ops surfaces. Model as `role = PARTY`
  (extend the `TALENT|VENUE|ADMIN` enum) with a minimal `party_profiles` row (or just the
  `user` record) and a public-content-only authZ scope — deny-by-default on everything in the
  gig/application/message/shift/payout tables; a private-party inquiry to a venue routes through
  the same conversations model (P5) but flagged as a consumer inquiry, not a gig application.
  Add PARTY to the TENANT_GUARDRAIL §6.1 authZ matrix (public reads ✅, all principal writes ❌).
- Recommended defense-in-depth: Postgres **RLS** policies per table keyed on
  `current_setting('app.user_id')`, plus application-level checks. Verification procedures in
  TENANT_GUARDRAIL §6.
- Neon serverless: use pooled connection string for route handlers; keep transactions short;
  hot paths (browse, messages poll) need indexes: `gigs(status, start_time)`,
  `gigs(neighborhood)`, `applications(gig_id, status)`, `messages(conversation_id, created_at)`.
- Real-time for alpha: **polling via TanStack Query (5–10s) or SSE** for messages/live-ops;
  defer WebSockets until post-alpha (serverless-friendly).
- Uploads: replace base64-in-DB with S3/R2 presigned uploads + CDN, store URLs + run
  size/MIME validation server-side (`useUpload.ts` dead code can be revived against a new
  `/api/upload` presign route).

## 7. Security posture (found → required)

Verified findings (2026-07-24), ordered by severity — full remediation & test procedures in
[TENANT_GUARDRAIL.md](TENANT_GUARDRAIL.md):

1. **Privilege escalation**: `POST /api/user/role` accepts `ADMIN` from any signed-in user
   (`anything/apps/web/src/app/api/user/role/route.ts:23`). Restrict to `TALENT|VENUE`; admin
   is granted out-of-band only. *(Fixed in P0; P9 added the admin surface itself — every
   `/api/admin/*` route is ADMIN-only in the matrix, all writes audited, and account
   suspension is enforced centrally in AuthGuard.)*
2'. **AuthZ is now machine-checked** (P2.3): `src/app/api/utils/authz-matrix.ts` declares every
   route × role × ownership and the generated suite fails CI if a route has no row. Start
   there for any authZ question.

2. **No RBAC / no route protection**: no `middleware.ts`; `/dashboard/*` renders without a
   session; APIs check session but never role (e.g. gigs POST). Add middleware auth gate +
   per-endpoint role checks (authZ matrix in TENANT_GUARDRAIL §6.1).
3. **2FA**: hand-rolled TOTP; secret stored **plaintext** in `user.totp_secret`; otpauth URI
   (secret included) sent to third-party `api.qrserver.com` for QR rendering. *Resolved in two
   stages*: P0 hardened the hand-rolled version (encrypted at rest, local QR, rate limits);
   2026-07-30 replaced it wholesale with the **better-auth twoFactor plugin** (sign-in
   challenge, one-time backup codes, trusted devices, account lockout — migration 0005).
4. **Open redirect**: signin/signup do `window.location.href = callbackUrl` from query param.
   Allowlist relative paths only. *(Fixed in P0 via `sanitizeCallbackUrl`; the
   `/account/logout` holdout was found and fixed in S16, with an E2E guard.)*
5. **postMessage to `'*'`** with session JWT in `/api/auth/expo-web-success` (platform file —
   constrain target origin when feasible).
6. **No security headers** (CSP, HSTS, X-Frame-Options, Referrer-Policy…), `typescript.
   ignoreBuildErrors: true`, cookies `SameSite=None` platform-wide (`next.config.js`,
   `src/lib/auth.ts`). *(Headers fixed in P0/P1; the `SameSite=None` remainder closed in
   S1 — Lax by default, `None` only under the `CREATE_BUILDER_EMBED` opt-in.)*
7. **No input validation layer** (zod absent in web), **no rate limiting** (login, 2FA,
   password change unthrottled), **no CSRF tokens** beyond better-auth `trustedOrigins`.
8. **PII in DB as base64 images**; no upload size/MIME enforcement.
9. **No audit logging / structured logs** (console.error only) — PRD admin requires audit logs.
10. SQL is parameterized throughout (tagged templates / placeholders; dynamic UPDATE builders
    whitelist columns) — **keep it that way**; add regression tests.
11. No secrets committed; deps pinned via yarn lockfile — add CI `yarn npm audit` + secret scan.

## 8. Alpha definition & build slices

**Alpha = deployable PWA where one venue and one talent can complete the full loop with real
data:** sign up → profiles → publish gig → browse/apply → negotiate in messages → hire →
check-in/out → (sandbox) Stripe Connect escrow payout → admin can see audit trail — meeting the
guardrails (Apdex ≥ 0.85 fallback / ≥ 0.94 target at T=300ms, CWV "good", OWASP/GDPR checklist).

Build as **vertical slices** (each = schema + API + UI + tests + guardrail checks). P0–P1 are
done; the remaining phases were **re-sliced 2026-07-30** to front-load legally-blocking
compliance and the force-multipliers that make later slices cheaper to secure — the rationale,
old→new map, dependency graph, and per-slice security gates live in DEV_TIMELINE §2 (which is
the authoritative plan; this list is the summary).

- **P0 — Foundations** ✅ (blocks everything): migration baseline for §6.1 tables; `middleware.ts`
  auth+RBAC; zod validation on all route bodies; security headers; fix findings 1/3/4;
  structured logger + `audit_logs`; CI; seed script; dead code removed; metadata renamed.
- **P1 — Gigs live end-to-end** ✅: browse consumes real `GET /api/gigs` (filters, pagination);
  `/gigs/[id]` detail page; gig status lifecycle; venue dashboard Open Gigs real.
- **P2 — Trust & compliance spine** (do first): legal pages + cookie audit; self-serve data
  export/delete; **authZ matrix test harness** (a route without a row fails CI); RLS
  activation; 18+ age gate + RoPA/retention docs. Legally live obligations plus the
  multipliers every later slice leans on.
- **P3 — Applications**: `applications` slice; apply panel (5% estimator already live); venue
  shortlist/hire; talent My Applications; `notifications` as shared infra for P5/P7.
- **P4 — Media pipeline**: presigned object-storage uploads, size/MIME limits, **EXIF strip**,
  base64→storage backfill. Unblocks P5 attachments and closes a live privacy gap.
- **P5 — Messaging & negotiation**: conversations/messages (polling); rate-proposal message
  kind; gig-in-focus sidebar; report conversation → `reports`.
- **P6 — Availability & scheduling**: availabilities CRUD + calendar wiring; Available Tonight;
  conflict detection. *Parallel with P5.*
- **P7 — Live ops / shifts**: `shifts` model; idempotent, audited check-in/out (idempotency
  keys backed by a unique constraint); venue Active Operations + talent Check In real.
- **P8 — Payments / Stripe Connect** (isolated by design): Express onboarding; destination
  charges with a server-computed 5% fee; append-only `payouts` ledger in integer cents;
  webhook signature verification + replay guard; escrow release 24 h post-checkout.
- **P9 — Admin & trust**: admin gating; moderation dashboard (reports triage, user & gig
  management, audit-log viewer, async CSV export); KPI cards from real aggregates.
- **P10 — PWA, performance & alpha gate**: manifest + icons; Serwist service worker (never
  cache authed responses, purge on logout); shared rate-limit store; Lighthouse CWV, k6 Apdex
  and axe gates in CI.

Deferred post-alpha: map view w/ pins, external calendar/ticketing integrations, mobile (Expo)
app, WebSockets, push notifications, promoter payment triangle, advanced matching ("Live
Analytics"). Tracked in DEV_TIMELINE → Technical Backlog.

## 9. Testing strategy

| Layer | Tooling | What to cover (minimum) |
|---|---|---|
| Unit | Vitest (already configured) | fee math (5% + net), rate/money in cents, validation schemas, availability slot logic, profile completion % |
| API/integration | Vitest + Neon branch DB (or pg-testcontainers) | each route: authN, **authZ matrix**, tenant isolation (venue A ≠ venue B), input rejection, SQL-injection regression |
| E2E | Playwright | the alpha loop (§8) as one journey per role; deep-link refresh survival; PWA install & offline shell |
| Load/perf | k6 (scenarios in TENANT_GUARDRAIL §3.4) | browse surge, apply spike, message poll fan-out, midnight check-in burst; assert Apdex_API ≥ 0.85 @ T=300ms |
| Web vitals | Lighthouse CI (budgets in TENANT_GUARDRAIL §3.2) | LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 at p75, mobile emulation |
| Security | OWASP ZAP baseline, `yarn npm audit`, gitleaks, Playwright authZ probes | TENANT_GUARDRAIL §5 per-item procedures |
| A11y | @axe-core/playwright | WCAG 2.2 AA on the 10 core screens (dark theme contrast!) |

Definition of done for any slice: unit + integration green, E2E path updated, no new ZAP
high/medium, budgets green, docs updated (this file + DEV_TIMELINE status).

## 10. References

- Specs: [AfterDark_PRD.md](AfterDark_PRD.md) · [AfterDark-UI-wireframe.pdf](AfterDark-UI-wireframe.pdf) · [AfterDark-ux-workflow.jpg](AfterDark-ux-workflow.jpg)
- Companion docs: [DEV_TIMELINE.MD](DEV_TIMELINE.MD) · [TENANT_GUARDRAIL.md](TENANT_GUARDRAIL.md)
- Performance: Radware, *Web Application Performance: Metrics, Process & Best Practices* —
  <https://www.radware.com/cyberpedia/application-delivery/web-application-performance/> ·
  Google Core Web Vitals — <https://web.dev/articles/vitals> · Apdex — <https://www.apdex.org/>
- Security/privacy: OWASP Top 10 (2021) — <https://owasp.org/Top10/> · OWASP ASVS —
  <https://owasp.org/www-project-application-security-verification-standard/> · GDPR —
  <https://gdpr.eu/checklist/>
- Stack: Next.js — <https://nextjs.org/docs> · better-auth — <https://www.better-auth.com/docs>
  · Neon — <https://neon.com/docs> · Stripe Connect — <https://docs.stripe.com/connect> ·
  Serwist (PWA) — <https://serwist.pages.dev/>

## 11. Working agreements

- Check `DEV_TIMELINE.MD` current-status section before starting; update it when a slice lands.
- Never widen a query's tenant scope to "fix" a bug; never log PII; money in integer cents;
  all new endpoints get zod validation + role check + an integration test on day one.
- The three audit docs (this file, DEV_TIMELINE, TENANT_GUARDRAIL) are the source of truth for
  scope; app code changes should trace back to a slice in §8.
