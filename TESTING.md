# TESTING — AfterDark

> How to verify the app end-to-end: automated suites, manual flows, security probes, and the
> shared preview accounts. Companion to [CLAUDE.md](CLAUDE.md) (architecture) and
> [DEV_TIMELINE.MD](DEV_TIMELINE.MD) (status). Last full pass: **2026-07-30** (P1 slice landed —
> every check below was executed and green on that date).

---

## 1. What is real vs. mock (test accordingly)

Real, DB-backed, and covered by the procedures below: auth (email/password + social),
onboarding/roles, talent & venue profiles, settings (account, password, 2FA), **gig create →
publish → browse → detail → lifecycle transitions**, public talent directory, landing "Hot Gigs
Tonight". Still UI-with-sample-data (do not file bugs against these): messages, schedule
calendar, applicants (both roles), venue "Live Tonight" rail (labeled *Sample*), talent
dashboard stats. Full matrix: CLAUDE.md §4.

## 2. Shared preview accounts (deployed site + any DB seeded with them)

One account per role instance, for the whole dev team. Created by
`yarn db:preview-accounts` (idempotent; re-run to re-assert). They exist on the **production
Neon DB** (project `after-dark`), so they work on the deployed site right now.

| Role | Email | Password | What you can exercise |
|---|---|---|---|
| TALENT | `talent.preview@afterdark.dev` | `AfterDark-Talent-2026!` | Browse gigs, gig detail + fee estimator, profile editor, settings |
| VENUE | `venue.preview@afterdark.dev` | `AfterDark-Venue-2026!` | Venue dashboard (real Open Gigs + lifecycle actions), create-gig wizard, talent directory |
| PARTY | `party.preview@afterdark.dev` | `AfterDark-Party-2026!` | Read-only discovery: landing, browse, gig detail. All principal writes are role-denied server-side |

The venue account owns three starter gigs (2 published, 1 draft) so dashboards and browse are
never empty. ⚠️ These are **shared alpha credentials committed to the repo** — rotate them
(edit `scripts/create-preview-accounts.ts`, re-run, update this table) before any real user or
real payment data enters the database.

## 3. Automated suites

Run from `anything/apps/web` (all wired into CI on every PR):

```bash
yarn test        # vitest — 285 tests, no DB needed (route handlers run against mocked sql/auth)
yarn typecheck   # tsc --noEmit, strict
yarn build       # production build — must print the full route table (all routes marked ƒ)
```

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
- **Security**: middleware auth gate + callbackUrl smuggling, **nonce CSP** (per-request nonce,
  no `unsafe-inline` script-src), security headers, Sentry PII scrub, RLS migration structure,
  TOTP RFC vectors, AES-GCM tampering, rate-limit windows, redirect sanitizer, migration
  runner ordering.

## 4. Local end-to-end verification (repeatable procedure)

1. **Disposable DB**: create a Neon branch of the `after-dark` project (console or MCP), copy
   its **pooled** connection string.
2. **Env**: in `anything/apps/web/.env.local` set `DATABASE_URL`, `AUTH_SECRET_ENCRYPTION_KEY`
   (`openssl rand -base64 32`), `BETTER_AUTH_SECRET` (another random), `BETTER_AUTH_URL=http://localhost:4000`.
3. **Schema + data**:
   ```bash
   yarn db:migrate          # applies 0001–0004
   yarn db:seed             # demo venue+talent, 4 gigs across statuses (refuses prod)
   yarn db:preview-accounts # the §2 accounts (safe anywhere, idempotent)
   ```
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
- Dashboard stats are real: Active Gigs, draft count, Filling Rate ("n of m"); Payouts/Time-to-
  Hire are visibly muted "unlocks with payments/applications" — not fake numbers.
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
- Card → detail → estimator as above. Submit is intentionally disabled ("coming soon" — P2).

**Party loop** (sign in as `party.preview@…`)
- Can browse all public surfaces; any principal write (e.g. `POST /api/gigs`) returns 403.

**Settings (any account)**
- Profile/account/password/2FA cards render and save; 2FA enrollment shows a locally-rendered
  QR (data URL — verify **no** request to any third-party QR host in the Network tab).

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

**CSP**: `curl -sI $BASE/ | grep -i content-security-policy` → `script-src 'self' 'nonce-…'
'strict-dynamic'` (a **fresh nonce per request** — run twice and diff), no `unsafe-inline` in
script-src, `frame-ancestors 'self'` (+ configured builder origins). Pages must load with an
**empty browser console** — a CSP regression shows up as blocked-script errors instantly.

**Sentry**: with no `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` set, zero Sentry network traffic.
With a DSN, trigger an error and confirm in the Sentry UI that the event has no cookies,
headers, email, or phone — only `user.id` (scrubber: `src/lib/sentry-scrub.ts` + tests).

## 7. RLS (staged defense-in-depth)

`migrations/0004_rls.sql` enables RLS + policies on `talent_profiles`, `venue_profiles`,
`gigs`, `audit_logs`, keyed on `current_setting('app.user_id'/'app.role')` (set per-request via
`src/app/api/utils/rls.ts`). While the app connects as the Neon **owner role the policies are
dormant** (owners bypass non-forced RLS) — activation = create a non-owner role, GRANT, point
`DATABASE_URL` at it (see the migration header). To verify enforcement on a Neon branch:

```sql
SET ROLE <non_owner_role>;
SELECT set_config('app.user_id', '<some-user-id>', false);
SELECT count(*) FROM gigs;              -- only PUBLISHED + own-venue rows
UPDATE gigs SET status='DRAFT' WHERE id='<other-venues-gig>';  -- 0 rows
DELETE FROM audit_logs WHERE id = 1;    -- denied (append-only)
```

## 8. Known gaps (do not report as regressions)

- Applications/messages/schedule/live-ops/notifications backends land in P2–P5; their UIs are
  present with sample data (labeled where misleading).
- 2FA is hand-rolled-but-hardened; **recovery codes** arrive with the better-auth twoFactor
  plugin migration (DEV_TIMELINE Backlog #17 — deliberately deferred; rationale documented
  there). 2FA is a settings control and does not yet challenge at sign-in.
- Map views deferred (Backlog #1). Multi-select browse filters refine client-side within the
  fetched page until the API grows array params.
- `tonightOnly` uses a rolling 24h window (fixed 2026-07-30; was a UTC calendar-date match
  that dropped late-night gigs).
