# DEV_TIMELINE — AfterDark

> Living status document. **Update the "Current status" block and phase checkboxes whenever a
> slice lands.** Companion to [CLAUDE.md](CLAUDE.md) (architecture & audit) and
> [TENANT_GUARDRAIL.md](TENANT_GUARDRAIL.md) (compliance & performance gates).

---

## 1. Current status — YOU ARE HERE

- **Date:** 2026-07-24 · **Branch:** `claude/p0-foundations` (worktree off `main`)
- **Project stage:** **P0 (Foundations & hardening) landed. Security/privacy baseline in place;
  next is P1 (gigs live end-to-end).**
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
1. P1.1 — Point `dashboard/talent/browse` (and venue browse) at real `GET /api/gigs` (filters +
   pagination), delete `MOCK_GIGS`; reuse the validated query params.
2. P1.2 — `/gigs/[id]` detail page per wireframe p4 (payout hero, about, venue card; map deferred).
3. P1.3 — Gig lifecycle statuses (extend enum DRAFT→PUBLISHED→FILLED→COMPLETED/CANCELLED via a
   new migration) + venue dashboard Open Gigs reading real data.
4. P1.4 — Landing "Featured Tonight" reads real published-tonight gigs (reuse `buildGigsListQuery`).
5. P0 follow-ups (carry-over, non-blocking): apply CSP nonce (drop `unsafe-inline`); migrate to
   better-auth twoFactor plugin for recovery codes; add Sentry with PII scrubbing; RLS policies.

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

### P1 — Gigs end-to-end (≈1 wk) — ☐ not started
- ☐ Browse consumes real `GET /api/gigs` (neighborhood/role/pay/tonight filters, pagination)
- ☐ `/gigs/[id]` detail page per wireframe p4 (minus map OK for alpha)
- ☐ Gig lifecycle statuses (DRAFT→PUBLISHED→FILLED→COMPLETED/CANCELLED) + venue Open Gigs table real
- ☐ Landing "Featured Tonight" reads real published-tonight gigs

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
11. **Legacy dead code** — ✅ done in P0 (`useUpload.ts`, `api/utils/upload.ts`,
    `useHandleStreamResponse.ts`, `api/vitest.config.ts` removed). **Still open:** talent
    create-gig page (`dashboard/talent/create-gig`) — not a PRD flow; remove or repurpose in P1.
12. **DashboardSidebar** hardcoded identity ("DJ Marcus Lee"/"Nebula NYC") and badge counts —
    replaced during P2/P3; keep an eye out for other hardcoded demo strings.
13. **Accessibility deep pass**: neon-on-dark contrast ratios, focus states on custom chips/
    toggles, calendar keyboard navigation (beyond the P7 axe smoke tests).
14. **Data warehouse/analytics**: venue KPIs (avg time-to-hire, filling rate) need event
    capture design; consider a simple `events` table now to avoid losing history.
15. **Rate-limit store**: P0 rate limiting can be in-memory per-lambda; multi-region scale
    needs a shared store (Upstash Redis or Postgres-based) — revisit at load-test time.
16. **iframe embedding posture**: cookies are `SameSite=None`; P0 set CSP `frame-ancestors` to
    `'self'` + configured create.xyz origins (no `X-Frame-Options`, superseded by CSP). Before
    GA, decide whether to keep the builder pathway or lock `frame-ancestors` to `'self'` only.
17. **2FA → better-auth twoFactor plugin**: P0 hardened the hand-rolled TOTP (encrypted secret,
    local QR, rate limits) but kept it hand-rolled. Migrate to the plugin for **recovery/backup
    codes** and trusted-device handling; re-encrypt legacy plaintext secrets on next enroll
    (the disable path already tolerates them).
18. **CSP nonce**: P0 CSP allows `'unsafe-inline'` for scripts (Next.js inline bootstrap).
    Move to nonce-based CSP to drop `unsafe-inline` (A05 hardening).
19. **Error tracking**: wire Sentry (or similar) with the `redactPii` scrubber so exceptions are
    captured without PII; pair with the structured `Logger` added in P0.
20. **oxlint in CI**: repo has `.oxlintrc.json` but CI doesn't run it yet; add a lint job.
21. **Shared rate-limit store** (was #15's concern): the in-memory `SlidingWindowRateLimiter` is
    per-instance. For multi-region/serverless fan-out, back `getRateLimiter` with Upstash Redis
    or a Postgres token-bucket at load-test time.
