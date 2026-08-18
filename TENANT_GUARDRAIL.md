# TENANT_GUARDRAIL.md — AfterDark

> Compliance, security, privacy, and performance guardrails for a high-concurrency,
> multi-tenant PWA handling PII and transactional data. Every item is written to be
> **testable by a developer later**: requirement → current state (audit 2026-07-24) →
> verification procedure. The release checklist is §7.
>
> Companions: [CLAUDE.md](CLAUDE.md) (architecture/audit) · [DEV_TIMELINE.MD](DEV_TIMELINE.MD)
> (phases). Sources: Google Core Web Vitals (web.dev/vitals), OWASP Top 10 (2021), GDPR
> (gdpr.eu), Radware *Web Application Performance: Metrics, Process & Best Practices*
> (radware.com/cyberpedia/application-delivery/web-application-performance/), apdex.org.

---

## 1. Scorecard (targets at a glance)

| Metric | Target (alpha gate) | Stretch / notes | How measured |
|---|---|---|---|
| **Apdex (API transactions), T = 300 ms** | ≥ 0.85 ("good" fallback) | **≥ 0.94 ("excellent")** | k6 + RUM, §3.1 |
| LCP (p75, mobile) | ≤ 2.5 s | ≤ 2.0 s | Lighthouse CI + RUM |
| INP (p75) | ≤ 200 ms | ≤ 150 ms | RUM (web-vitals lib) |
| CLS (p75) | ≤ 0.1 | ≤ 0.05 | Lighthouse CI + RUM |
| TTFB (p75) | ≤ 800 ms | ≤ 500 ms | RUM / k6 |
| FCP (p75, mobile) | ≤ 1.8 s | — | Lighthouse CI |
| HTTP 5xx error rate | < 0.1 % | < 0.05 % | server logs/APM |
| HTTP 4xx (excl. 401/404 noise) | < 1 % | — | server logs/APM |
| Failed API request rate (client-observed) | < 0.5 % | — | RUM |
| Front-end JS error rate | < 0.1 % sessions | — | error tracker |
| Uptime | ≥ 99.9 % monthly | — | synthetic checks |
| Concurrency (alpha load target) | 500 concurrent users / 200 RPS mixed | no degradation past Apdex 0.85 | k6 §3.4 |
| p99 API response | ≤ 1.2 s (=4T) | — | k6 |
| DB CPU / connection pool | < 70 % sustained; zero pool exhaustion | — | Neon metrics |
| OWASP ZAP baseline | 0 High / 0 Medium | — | §5 |
| GDPR checklist (§4) | 100 % of "alpha-required" rows | — | manual review |
| Accessibility (axe, 10 core screens) | 0 critical/serious | WCAG 2.2 AA | §6.5 |

## 2. Why these thresholds (Apdex decision record)

**T = 300 ms, measured at API/transaction response (server round trip observed by the client),
with Apdex = (Satisfied + Tolerating/2) / Total; Satisfied ≤ T (300 ms); Tolerating ≤ 4T
(1.2 s); Frustrated > 1.2 s.**

Rationale:
- The user asked for T in 200–500 ms. 200 ms would double-count Google's INP budget (INP
  already enforces ≤ 200 ms interaction-to-paint) while being routinely broken by cold
  serverless invocations + Neon connection setup, producing noisy false alarms. 500 ms would
  let every request feel "instant-ish" pass while masking p75 regressions. 300 ms is the
  midpoint that (a) keeps full interactions (INP ≤ 200 ms render + network overlap) under the
  ~400 ms "feels instant" perception window, (b) is achievable on warm serverless + pooled
  Neon with indexed queries, and (c) makes the 4T frustrated bound (1.2 s) align with our p99
  target.
- Page *loads* are governed by Core Web Vitals (LCP/INP/CLS), not Apdex — mixing them into one
  Apdex distorts both. Apdex here covers XHR/fetch transactions: browse queries, apply,
  message send/poll, check-in, settings saves.
- Score bands (per user direction): **excellent 0.94–1.00** (target), **good 0.85–0.93**
  (accepted fallback for alpha). Below 0.85 fails the release gate.
- Segment Apdex per tenant, per endpoint group, and per device class (Radware guidance:
  cohort/geo segmentation, not global averages) — a global 0.94 must not hide one venue's 0.60.

## 3. Performance guardrails

### 3.1 Apdex measurement procedure
1. Instrument RUM: `web-vitals` for LCP/INP/CLS/TTFB + a fetch wrapper recording per-endpoint
   durations tagged `{endpoint_group, tenant_id-hash, device}`; export to your APM/analytics.
2. In k6 load tests, compute Apdex from response-time buckets
   (`rate(duration<=300) + 0.5*rate(300<duration<=1200)`), assert `apdex >= 0.85`
   (CI) and report against 0.94.
3. Alert when 1-hour rolling Apdex < 0.90 or any single tenant < 0.80.

### 3.2 Core Web Vitals budgets (Lighthouse CI)
- Budgets: LCP 2500 ms, INP 200 ms (lab proxy: TBT ≤ 200 ms), CLS 0.1, FCP 1800 ms,
  TTFB 800 ms; JS transferred ≤ 300 KB gz on landing/browse; image weight ≤ 500 KB/route.
- Run `lhci autorun` (mobile emulation, 4x CPU throttle) against: `/`, `/dashboard/talent/browse`,
  `/gigs/[seeded-id]`, `/dashboard/venue`, `/dashboard/talent/messages` on every PR.
- Current-state notes (audit): all pages are `'use client'` with heavy mock payloads inline —
  expect LCP/TBT wins from moving lists to RSC + suspense streaming; ~~FontAwesome is proxied
  via rewrite~~ — **removed entirely 2026-08-18 (S15): it was unused (zero `fa-` classes) and
  its webfonts were already blocked by `font-src`**; hero images on
  landing/browse need `next/image` with explicit dimensions to protect CLS.

### 3.3 Radware-derived operational metrics (track from day one)
- Latency: TTFB, server response time, end-to-end transaction duration (post→publish;
  apply→confirmation), API response per endpoint group, network RTT.
- Errors/availability: 4xx rate, 5xx rate, failed API rate, JS error rate, uptime %.
- Throughput/concurrency: RPS, transactions/min (applications submitted, messages sent,
  check-ins), concurrent users & sessions, queue depth (if any queue/worker is added).
- Resources: Lambda duration/memory, DB CPU/mem, connection pool saturation, GC pauses (Node).
- Practices adopted from the article: RUM + synthetic monitoring together; per-cohort
  baselines; CI performance regression diffs between builds; long-task tracking (>50 ms) in
  RUM; service-worker prefetch of predictable next pages (browse → gig detail) once the PWA
  ships; caching/CDN + DB indexing best practices per CLAUDE.md §6.3.

### 3.4 Load & concurrency test scenarios (k6) — multi-tenant realism
Seed: ≥ 50 venues, ≥ 500 talent, ≥ 1 000 gigs. Mixed workload, ramping 50 → 500 VUs, 15 min
steady state; assert scorecard rows (Apdex, p99, error rates, pool health):
1. **Friday-night browse surge**: anonymous + authed `GET /api/gigs` with filter permutations;
   pagination; cache-hit ratio observed.
2. **Hot-gig application spike**: 200 talent apply to the same gig in 60 s — unique-constraint
   contention, notification fan-out.
3. **Messaging fan-out**: 300 active conversations polling at 5–10 s + sends; verify no
   cross-conversation leakage under load (isolation asserted in-script).
4. **Midnight check-in burst**: 100 concurrent check-ins across 20 venues in 5 min; idempotent
   double-tap retries (same shift, repeated calls) must not double-pay.
5. **Noisy neighbor**: one venue generating 10× traffic; other tenants' Apdex must stay ≥ 0.85
   (validates per-tenant rate limits, §6.3).
6. Soak: 2 h at 30 % peak — memory/connection leak detection.

## 4. GDPR & privacy guardrails

The app collects PII of EU-protectable scope regardless of NYC focus; build to GDPR as the
high-water mark (also covers NY SHIELD/CCPA-adjacent duties). AfterDark = **controller**;
Neon, Stripe, AWS/Vercel, error-tracking = **processors**.

### 4.1 PII inventory (current + alpha)
| Data | Where | Sensitivity notes |
|---|---|---|
| Email, name, phone, recovery email | `user` | account PII |
| Password hash | better-auth `account` | keep argon2/scrypt; never log |
| TOTP secret | better-auth `twoFactor` table (since migration 0005; `user.totp_secret` retired) | **encrypted at rest** under `BETTER_AUTH_SECRET` by the better-auth twoFactor plugin; QR rendered locally (the qrserver leak was removed in P0) — *stale "currently plaintext" row corrected 2026-08-18, S15* |
| Stage name, pronouns, bio, neighborhood, photos, social links, rates | `talent_profiles` | pronouns ≈ gender-adjacent — treat as sensitive-by-caution; photos are biometric-adjacent content, EXIF may embed GPS → strip on upload |
| Venue address, contacts, gallery | `venue_profiles` | business PII |
| Messages + attachments | (P3) | private comms; export & erasure must cover them |
| Applications, shifts, check-in timestamps | (P2/P5) | work history = PII |
| Payout/bank data | **Stripe only** — store only Stripe account/transfer IDs | never store PANs/IBANs (also PCI SAQ-A posture) |
| IPs, session tokens, audit logs | `session`, logs | retention-limited (§4.3) |

### 4.2 Alpha-required obligations (testable)
| # | Requirement | Current state | Verify by |
|---|---|---|---|
| G1 | Privacy Policy + ToS pages linked in footer (wireframes already show them) | links are `#` placeholders | pages exist, versioned, reachable logged-out |
| G2 | Lawful basis mapped per processing activity (contract for marketplace ops; consent for marketing; legitimate interest documented for fraud/moderation) | absent | RoPA doc in repo (`docs/ropa.md`) reviewed |
| G3 | Consent for non-essential cookies/analytics; session cookie is strictly-necessary (no banner needed if nothing else is set) | no analytics present; keep it that way or add CMP | cookie audit in browser devtools: only `better-auth` cookies pre-consent |
| G4 | DSR: **export my data** (JSON of user + profiles + gigs/applications + messages) and **delete my account** (hard-delete or anonymize; cascades; Stripe disconnect), ≤ 30 days, self-serve in Settings | absent | Playwright test: create→populate→export contains all; delete→login fails→rows gone/anonymized incl. messages & audit trail pseudonymization |
| G5 | Rectification | profile/settings edit ✅ | covered by E2E |
| G6 | Data minimization: don't collect what alpha doesn't use; pronouns optional; profile visibility defaults reviewed (privacy by design/default, Art. 25) | base64 photos in DB; mock fields everywhere | schema review vs PRD; optional fields nullable & skippable |
| G7 | Retention schedule: sessions ≤ 7 d cache (present) ; logs/IPs ≤ 90 d; messages & transactional records per legal need (payments 7 y financial-records carve-out); document it | absent | `docs/retention.md` + a scheduled purge job with a test |
| G8 | Encryption in transit (TLS everywhere incl. DB `sslmode=require`) and at rest (Neon/S3 default; app-layer encrypt TOTP + any token columns) | TLS ✅; at-rest partial | config review + `\d` column audit |
| G9 | Breach notification runbook (72 h to authority; user notice when high risk) with contact tree | absent | `docs/incident-runbook.md` tabletop-tested once |
| G10 | DPAs with subprocessors (Neon, Stripe, host, error tracker) + international transfer basis (SCCs/DPF); list published in privacy policy | absent | doc review |
| G11 | No PII to third parties without basis — remove `api.qrserver.com` QR call (leaks TOTP secret), self-host FontAwesome or keep proxy first-party, EXIF-strip uploads | **RESOLVED**: qrserver removed (P0); EXIF stripped on every upload (P4); **FontAwesome + a hotlinked landing texture removed outright in S15** after ZAP's first baseline flagged the proxied CDN response — the app now loads zero third-party assets | grep for external URLs in server code; network-tab audit shows zero third-party PII egress; **automated: `test/third-party-egress.test.ts` + the CI ZAP baseline** |
| G12 | Age gating: nightlife context, gigs may require 21+; assert 18+ at signup, per-gig 21+ flag surfaced | absent | signup E2E |
| G13 | DPIA (recommended, not blocking): location + work-history + semi-sensitive attributes at scale | absent | doc exists before GA |

## 5. OWASP Top 10 (2021) — requirement → finding → fix → test

| ID | Area | Current finding (audit 2026-07-24) | Required fix | Verification procedure |
|---|---|---|---|---|
| **A01** Broken Access Control | **FAIL.** `POST /api/user/role` accepts `ADMIN` from any session (`anything/apps/web/src/app/api/user/role/route.ts:23`); no `middleware.ts`; dashboards unauthenticated; APIs never check role; open redirect via `callbackUrl` on signin/signup | RBAC middleware + per-endpoint role matrix (§6.1); strip ADMIN from self-serve; deny-by-default; relative-path-only redirect allowlist; object-level checks (every id parameter re-scoped to session) | Integration suite runs the full **authZ matrix** (§6.1) expecting 401/403; Playwright: talent hitting venue endpoints & vice versa; redirect probe `?callbackUrl=https://evil.example` must land on `/` |
| **A02** Cryptographic Failures | TOTP secret plaintext in DB and sent to third-party QR service; PII images base64 in DB; otherwise TLS + argon2 OK | Encrypt TOTP (or better-auth twoFactor plugin); local QR generation; move media to object storage w/ private ACL + signed URLs; `sslmode=require`; document key management | Column audit (no plaintext secrets); network capture during 2FA enroll shows zero external calls; ZAP passive scan for sensitive-data-in-transit |
| **A03** Injection | **PASS so far** — all SQL parameterized (tagged templates / `$n` placeholders; UPDATE builders whitelist columns). XSS untested; user content (bios, messages, gig descriptions) will grow | Keep parameterization as a hard rule; React escapes by default — ban `dangerouslySetInnerHTML` for user content; sanitize/validate all inputs with zod; encode attachment filenames | SQLi regression tests (`' OR 1=1--`, etc.) per endpoint; stored-XSS probes via bio/gig description rendered on other users' screens; ZAP active scan on staging |
| **A04** Insecure Design | No rate limits; no abuse cases modeled (fake gigs, fee bypass by off-platform settlement, check-in spoofing); money paths undefined | Threat-model P2/P5 slices before build (escrow state machine, idempotency keys, server-side fee calculation only); rate limits per user+IP+tenant; business-rule invariants in DB (constraints) | Design-review sign-off recorded in PR; k6 scenario 4 (double check-in) and fee-tamper test: client-submitted fee/net values must be ignored by server |
| **A05** Security Misconfiguration | No security headers; `typescript.ignoreBuildErrors: true`; cookies `SameSite=None` globally; `postMessage('*')` in expo-web-success; verbose `console.error` | Add headers: CSP (nonce-based, no `unsafe-inline` goal), HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors decision (see backlog #16); strict TS build; constrain postMessage target | `curl -sI` header assertions in CI; securityheaders.com grade ≥ A; build fails on TS errors; ZAP baseline 0 High/Med |
| **A06** Vulnerable & Outdated Components | Yarn 4 lockfile pins; no auditing; heavy unused deps in mobile scaffold | CI `yarn npm audit --severity high` fail-gate + Renovate/Dependabot; prune unused deps | CI job green; SBOM (`yarn info --json` export) reviewed quarterly |
| **A07** Identification & Auth Failures | better-auth solid base (httpOnly cookies, hashed pw, trustedOrigins CSRF); but: no login rate limiting/lockout, min-8 pw only, weak hand-rolled 2FA, 7-day session cache w/o revocation UI | Rate-limit login/2FA/password (e.g. 5/min/IP + progressive delay); pw policy vs breached-password list; proper 2FA + recovery codes; session list & revoke in settings | k6/script brute-force expects 429s; OWASP ZAP auth tests; unit tests for lockout; manual session-revocation test on second device |
| **A08** Software & Data Integrity Failures | ~~No CI~~ (P0); ~~FontAwesome via proxy rewrite (kit JS = third-party code executing in-app)~~ — **removed in S15**, and `test/third-party-egress.test.ts` now fails CI on any off-origin asset, rewrite included (a first-party-looking rewrite is how this one hid); ~~future Stripe webhooks unverified~~ (P8 + S14 route tests); open-next `tagCache: "dummy"` (moot on Vercel, Backlog #9) | CI with locked deps + provenance; self-host/subset icon assets (or SRI where applicable); **verify Stripe webhook signatures** (P5); protect deploy branch | Webhook test: unsigned/forged payload → 400 + no state change (integration test); CI config review; no runtime CDN script tags in prod HTML |
| **A09** Security Logging & Monitoring Failures | `console.error` only; no audit trail despite PRD Admin requiring one | Structured JSON logs (no PII), `audit_logs` for auth events, role changes, gig/application/shift/payout state changes, admin actions; alerting on auth-failure spikes, 5xx, Apdex drops | Trigger each event class in staging → assert audit row + no PII in log lines; simulated auth-failure burst raises alert within 5 min |
| **A10** SSRF | No user-supplied URL fetches server-side today; risk arrives with attachment/link previews and calendar/ticketing integrations | Any server-side fetch of user-influenced URLs goes through allowlist + deny private IP ranges/metadata endpoints; timeouts | Unit tests on the fetch guard (`169.254.169.254`, `10.x`, `file://`, redirects-to-private all rejected) |

## 6. Multi-tenant & platform guardrails

### 6.1 AuthZ matrix (enforce + test; deny-by-default)
PARTY = "Party People" consumer persona (CLAUDE.md §6.3): read-only discovery + private-party
inquiries only; never a marketplace principal.

| Endpoint / surface | Anon | TALENT | VENUE | PARTY | ADMIN |
|---|---|---|---|---|---|
| `GET /api/gigs` / events / venue browse (public) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Global search (events/parties/venues) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /api/gigs`, gig edit/close | ❌ | ❌ | ✅ own venue | ❌ | ✅ |
| Apply / withdraw application | ❌ | ✅ self | ❌ | ❌ | ✅ |
| Review/shortlist/hire applicants | ❌ | ❌ | ✅ own gigs | ❌ | ✅ |
| Conversations/messages | ❌ | ✅ participant | ✅ participant | ✅ own private-party inquiries | ✅ (moderation, audited) |
| Availability CRUD | ❌ | ✅ self | ❌ | ❌ | ✅ |
| Check-in/out | ❌ | ✅ own shift | ✅ own venue's shifts | ❌ | ✅ |
| Payout ledger | ❌ | ✅ own rows | ✅ own venue rows | ❌ | ✅ |
| `/api/user/role` POST | ❌ | TALENT/VENUE/PARTY only — **never ADMIN** | same | same | n/a |
| Admin dashboard/APIs, reports, audit logs | ❌ | ❌ | ❌ | ❌ | ✅ |
| Settings/profile/2FA | ❌ | ✅ self | ✅ self | ✅ self | ✅ self |

Test: generated integration suite iterates `role × endpoint × (own id, other tenant's id)`
asserting 200/401/403 per this table — the single most important test artifact in the repo.
PARTY rows matter most for negative coverage: assert 403 on every gig/application/shift/payout
write.

### 6.2 Tenant isolation
- All queries scoped server-side from session (pattern already used in `/api/gigs` POST — keep).
- Add Postgres **RLS** as defense-in-depth once migrations exist; app sets
  `app.user_id`/`app.role` per request.
- Isolation tests: venue A must never read venue B's applicants, messages, shifts, payouts —
  both via API (integration) and under load (k6 scenario 3 asserts payload ownership).
- IDs: UUIDs already; never sequential enumeration; pagination caps (max 100/page) on all lists.

### 6.3 Fairness & abuse under concurrency
- Per-tenant + per-user + per-IP rate limits (auth: 5/min; writes: 60/min; reads: 300/min
  starting points); 429 with `Retry-After`.
- Idempotency keys on check-in/out and payout mutations; DB unique constraints back them.
- Queue/spike control: keep handlers < 1 s; anything longer (exports, media processing) goes
  async (P6 CSV export included).
- Neon: pooled connections sized to plan limits; alarm at 70 % pool utilization (scorecard).

### 6.4 Payments (PCI posture, P5)
Stripe Connect Express; card data touches Stripe only (SAQ-A); webhook signature verification;
server-computed 5 % fee; escrow release 24 h post-checkout (per wireframe p4 promise); ledger
append-only; refunds/disputes admin-audited. Test: fee tamper, forged webhook, double-release.

### 6.5 Accessibility & UX quality gates
- `@axe-core/playwright` on the 10 core screens: 0 critical/serious; manual pass for neon-cyan
  on dark contrast (≥ 4.5:1 for text — current `#00FFCC` on `#121212` passes at ~13:1, but
  muted grays on `#1E1E1E` cards need checking), focus visibility, keyboard-only calendar and
  chat operation, `prefers-reduced-motion` respected on glow/motion effects.

### 6.6 PWA-specific guardrails (P7)
- Service worker must **never cache** authenticated API responses beyond short SWR windows,
  and must purge caches on logout (test: logout → offline → no PII retrievable from cache).
- Offline fallback page; manifest complete (name, icons incl. maskable, `theme_color
  #121212`, `display: standalone`); Lighthouse PWA installable pass; update flow (skipWaiting
  prompt) tested so stale bundles don't linger past deploys.

## 7. Release-gate checklist (run per release; alpha gate = all boxes)

**Performance**
- ☐ k6 suite (§3.4 scenarios 1–5) green: Apdex_API ≥ 0.85 (report vs 0.94), p99 ≤ 1.2 s,
  5xx < 0.1 %, no pool exhaustion
- ☐ Lighthouse CI budgets green on the 5 key routes (mobile emulation)
- ☐ RUM dashboards live: CWV p75, per-endpoint Apdex, per-tenant segmentation, long tasks
- ☐ Soak test (2 h) — no leak trends

**Security (OWASP §5)**
- ☐ AuthZ matrix suite green (§6.1) · ☐ tenant-isolation tests green (§6.2)
- ☐ ZAP baseline: 0 High/Medium · ☐ security headers assertions green
- ☐ `yarn npm audit` no high+ · ☐ gitleaks clean · ☐ rate-limit probes return 429
- ☐ SQLi/XSS regression suites green · ☐ webhook signature + fee-tamper tests green (from P5)
- ☐ Audit-log events verified for every state-changing action class

**Privacy (GDPR §4)**
- ☐ G1–G12 verified (procedures in table) · ☐ cookie audit clean · ☐ third-party egress audit
  clean (no qrserver; icons first-party) · ☐ DSR export/delete E2E green · ☐ retention purge
  job test green

**PWA/A11y**
- ☐ Installability + offline fallback + logout-cache-purge tests green · ☐ axe: 0
  critical/serious on 10 screens

**Docs**
- ☐ DEV_TIMELINE current-status block updated · ☐ any new endpoint added to §6.1 matrix

---

*Keep this file authoritative: when a guardrail changes (new threshold, new endpoint, new
subprocessor), update the relevant table in the same PR that changes the code.*
