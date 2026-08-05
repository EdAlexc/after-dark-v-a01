# CURRENT_STATUS — UX / UI / Env Audit (2026-08-05)

> Findings-only audit of the AfterDark web app: missing or broken UX, UI that fails
> readability or promises interaction it doesn't deliver, missing design/dev decisions,
> and environment-variable gaps. **No app code was changed in this pass.** Every item
> carries file:line evidence; the visual items were verified live against `yarn dev`
> (keyless — static UI only) in desktop (1280×800), short-viewport (800×450), and
> mobile (375×812) sizes. Remediation is tracked as Technical Backlog **#29–#34** in
> [DEV_TIMELINE.MD](DEV_TIMELINE.MD) §3; code-structure opportunities live in
> [REFACTOR_GUIDE.md](REFACTOR_GUIDE.md).
>
> Companion docs: [CLAUDE.md](CLAUDE.md) (repo map) · [TENANT_GUARDRAIL.md](TENANT_GUARDRAIL.md)
> (security gates) · [TESTING.md](TESTING.md) (verification playbook).

---

## 1. Severity key

| Tag | Meaning |
|---|---|
| 🔴 **P1** | Actively hurts conversion, locks users out, or ships dead weight to every visitor |
| 🟠 **P2** | Broken promise in the UI (dead control, wrong audience, lost state) — fixable in one slice |
| 🟡 **P3** | Polish / parity with wireframes / documentation drift |

---

## 2. UX & UI defects (verified live)

### 2.1 🔴 Landing hero "Browse Gigs" button is unreadable
[page.tsx:85-92](anything/apps/web/src/app/page.tsx) — the outline button carries
`text-black` on a transparent/30 %-alpha dark background over the near-black hero.
Measured live: `color: rgb(0,0,0)` on an ~`#1E1E1E` @ 30 % pill over `#121212` —
contrast ≈ **1.1:1** (WCAG AA needs 4.5:1). The button reads as an empty pill; on
mobile it's a black-on-black ghost directly under the vivid "Post a Gig".
**Fix**: drop `text-black` (the shadcn `outline` variant already resolves to readable
white under the root `dark` class — the 404 page's "Browse Gigs"
([not-found.tsx](anything/apps/web/src/app/not-found.tsx)) is the correct reference
rendering of this exact button).
**Why it happened**: the same `text-black` was pasted from the adjacent cyan-filled
button where black text *is* correct.

### 2.2 🔴 Hero clips its own CTAs at short viewport heights
[page.tsx:63](anything/apps/web/src/app/page.tsx) — the hero is
`h-screen … overflow-hidden` with vertically centered content. When the viewport is
short (browser panes, split screens, landscape phones ~⩽640 px tall), the centered
column is taller than the section, and **both CTAs are clipped out of the paint**
while remaining in the DOM (verified at 800×450: buttons report viewport y=267 yet
render outside the section's clip; the scroll-indicator arrow overlaps the subtitle).
No amount of scrolling reveals them — the section is exactly viewport-height.
**Fix**: `min-h-screen` instead of `h-screen` (or drop `overflow-hidden`, which only
exists to contain the background layer — contain it with `overflow-hidden` on the
background div instead).

### 2.3 🔴 Mobile landing nav is broken (collision + dead hamburger + no search)
Verified at 375×812:
- "Sign In" ([page.tsx:44-49](anything/apps/web/src/app/page.tsx)) wraps into the
  AFTERDARK logotype — the fixed bar's `gap-8`/`gap-4` + fixed-width "Join Now" don't
  fit 375 px, so the label breaks mid-word into the logo.
- The hamburger ([page.tsx:55-57](anything/apps/web/src/app/page.tsx)) is a `Button`
  with **no onClick and no menu** — the only nav affordance on mobile is decorative.
  (The real mobile drawer exists only inside dashboards, in
  [DashboardSidebar.tsx](anything/apps/web/src/components/DashboardSidebar.tsx).)
- `GlobalSearch` is `hidden lg:block` ([page.tsx:43](anything/apps/web/src/app/page.tsx)),
  so mobile/tablet visitors have **no search entry point** on the landing page even
  though `/search` is public and URL-addressable (S5).
**Fix**: one compact mobile menu (reuse the drawer pattern) carrying the three nav
links + search + Sign In; let "Join Now" collapse to an icon or move into the menu.

### 2.4 🔴 No password reset — a forgotten password is permanent lock-out
- [signin/page.tsx](anything/apps/web/src/app/account/signin/page.tsx) has no
  "Forgot password?" affordance (verified live — the card offers only "Join AfterDark").
- [auth.ts](anything/apps/web/src/lib/auth.ts) configures no `sendResetPassword`, and
  `requireEmailVerification: false` (auth.ts:123).
- There is **no transactional-email capability anywhere in the repo** (no provider
  SDK, no SMTP env var — see §5.3), so neither reset nor verification *can* work today.
With social sign-in currently invisible too (§2.5), email+password is the only door —
and it has no recovery path. **Fix**: pick an email provider (decision §5.3), wire
better-auth's `emailAndPassword.sendResetPassword` + `/account/reset-password` page,
then decide whether verification stays off for alpha.

### 2.5 🟠 Social sign-in buttons are invisible because of an undocumented env var
[SocialSignInButtons.tsx:62-83](anything/apps/web/src/components/SocialSignInButtons.tsx)
renders **nothing** unless `NEXT_PUBLIC_CREATE_AUTH_PROVIDERS` (a create.xyz-injected
CSV, e.g. `google,apple`) names the provider — independent of the server-side
`GOOGLE_CLIENT_ID/SECRET` self-activation in `auth.ts`. The variable is absent from
`.env.example`, and the DEV_TIMELINE §6 table filed it under "builder iframe embedding"
— so an operator who correctly configures Google OAuth still ships a sign-in page with
no Google button and no error. Verified live: no social buttons render. Details + fix
in §5.1.

### 2.6 🟠 Dead controls that promise interaction
| Control | Location | Behavior today |
|---|---|---|
| "Talk to Sales" | [page.tsx:277-283](anything/apps/web/src/app/page.tsx) | No handler, no href. Also styled `variant="outline"` with no text color fix on the cyan band. Link it to `/contact` (which exists, with a sales-ish mailto set) or cut it. |
| "Learn more about our community" | [page.tsx:182-188](anything/apps/web/src/app/page.tsx) | `variant="link"` Button, no href — goes nowhere. |
| Footer "social" circles | [page.tsx:300-308](anything/apps/web/src/app/page.tsx) | `cursor-pointer` divs with icons, no links. Comment even labels them "Social placeholders". Cut or link real profiles. |
| "Preview Profile" | [talent/profile/page.tsx:313-322](anything/apps/web/src/app/dashboard/talent/profile/page.tsx) | No onClick — never previews. A real target exists: link to the public directory card or `/search?q=<stage name>&type=talent`. |
| "Preview Listing" | [venue/profile/page.tsx:324-331](anything/apps/web/src/app/dashboard/venue/profile/page.tsx) | Same — dead. |
| Fake notification bells | 7 pages, see §2.7 | Dead `<button aria-label="Notifications">` — worse than nothing: axe-named, looks functional. |

### 2.7 🟠 Two notification-bell implementations; the real one is mounted on 4 of 13 dashboard screens
The real [NotificationsBell.tsx](anything/apps/web/src/components/NotificationsBell.tsx)
(dropdown, unread count, mark-read — P3.4) is mounted only on
`talent/applicants`, `talent/schedule`, `venue/applicants`, `venue/schedule`.
A **decorative dead bell** is rendered instead on:
[talent/browse:264](anything/apps/web/src/app/dashboard/talent/browse/page.tsx),
[talent/profile:311](anything/apps/web/src/app/dashboard/talent/profile/page.tsx),
[venue/page:282](anything/apps/web/src/app/dashboard/venue/page.tsx),
[venue/browse:317](anything/apps/web/src/app/dashboard/venue/browse/page.tsx),
[venue/create-gig:323](anything/apps/web/src/app/dashboard/venue/create-gig/page.tsx),
[venue/profile:321](anything/apps/web/src/app/dashboard/venue/profile/page.tsx),
[settings:713](anything/apps/web/src/app/dashboard/settings/page.tsx).
The two main dashboards (`talent`, `venue` home) and `admin` have **no bell at all** —
yet the wireframes put the bell on every screen (p1–p10), and notifications are the
delivery channel for application/message/shift/payout events.
**Fix**: extract one `DashboardHeader` (see REFACTOR_GUIDE §4.1) that always mounts
the real bell; delete the 7 fakes.

### 2.8 🟠 Marketing nav is auth- and role-blind
- Signed-in users returning to `/` still see **Sign In / Join Now** and no
  "Dashboard" link — the landing nav ([page.tsx:23-60](anything/apps/web/src/app/page.tsx))
  never consults the session, while `PostGigButton` on the same page does.
  Sign-in's default `callbackUrl` is `/` — so the normal loop is: sign in → land on a
  page that tells you to sign in.
- "Browse Gigs & Events", hero "Browse Gigs", and footer "Browse Gigs" all target
  `/dashboard/talent/browse`; "Venues" → `/dashboard/venue`; "Talent Network" →
  `/dashboard/talent`. All are session-gated by
  [middleware.ts](anything/apps/web/src/middleware.ts) → anonymous visitors hit a
  sign-in wall from a button that promised inventory; venue users clicking "Browse
  Gigs & Events" land inside the **talent** shell (`DashboardSidebar role="talent"`
  hardcoded); talent users clicking "Post a Gig" get the venue wizard and discover
  only at publish (403) that they can't post. No dashboard page checks role
  client-side (verified: no role guard in `create-gig`, `talent`, `venue` pages).
**Fix (decision needed, §5.2)**: either a public read-only browse surface for
anonymous/Personal users, or honest labels + role-aware routing (session-aware nav;
`PostGigButton` routing talent to an explainer instead of a 403).

### 2.9 🟠 Conversations are not URL-addressable (PRD §5 requirement)
PRD/CLAUDE.md §5.3 requires deep links that survive refresh
(`/messages/[conversationId]`). Today
[MessagesView.tsx](anything/apps/web/src/components/MessagesView.tsx) keeps
`selectedId` in component state only; refresh loses the thread, threads can't be
shared/bookmarked, and notifications can't link to a conversation. The gig-detail
"Inquire" flow ([gigs/[id]/page.tsx:166](anything/apps/web/src/app/gigs/[id]/page.tsx))
creates the conversation then pushes bare `/dashboard/talent/messages` — the user
lands on the list and must find the new thread by eye.
**Fix**: `?conversation=<id>` search param (read on mount, written on select) — no
route restructuring needed; have Inquire push it.

### 2.10 🟠 "Personal Account" signup is a dead end (PARTY role unmodeled)
[signup/page.tsx:60-208](anything/apps/web/src/app/account/signup/page.tsx) offers
**Professional** (→ `/onboarding`, picks TALENT/VENUE) and **Personal** ("exploring
events in NYC") which skips onboarding and lands on `/` with **no role**. There is no
consumer surface: search is the only public feature, and the session-only middleware
happily lets Personal users into `/dashboard/talent` where every role-gated query
403s (looks broken, §2.8). This is the CLAUDE.md §6.3 "Party People" scope —
documented as planned (`role = PARTY`, deny-by-default authZ, PARTY row in the
TENANT_GUARDRAIL matrix) but unbuilt; `authz-matrix.ts` has no PARTY dimension.
**Fix (decision, §5.2)**: either build the minimal PARTY scope alpha needs (public
browse + venue inquiry via the existing conversations model) or remove the Personal
option until it exists — today it manufactures confused accounts.

### 2.11 🟡 Wireframe-parity gaps worth an explicit "later" (not bugs)
- Gig detail (p4): no "Show Address Text" toggle, no venue response-rate stat
  (rating + gigs-hosted are real). Application panel, fee estimator, escrow note: all live.
- Messages (p6): quick-action chips (Share Setlist / Check Availability) absent —
  Propose Rate exists in the rail; attachments + rate proposals real.
- Availability (p7): "Sync Calendar" absent — deliberately deferred (Backlog #2).
- Admin sidebar deep links (`#reports` / `#management` / `#audit`) — anchors exist
  and resolve; no action needed (verified).
- [FeaturedTonight.tsx](anything/apps/web/src/components/FeaturedTonight.tsx) has no
  error state: an API failure renders the "Tonight's lineups are coming" marketing
  empty state — a deliberate-looking degrade, but on a real outage the landing lies.
  Decide and document (one `isError` line if surfacing is preferred).

---

## 3. Dead weight shipped to every visitor

### 3.1 🔴 848 KB of Font Awesome Pro CSS, proxied through the app, for zero icons
- [layout.tsx:38-41](anything/apps/web/src/app/layout.tsx) loads
  `/fontawesome/releases/v6.3.0/css/pro.min.css?token=2c15cc0cc7` as a
  **render-blocking stylesheet in `<head>` on every page**.
- [next.config.js:25-32](anything/apps/web/next.config.js) rewrites `/fontawesome/*`
  to `https://ka-p.fontawesome.com/*` — so each visitor's stylesheet request is
  **proxied through the Next server** (on Vercel: a function invocation + egress per
  page view). Verified live: 200, `text/css`, **848,520 bytes**.
- App-wide Font Awesome usage: **zero** (`lucide-react` is the icon system — grep
  `fa-solid|fa-regular|fa-brands|FontAwesome` → 0 hits).
- The `token=2c15cc0cc7` is a Font Awesome **Pro kit token committed to the repo** —
  someone's paid kit credential, billable and revocable (create.xyz export leftover).
This is the single cheapest CWV win available (the P10.4 Lighthouse gate currently
holds LCP/FCP/JS-weight at *warn*; the §3.2 image-weight fight self-hosted an 11 KB
hero while this ships 848 KB of unused CSS). It is also a G11 egress violation
(every visitor transits a third-party CDN with a trackable token) — the same class of
issue S3 closed for images.
**Fix (Backlog #30)**: delete the `<link>` and the rewrite; regenerate/revoke the FA
kit token out-of-band (it's in git history).

### 3.2 🟠 CTA-band texture breaks in production CSP
[page.tsx:258](anything/apps/web/src/app/page.tsx) paints
`https://www.transparenttextures.com/patterns/carbon-fibre.png`. With the Blob token
set (production posture), [security-headers.js:66-72](anything/apps/web/security-headers.js)
pins `img-src` to `'self' blob: <blob-host> <tile-origin>` — the texture is
**silently blocked in prod** (works in keyless dev, which is why it survives). Same
class as the create.xyz hero the P10.4 gate caught. Inline the texture as a data URI,
self-host it, or drop it (it renders at `opacity-10` — barely visible).

### 3.3 🟡 No SEO/link-preview surface on a public marketplace
- No `robots.ts`/`robots.txt`, no `sitemap.ts` (checked `src/app` and `public/`).
- No `openGraph`/`twitter` metadata; one global `<title>` for every route
  ([layout.tsx:11-25](anything/apps/web/src/app/layout.tsx)) — all pages are
  `'use client'`, so no route exports its own `metadata`; a shared gig link renders
  as a bare URL in chat/social cards, and `/gigs/[id]`—the growth surface—can't be
  indexed distinctly.
**Fix**: `robots.ts` + `sitemap.ts` (landing, legal, contact, search, published gig
ids), `generateMetadata` for `/gigs/[id]` (needs a server wrapper page or metadata
export — pairs with the RSC refactor in REFACTOR_GUIDE §4.5), OG defaults in layout.

---

## 4. Missing design / dev decisions (blocking the fixes above)

| # | Decision needed | Blocks | Notes |
|---|---|---|---|
| D1 | **Anonymous/consumer read surface**: public browse page vs auth-walled funnel | §2.8, §2.10, #33 | PRD flows say sign-up-first, but three marketing CTAs promise browsing. Cheapest honest option: public `/gigs` list reusing `GET /api/gigs` (already public) + the existing public search. |
| D2 | **Transactional email provider** (Resend / Postmark / SES) | §2.4 (reset), verification, future digests | Nothing in the repo sends email today. See §5.3 for the env contract to add. |
| D3 | **Post-auth landing**: keep `/` or route by role to dashboards | §2.8 | One-line change in signin default callback + session-aware nav either way. |
| D4 | **PARTY scope for alpha**: build minimal consumer scope or remove "Personal Account"** | §2.10, #33 | CLAUDE.md §6.3 defines the target model (deny-by-default + PARTY matrix row). |
| D5 | **Conversation URL scheme**: `?conversation=` param vs `/messages/[id]` route | §2.9, #32 | Param is a 1-file change and PRD-sufficient ("survive refresh"). |
| D6 | **FeaturedTonight outage behavior**: marketing empty state vs error state | §2.11 | Either is defensible — document the choice in the component header. |

---

## 5. Environment variables

### 5.1 Referenced by code but missing from `.env.example` (contract drift)

The repo's own house rule (DEV_TIMELINE §6) is that every variable lives in
`.env.example` **and** the §6 table. These fell through:

| Variable | Where read | How to find/generate & set | Why it matters |
|---|---|---|---|
| `NEXT_PUBLIC_CREATE_AUTH_PROVIDERS` | [SocialSignInButtons.tsx:62](anything/apps/web/src/components/SocialSignInButtons.tsx) | CSV of enabled providers from the known set `google,apple`. Set it to exactly the providers whose server creds exist (e.g. `google`). **Build-time public var**: set in `.env.local` and in Vercel (Production+Preview), then **redeploy** — `NEXT_PUBLIC_*` values are baked into the client bundle. | Without it the social buttons render `null` even when `GOOGLE_CLIENT_ID/SECRET` are correctly set — the server flow self-activates but has no UI entry point (§2.5). The DEV_TIMELINE §6 row also mislabels it as embed config — it gates sign-in UI. |
| `BASE_URL` | [scripts/lhci-gate.ts:17](anything/apps/web/scripts/lhci-gate.ts), [scripts/axe-smoke.ts:24](anything/apps/web/scripts/axe-smoke.ts) | Optional override for the gates' target origin; defaults to `http://localhost:4000`. Set only when pointing `yarn gate:axe` / `yarn gate:lhci` at a non-local server. Never set in Vercel. | Undocumented, so nobody knows the gates can run against a deployed URL. |
| `RLS_URL` / `OWNER_URL` / `FORCE_SEED` | [scripts/verify-rls.mjs:27](anything/apps/web/scripts/verify-rls.mjs), [scripts/seed.ts:27](anything/apps/web/scripts/seed.ts) | Script-only (documented in DEV_TIMELINE §6, deliberately never set in Vercel) — but absent from `.env.example`, which claims to be the whole contract. Add as a commented "scripts only" block. | A dev reading only `.env.example` can't run `yarn db:verify-rls`. |

### 5.2 In `.env.example` but missing from the DEV_TIMELINE §6 table

`RATE_LIMIT_STORE`, `PREVIEW_ACCOUNTS_SECRET`, `NEON_LOCAL_PROXY`,
`CREATE_BUILDER_EMBED` (S1/P10.4-era vars) — the table predates them. Fixed in this
audit's DEV_TIMELINE §6 update; listed here so reviewers know the table changed.

### 5.3 Not set anywhere yet, but required for correctness (operator actions)

These are configured in code and **fail quiet** without values — the §4.6 ops runbook
covers most; restated here with the *why*:

| Variable | How to find/generate | How to set | Why (what silently breaks without it) |
|---|---|---|---|
| `CRON_SECRET` | `openssl rand -hex 32` | `openssl rand -hex 32 \| tr -d '\n' \| vercel env add CRON_SECRET production` (piped — keeps it out of shell history) | [vercel.json](anything/apps/web/vercel.json) schedules `/api/payouts/release` and `/api/retention/purge` daily; both require `Authorization: Bearer <CRON_SECRET>` ([release/route.ts:28-30](anything/apps/web/src/app/api/payouts/release/route.ts)). Unset ⇒ Vercel sends no bearer ⇒ **escrow never releases and the GDPR retention purge never runs** — a compliance failure, not just a bug. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Dashboard → Storage → Blob → Connect Project (auto-injected); locally `vercel env pull` | Injected on connect | Without it images store inline as data-URLs (row bloat) **and** CSP `img-src` stays at broad `https:` ([security-headers.js:66](anything/apps/web/security-headers.js)) — the S3 egress lockdown only engages when the token exists. |
| `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Project Settings → Client Keys | Both vars, same value, Production+Preview | Error tracking is a no-op without them — alpha incidents (incident-runbook G9) have no signal. |
| `WEB_PUSH_VAPID_PUBLIC_KEY` / `…_PRIVATE_KEY` / `…_SUBJECT` | `npx web-push generate-vapid-keys`; subject = `mailto:` contact | Private key as Sensitive; public key is client-safe | The whole S9 push surface is inert (subscribe 503s, fan-out no-ops, UI toggle disabled). Fine to defer — but it's a shipped feature a flag away. |
| `GOOGLE_CLIENT_ID/SECRET` (+ `NEXT_PUBLIC_CREATE_AUTH_PROVIDERS=google`) | Google Cloud Console → Credentials → OAuth 2.0 Client (authorized redirect: `<origin>/api/auth/callback/google`) | Secret as Sensitive; redeploy after the public var | Social sign-in stays invisible otherwise (§2.5). Apple equivalents ≤6-month JWT expiry — calendar it (already noted in §6 table). |

### 5.4 Missing because the capability is missing (add when D2 lands)

Proposed contract for the email decision (§4 D2) — **not yet read by any code**:

```bash
# Transactional email (D2). Resend example — swap for the chosen provider.
# Find: resend.com → API Keys → Create. Sensitive; server-only.
RESEND_API_KEY=
# From-address on a verified sending domain (SPF/DKIM configured at the provider).
EMAIL_FROM="AfterDark <no-reply@afterdark.example>"
```

Why: password reset (§2.4), email verification, and any future notification digest
all need a sender. Until these exist, no email-dependent flow should be wired on.

Stripe keys remain deliberately unset (key-gated by design, P8) — already documented
in `.env.example` and §6; nothing new here.

---

## 6. What was NOT found (so nobody re-audits it)

- **No broken internal `<Link>` targets**: every static href resolves to a real route
  (full href↔route cross-check; the only 404-ish path was the FA stylesheet, §3.1,
  which turned out to be a proxy, i.e. worse). Admin `#anchor` links resolve.
- Footer legal links are real and versioned (P2.1); "Company" column was already
  trimmed to existing destinations with an in-code rationale.
- Contact page is deliberately mailto-only (documented anti-PII-form choice).
- `AUTH_SECRET_ENCRYPTION_KEY` is correctly retired everywhere.
- SQL stays parameterized; no new authZ gaps observed in the routes read during this
  audit (the matrix + CI gate hold).
