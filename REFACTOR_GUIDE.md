# REFACTOR_GUIDE — AfterDark (2026-08-05)

> Opportunities for improving **code safety, functionality, modularity, and comment
> standardization** — found during the 2026-08-05 audit (findings with user-visible
> impact live in [CURRENT_STATUS.md](CURRENT_STATUS.md); this doc is about code
> structure). Nothing here changes behavior; each item is a pure-refactor slice with
> its blast radius and a test story. **No code was changed in this audit.**

## 0. Ground rules (non-negotiable, from CLAUDE.md §11)

- Behavior-preserving: `yarn test` (791), `yarn typecheck`, `yarn lint` green before
  **and** after every extraction; UI refactors get a before/after screenshot pass on
  the affected screens (TESTING.md checklists).
- **Never rewrite platform files**: [auth.ts](anything/apps/web/src/lib/auth.ts),
  [api/auth/[...all]/route.ts](anything/apps/web/src/app/api/auth/[...all]/route.ts),
  [SocialSignInButtons.tsx](anything/apps/web/src/components/SocialSignInButtons.tsx)
  carry `DO NOT REWRITE` banners — extend via config/composition only.
- Never widen a query's tenant scope while "simplifying"; money stays integer cents;
  every route keeps zod + role check + its integration suite.
- Reuse the shared API utilities (`route-kit`, `auth-guard`, `validation`,
  `rate-limit`, `audit`, `sql-builder`, …) — the server side already has the right
  shape; most of this guide is about giving the **client** the same discipline.

## 1. Inventory (what the numbers say)

| Signal | Count | Reading |
|---|---|---|
| Hand-rolled `fetch('/api/…')` in pages/components | **61** | No shared client; every caller re-implements error handling and response typing |
| Files hardcoding `#00FFCC` | **34** | The brand accent is a string, not a token; a rebrand or a11y contrast fix is a 34-file diff |
| Identical lines between the two browse pages | **~197** | Page-shell + filter-rail duplication (see §4.2) |
| Decorative (dead) notification bells | **7 pages** | Header was copy-pasted per page instead of extracted (§4.1) |
| Largest client components | settings **1116**, create-gig **910**, venue dash **737**, talent dash **646** | Monoliths mixing data, form state, and markup (§4.3) |
| `any` / `as any` outside tests | **3** | Typing discipline is otherwise excellent — worth finishing the job |
| API routes without an authz-matrix row | **0** (CI-enforced) | Keep this gate; it is the spine everything else leans on |

## 2. Code safety

### 2.1 One typed API client instead of 61 raw fetches
Every page repeats:

```ts
const res = await fetch('/api/venue/gigs');
if (!res.ok) throw new Error('Failed to load gigs');
return res.json() as Promise<VenueGigsResponse>; // unchecked cast
```

Failure modes: the `as Promise<T>` cast is a lie when the route's envelope changes
(route-kit's `ApiError` body `{ error }` is parsed ad-hoc or not at all); 401/403
handling is inconsistent (some pages toast, some render forever-skeletons); nobody
attaches `Retry-After` handling for the S1 429s.

**Proposal** — `src/lib/api-client.ts` (~60 lines):

```ts
export class ApiClientError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfter?: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiClientError(res.status, body?.error ?? res.statusText,
      Number(res.headers.get('Retry-After')) || undefined);
  }
  return res.json() as Promise<T>;
}
```

Then migrate call sites mechanically (`fetch(` → `api<Shape>(`), one page per PR.
This is also where a future `ApiClientError.status === 403` → suspension/role
redirect can live once instead of 13 times (the DashboardSidebar suspension probe
already wants this seam).

### 2.2 Shared query-key registry (the SSE contract is stringly-typed)
[RealtimeInvalidator.tsx](anything/apps/web/src/components/RealtimeInvalidator.tsx)
invalidates whatever TanStack keys the **server** emits from `/api/stream` — the
key vocabulary lives twice (server emitters, client `useQuery` sites) with no type
linking them. A typo in either silently kills realtime for that surface.
**Proposal**: `src/lib/query-keys.ts` exporting `const queryKeys = { conversations:
['conversations'], venueGigs: ['venue','gigs'], … } as const`, imported by both the
client hooks and the server-side emit sites (it's a plain array module — safe to
share). The SSE payload then type-checks against `keyof typeof queryKeys` in tests.

### 2.3 Nested interactive elements (a11y correctness)
[FeaturedTonight.tsx:87-89](anything/apps/web/src/components/FeaturedTonight.tsx)
renders a `<Button>View Details</Button>` **inside** the card's `<Link>` — nested
interactive controls (invalid HTML semantics; axe flags as `nested-interactive` at
*serious*, currently warn-only in the P10.4 gate; screen readers announce a
non-operable button). Same pattern risk anywhere a Card wraps in a Link.
**Fix**: render the CTA as a styled `<span>` (it's decorative — the Link is the
control), or hoist the Link to only wrap the image/title. Sweep: `grep -n '<Link' -A6`
over card components. This directly serves Backlog #13 (a11y deep pass).

### 2.4 Inline `<style dangerouslySetInnerHTML>` for keyframes
[page.tsx:414-426](anything/apps/web/src/app/page.tsx) injects a `bounce` keyframe
via `dangerouslySetInnerHTML`. It works (style-src allows inline) but normalizes a
dangerous API for something Tailwind already does — move to `global.css` (or
Tailwind's `animate-bounce`, which is nearly identical). Zero-risk cleanup that keeps
`dangerouslySetInnerHTML` grep-clean (today's single hit makes real injection sinks
harder to spot in review).

### 2.5 Finish the typing job (3 `any`s) and the error-state convention
- Replace the 3 remaining non-test `any`s with real shapes (they're response casts).
- Adopt one loading/empty/error triple per data surface: today
  [FeaturedTonight.tsx](anything/apps/web/src/components/FeaturedTonight.tsx) has
  loading+empty but **no error branch** (outage renders marketing copy —
  CURRENT_STATUS §2.11/D6), while other pages toast, and some render dead skeletons.
  Pick the pattern (suggest: inline quiet error card + `ApiClientError` from §2.1),
  document it in this file, and apply as pages get touched — not as a big-bang.

## 3. Functionality hardening (client mirrors of server guarantees)

### 3.1 `useRequireRole` — client-side mirror of the authz matrix
Server-side authZ is machine-checked, but **no dashboard page checks role
client-side**: a talent user reaching `/dashboard/venue/create-gig` (one click from
the hero CTA) fills a 4-step wizard and 403s at publish; venue users see the talent
shell with `role="talent"` hardcoded (CURRENT_STATUS §2.8).
**Proposal**: a tiny hook reading `/api/user/role` (already exists) via the §2.1
client:

```ts
useRequireRole('venue'); // redirects to the caller's real dashboard + toast
```

mounted at the top of each role-scoped page (12 call sites). Not a security control
(the server already enforces) — a UX control, so it belongs client-side by design.

### 3.2 Session-aware marketing nav
The landing nav is static JSX ([page.tsx:23-60](anything/apps/web/src/app/page.tsx))
while `PostGigButton` beside it is session-aware — extract `MarketingNav` that swaps
Sign In/Join Now for Dashboard/avatar when a session exists (fixes CURRENT_STATUS
§2.8 and the §2.3 mobile collision in one component, and becomes the mount point for
the landing mobile drawer).

### 3.3 Route constants
Paths like `/dashboard/talent/browse` are string literals across ~20 files (and the
talent "My Applications" nav points at the `applicants` path — works, but the naming
mismatch invites future breakage). A `src/lib/routes.ts` with typed helpers
(`routes.gig(id)`, `routes.dashboard(role)`) makes moves/renames one-line diffs and
kills the `/gigs/${encodeURIComponent(String(gig.id))}` vs `/gigs/${gig.id}`
inconsistency (both exist today).

## 4. Modularity

### 4.1 Extract `DashboardHeader` (kills the 7 fake bells)
Every dashboard page hand-rolls the same header row (title, subtitle, bell, action
buttons) — 7 of them with a **dead decorative bell**, 4 with the real
`NotificationsBell`, 3 with none (CURRENT_STATUS §2.7 has the file list).
**Proposal**: `DashboardHeader({ title, subtitle, actions? })` that always mounts the
real bell + the mobile spacing already duplicated per page. Deletes ~30 lines × 11
pages, and the wireframes' "bell on every screen" requirement becomes structural
instead of per-page discipline.

### 4.2 Extract the browse shell (197 duplicated lines)
[talent/browse](anything/apps/web/src/app/dashboard/talent/browse/page.tsx) (612) and
[venue/browse](anything/apps/web/src/app/dashboard/venue/browse/page.tsx) (606) share
the filter-rail scaffolding, chip groups, rate-range slider, sticky header, and
list/skeleton grid — verbatim. Extract `BrowseShell` (layout + rail + header slots)
and `FilterChipGroup`/`RateRangeFilter` primitives; keep the data hooks per page
(different endpoints, different cards). Follow-on: the gig-card markup on
landing/browse/dashboards differs only by badge/CTA — one `GigCard` with variant
props serves all three (PRD §5 names Gig Card a core reusable component).

### 4.3 Split the monolith pages along their visual seams
Worst offenders and their natural fracture lines (each section is already a
self-contained JSX block with its own query/mutation):

| Page | Lines | Extract |
|---|---|---|
| [settings](anything/apps/web/src/app/dashboard/settings/page.tsx) | 1116 | One component per card: `ProfileCard`, `PasswordCard`, `TwoFactorCard`, `NotificationPrefsCard`, `DangerZone` (export/delete) |
| [venue/create-gig](anything/apps/web/src/app/dashboard/venue/create-gig/page.tsx) | 910 | Per wizard step (4) + `LiveAnalysisRail`; the step state machine stays in the page |
| [venue dashboard](anything/apps/web/src/app/dashboard/venue/page.tsx) | 737 | `KpiCards`, `OpenGigsTable`, `ApplicantsPanel`, `ActiveOperationsTable` |
| [talent dashboard](anything/apps/web/src/app/dashboard/talent/page.tsx) | 646 | `StatCards`, `HotTonightRail`, `UpcomingBookings`, `MyApplications` |

Mechanical moves (props in, JSX out), no state redesign. Do them opportunistically —
whichever page a feature slice touches next gets split first, never as a standalone
mega-PR.

### 4.4 Design tokens for the brand palette
`#00FFCC` appears in **34 files** (plus `#121212`/`#1E1E1E` backgrounds and the
white/α ladder). Tailwind v4 supports first-class theme tokens in CSS:

```css
/* global.css */
@theme {
  --color-accent: #00ffcc;
  --color-surface: #121212;
  --color-card: #1e1e1e;
}
```

then `bg-accent text-accent border-accent/20 …` everywhere. Benefits: the §2.1
CURRENT_STATUS class of bug (`text-black` pasted onto a dark surface) becomes
greppable; a contrast retune for Backlog #13 is a one-line change; shadcn's semantic
tokens (`--primary` etc., already themed via the root `dark` class) stop competing
with hex literals. Migrate with find/replace per file, screenshot-diffing as you go.

### 4.5 The RSC seam (bigger, schedule deliberately)
Everything is `'use client'` with a `force-dynamic` root (nonce CSP). That costs:
no per-route `metadata` (CURRENT_STATUS §3.3), LCP/FCP budgets stuck at *warn*
(P10.4), and every byte of page logic in the client bundle. The public, read-mostly
routes (`/`, `/gigs/[id]`, `/legal/*`, `/search`) are the natural first candidates
for server components with client islands — `/gigs/[id]` alone unlocks
`generateMetadata` (OG cards for shared gigs) and a smaller bundle. This is the one
item here that is architecture, not cleanup: slice it like a P-phase (schema of its
own, gate checks, TESTING.md pass), and only after the cheap wins above.

## 5. Comment standardization

The repo has a **strong implicit house style** — make it explicit and hold new code
to it. Codified from the best existing examples:

1. **File header**: every non-trivial module opens with a `/** … */` block stating
   *what it is, why it exists, and which slice/finding shaped it* — see
   [money.ts](anything/apps/web/src/app/api/utils/money.ts) ("The 5% marketplace fee
   lives HERE and only here"), [middleware.ts](anything/apps/web/src/middleware.ts)
   (auth gate + CSP rationale), [FeaturedTonight.tsx](anything/apps/web/src/components/FeaturedTonight.tsx).
2. **Inline comments state constraints, not narration**: the codebase's best comments
   explain *why the code can't be simpler* ("a naive EXISTS recurses, 42P17";
   "Yarn 1.22 honors yarnPath and hands off"). Never "what the next line does".
3. **Slice/finding references** (`(P3.4)`, `(S1, Backlog #16)`, `(G11)`) tie code to
   the planning docs — keep them; they make `git blame` unnecessary.
4. **Platform banners** (`⚠ ANYTHING PLATFORM — DO NOT REWRITE`) are load-bearing
   guardrails — never trim them; replicate the Safe/Unsafe list format if new
   platform-touching files appear.
5. **Migration references by number** (`0017 definer probe`) — keep.

Where the codebase falls short of its own style (fix opportunistically):
- **Dashboard pages**: most of the 600–1100-line pages have *no file header* — the
  reader can't tell which wireframe page/slice a screen implements without the audit
  docs. One header block each (wireframe page №, slice, data sources) as §4.3 splits
  them.
- **[sql.ts](anything/apps/web/src/app/api/utils/sql.ts)** is the one bare `api/utils`
  module (platform-inherited); a two-line header saying it's the create.xyz Neon
  binding + where `NEON_LOCAL_PROXY` hooks in would spare every reader a detour.
- **Dead-control apologies**: comments like "Social placeholders" mark known-dead UI —
  when CURRENT_STATUS §2.6 items are fixed, remove the markers too (a comment
  excusing a dead control is a TODO wearing a disguise; prefer `TODO(#29):` form so
  backlog grep finds them).

## 6. Test conventions for refactors

- Extracted components inherit the co-located `__tests__/` pattern; a pure extraction
  PR must not change any existing test — if it has to, the extraction changed
  behavior (stop and look).
- New shared modules (§2.1 client, §2.2 keys, §3.3 routes) each get a unit suite on
  day one (error envelope parsing, key uniqueness, route builder encoding).
- Keep the authz-matrix CI gate untouched by all of this — it's route-level and
  refactor-proof by design.
- UI extractions ride the existing gates: axe smoke (10 screens) + Lighthouse
  budgets + the TESTING.md manual checklists for the touched screens.

## 7. Suggested sequencing (cheap → structural)

| Order | Item | Size | Risk | Pairs with |
|---|---|---|---|---|
| 1 | §2.4 keyframes → CSS; §2.5 `any`s | XS | none | any PR |
| 2 | §2.1 API client + §2.2 query keys | S | low | Backlog #29 fixes touching those pages |
| 3 | §4.1 DashboardHeader (real bell everywhere) | S | low | CURRENT_STATUS §2.7 |
| 4 | §3.2 MarketingNav (session-aware + mobile drawer) | S | low | CURRENT_STATUS §2.3/§2.8 |
| 5 | §2.3 nested-interactive sweep | S | low | Backlog #13 |
| 6 | §4.4 design tokens | M | low (visual diff) | Backlog #13 contrast work |
| 7 | §4.2 BrowseShell + GigCard | M | med | next browse-touching slice |
| 8 | §3.1 useRequireRole + §3.3 routes | M | med | Backlog #29/#33 |
| 9 | §4.3 page splits | M×4 | med | whichever slice touches each page |
| 10 | §4.5 RSC seam for public routes | L | high | Backlog #34 (SEO), CWV budgets |
