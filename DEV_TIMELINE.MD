# DEV_TIMELINE — AfterDark

> Living status document. **Update the "Current status" block and phase checkboxes whenever a
> slice lands.** Companion to [CLAUDE.md](CLAUDE.md) (architecture & audit) and
> [TENANT_GUARDRAIL.md](TENANT_GUARDRAIL.md) (compliance & performance gates).

---

## 1. Current status — YOU ARE HERE

- **Date:** 2026-07-24 · **Branch:** `claude/afterdark-pwa-spec-audit-f3b67a` (worktree off `main`)
- **Project stage:** **Pre-alpha. Spec-vs-code audit complete; no app code changed.**
- Baseline: create.xyz export in `anything/` (commits `70ae201` → `1d88889`). Working tree clean
  apart from the three audit docs produced by this session (CLAUDE.md, DEV_TIMELINE.MD,
  TENANT_GUARDRAIL.md).
- **What actually works today** (wired to Neon Postgres): email/social auth + sessions,
  onboarding role selection, talent profile CRUD, venue profile CRUD, venue gig creation
  (POST `/api/gigs`), unused-but-real gig listing (GET `/api/gigs`), settings
  (profile/password/hand-rolled 2FA).
- **What is UI-with-mock-data only:** landing featured gigs, both dashboards, browse (talent &
  venue), applicants, messages, schedule/availability, live-ops checkout. **Missing entirely:**
  gig detail page, applications, messaging backend, availability backend, check-in/out,
  Stripe/payments, admin, notifications, search, map, PWA manifest/service worker, tests,
  migrations, RBAC/middleware. Full matrix: CLAUDE.md §4.
- **Environment gaps a new dev must solve first:** no `.env` committed (`DATABASE_URL`
  required); DB columns/tables referenced by code exist only if created out-of-band — there are
  **no migrations**; web has **zero tests**; `next build` hides type errors
  (`ignoreBuildErrors: true`).
- **Known security holes to fix before any real users:** ADMIN self-escalation via
  `POST /api/user/role`; no route/RBAC protection; plaintext TOTP secrets + secret sent to
  `api.qrserver.com`; open redirect on `callbackUrl`; no security headers/rate limiting/input
  validation. Details: CLAUDE.md §7, procedures: TENANT_GUARDRAIL §5.

### Pick-up-here: next five tasks (in order)
1. P0.1 — Create migration baseline (SQL or drizzle-kit) reproducing CLAUDE.md §6.1 exactly;
   add seed script; document `.env.example`.
2. P0.2 — `middleware.ts`: session gate on `/dashboard/*` + role gate map; strip `ADMIN` from
   `/api/user/role` POST.
3. P0.3 — zod schemas for every existing POST/PUT body; security headers in `next.config.js`;
   allowlist `callbackUrl` to relative paths.
4. P0.4 — CI: typecheck (remove `ignoreBuildErrors`), vitest, oxlint, `yarn npm audit`,
   gitleaks; wire `test` script in `apps/web`.
5. P1.1 — Point `dashboard/talent/browse` at real `GET /api/gigs` (filters + pagination),
   delete `MOCK_GIGS`.

---

## 2. Phase plan to alpha

Estimates assume one focused developer (human or AI-assisted); slices are independently
shippable behind the previous one. Acceptance for every slice additionally includes the
guardrail gates: unit+integration tests green, authZ/tenant-isolation tests for new endpoints,
Lighthouse budgets green, no new ZAP high/medium (TENANT_GUARDRAIL §7 checklist).

### P0 — Foundations & hardening (≈1 wk) — ☐ not started
- ☐ Migration baseline + seed data + `.env.example`
- ☐ Auth middleware + RBAC map; fix ADMIN escalation; open-redirect allowlist
- ☐ zod input validation on all routes; security headers; rate limiting on auth endpoints
- ☐ Replace hand-rolled 2FA with better-auth twoFactor plugin (encrypted secret, local QR)
- ☐ Structured logging + `audit_logs` table; error tracking (e.g. Sentry) w/ PII scrubbing
- ☐ CI pipeline (typecheck strict, vitest, lint, audit, secret scan); remove dead code
  (`useUpload.ts`, `api/utils/upload.ts`, `useHandleStreamResponse.ts`, stray
  `api/vitest.config.ts`); app metadata "Anything App" → "AfterDark"

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
11. **Legacy dead code removal** if not done in P0: `src/utils/useUpload.ts`,
    `src/app/api/utils/upload.ts`, `src/utils/useHandleStreamResponse.ts`, orphan
    `src/app/api/vitest.config.ts`, talent create-gig page (not a PRD flow).
12. **DashboardSidebar** hardcoded identity ("DJ Marcus Lee"/"Nebula NYC") and badge counts —
    replaced during P2/P3; keep an eye out for other hardcoded demo strings.
13. **Accessibility deep pass**: neon-on-dark contrast ratios, focus states on custom chips/
    toggles, calendar keyboard navigation (beyond the P7 axe smoke tests).
14. **Data warehouse/analytics**: venue KPIs (avg time-to-hire, filling rate) need event
    capture design; consider a simple `events` table now to avoid losing history.
15. **Rate-limit store**: P0 rate limiting can be in-memory per-lambda; multi-region scale
    needs a shared store (Upstash Redis or Postgres-based) — revisit at load-test time.
16. **iframe embedding posture**: cookies are `SameSite=None` and there's no `X-Frame-Options`
    because create.xyz embeds the app in its builder; before GA, decide whether to keep the
    builder pathway or lock frame-ancestors down to first-party only.
