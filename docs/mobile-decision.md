# Mobile Strategy — PWA-first, Expo Deferred (S11, Backlog #4 → #24)

> Status: **Recommended** (product owner ratifies by merging; reversible until the
> Expo scaffold is deleted in the #24 flatten). Written 2026-07-31 as part of slice S11.

## Decision

**The PWA is the mobile app through alpha and GA.** The Expo/React Native workspace
(`anything/apps/mobile`) stays deferred: it is not built, not deployed, and not
maintained beyond keeping the repo installable — and it is the thing the #24 repo
flatten removes when executed.

## Why

1. **The scaffold ships nothing.** `apps/mobile` renders `null` and is still branded
   "Anything mobile app" (create.xyz export state). There is no native investment to
   protect — deferral costs zero product surface.
2. **The PWA already covers the mobile loop.** P10.1–P10.2 shipped installability
   (manifest + maskable icons), an offline shell, a §6.6-compliant service worker, and
   S9 added Web Push — the one capability that historically forced native shells.
   Every alpha screen is responsive (mobile drawer, top-bar patterns, wireframe parity).
3. **The native path is expensive to keep alive.** All 10 committed Yarn patches exist
   for the mobile workspace's RN dependency graph, every Vercel deploy installs the
   mobile tree (Backlog #23), and the auth bridge (`/api/auth/token`,
   `/api/auth/expo-web-success`, `postMessage` finding §7.5) is attack surface that
   exists only for a client that doesn't.
4. **Nothing in the PRD's alpha/GA loop needs native APIs.** Check-in/out, messaging,
   payouts, discovery, push — all served by web platform APIs already in use. The
   candidates that would change this (NFC door hardware, background geolocation) are
   post-GA product ideas, not commitments.

## What this dictates for #24 (repo flatten)

The flatten happens **in the PWA-only shape**: `anything/apps/web` moves to the repo
root as a single-package repo (no workspaces), deleting `apps/mobile`, the 10 mobile-only
Yarn patches, and the Expo auth-bridge routes. That removes the Vercel Root Directory
footgun (§2.1) entirely.

**Sequencing constraint (why the flatten is not in this PR):** the move must land in the
same window as two operator-only dashboard changes — Vercel **Root Directory** must be
cleared (dashboard-only; `vercel.json` cannot express it) and **Include files outside
Root Directory** disabled. A repo where `main` and the dashboard disagree serves the
platform 404 on every path (the exact failure §2.1 documents). Execution plan:

1. Operator schedules a low-traffic window.
2. Land the flatten PR (mechanical: `git mv anything/apps/web/* .`, drop workspaces,
   delete mobile + patches + bridge routes + `EXPO_PUBLIC_PROXY_BASE_URL`, update the
   ~16 doc/CI path references).
3. Operator flips Root Directory to repo root before the deploy finishes building.
4. Verify: build log shows the Next route table; sign-in works (trusted origins are
   runtime-derived, unaffected).

## Revisit triggers

- A product commitment that requires native-only APIs (NFC check-in hardware,
  background location, App Store distribution as a market requirement).
- Web Push adoption in the alpha cohort proving insufficient for the Hot Tonight loop
  on iOS (iOS PWAs require Add-to-Home-Screen for push — measure before concluding).
- If revived: build fresh from current Expo tooling rather than this scaffold; the
  bearer-token auth bridge would need the §7.5 postMessage origin fix first.
