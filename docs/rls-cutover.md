# RLS cutover runbook

> TENANT_GUARDRAIL §6.2 · DEV_TIMELINE P2.4 → slice **S2** · Backlog #25.
> Status as of **2026-07-31 (S2)**: policies **complete** (`0004` + `0014`), GRANTs written
> (`0006`/`0011`/`0013`/`0014` + the living `scripts/grants.sql`), and **every route that
> touches an RLS-governed table now runs its statements through `withRlsContext`** — the
> engineering work this runbook used to gate on is done. What remains is the operator flip
> (steps 1–2 and 4–5 below): create the role, apply grants, point `DATABASE_URL` at it,
> verify.

## What is already true

| Piece | State |
|---|---|
| Policies on the 0004 tables (`talent_profiles`, `venue_profiles`, `gigs`, `audit_logs`) | ✅ `migrations/0004_rls.sql` |
| Policies on every P3–P9 table (applications, conversations/messages, availabilities, shifts, payouts, stripe, reports, notifications) | ✅ shipped in-file with 0007–0011 |
| **Completion policies** — SERVICE/ADMIN platform context, gig applicant/completed carve-outs, messages mark-read split, erasure pseudonymization, payout checkout INSERT, `legal_holds` | ✅ `migrations/0014_rls_completion.sql` (S2) |
| Least-privilege GRANTs | ✅ conditional blocks in 0006/0011/0013/0014 **+ re-runnable `yarn db:grants`** (see below) |
| Per-request context helper | ✅ `src/app/api/utils/rls.ts` (`withRlsContext`, single query or atomic batch, + `serviceContext` for cron/webhook/erasure) |
| **Route wiring** | ✅ **complete — S2, repaired and machine-checked in S12 (2026-08-17).** The §7 audit falsified the original S2 claim: three surfaces that post-date the S2 sweep ran bare `sql` — `/api/stream`'s SSE fingerprint (realtime would freeze post-cutover), `/api/gigs/match-preview` (worked only by leaning implicitly on public-read policies), and `/api/user/role`'s profile INSERTs (onboarding would 500). S12 wired all three **and added `test/rls-wiring.test.ts`**: a structural gate, registry-style like the authz matrix, that fails CI whenever a file touching a governed table never enters an RLS context — this claim can no longer silently rot. |
| Proof the policies enforce | ✅ `scripts/verify-rls.mjs` — **23 checks**: isolation, the 0014 semantics (applicant deep links, mark-read, SERVICE-only payout release + pseudonymization, stripe_events deny-by-default), and the S12 wiring canaries (SSE fingerprint with/without context; onboarding INSERT denied bare / allowed contexted). **Runs on every PR**: the CI `alpha-gates` job provisions a throwaway non-owner role (`scripts/ci-rls-role.mjs` + `yarn db:grants`) on its Postgres and executes the full suite as that role over the credential-faithful WebSocket tunnel (`scripts/pool-sql.mjs`). |
| App connects as the non-owner role | ⛔ **The remaining operator step — see below** |

Until the flip, the policies are **inert in production**: Postgres table owners bypass
non-forced RLS. Nothing is broken, and nothing is protected by RLS either — app-level authZ
(proven by the P2.3 matrix suite) is doing all the work. The wiring is a no-op while
owner-connected (`set_config` runs harmlessly), which is exactly why it was safe to land
first.

## Why the switch needs the wiring (kept for context)

Neon's HTTP driver is **stateless per query**: there is no session to hold
`SET app.user_id` across statements, so every governed query runs as a small transaction
that sets the context first — `withRlsContext`. Measured during verification:

> Connected as `afterdark_app` **without** setting `app.user_id`, a venue sees only
> `PUBLISHED` gigs — its own drafts vanish. The venue dashboard would silently go half-empty.

The 2026-07-31 route audit for S2 found the same failure shape in every post-P2 slice
(empty message threads, a cron that releases nothing, erasure that cannot pseudonymize),
which is why the wiring now covers **all** governed routes and why 0014 adds the SERVICE
context policies the system paths need.

## Cutover steps (operator)

### 1. Create the role (per environment)

Neon Console → Roles → **New Role** → `afterdark_app` (or `neonctl roles create --name
afterdark_app`). Neon generates the password; it must never enter git.

### 2. Apply the GRANT set

```bash
DATABASE_URL=<owner connection> yarn db:grants
```

`scripts/grants.sql` is the complete, idempotent, **re-runnable** privilege set — it exists
because the migration runner is forward-only: if the role is created after 0006/0013/0014
were applied, their conditional GRANT blocks already no-opped and will never run again.
(On a fresh database where the role exists first, `yarn db:migrate` alone is sufficient;
running `yarn db:grants` afterwards is still harmless.) Verify:

```sql
SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
FROM information_schema.role_table_grants
WHERE grantee = 'afterdark_app' GROUP BY table_name;
-- audit_logs must show only INSERT,SELECT,UPDATE — and the UPDATE must be
-- column-scoped to actor_id (check information_schema.column_privileges).
```

### 3. Wire request context — ✅ done (S2)

Nothing to do. For review, the wiring pattern is:

- user routes: `withRlsContext(user, sql`…`)` or `withRlsContext(user, [q1, q2, …])`
  for atomic batches (hire, check-in/out, availability day-save);
- system paths: `withRlsContext(serviceContext('system:cron'), …)` — escrow release,
  Stripe webhook, retention purge, erasure pseudonymization;
- public reads (`GET /api/gigs`, `GET /api/talent`, anonymous gig detail) intentionally
  carry **no** context — their policies are `USING (true)` / marketplace-visible statuses.

`api/settings`, `api/account/*` (except the audit rewrite) and `api/user/role` touch only
better-auth tables, which are deliberately **not** RLS-governed.

### 4. Flip the connection

Set `DATABASE_URL` to the `afterdark_app` **pooled** connection string in Vercel (Production
and Preview), then redeploy. Keep the owner string somewhere safe — migrations and
`yarn db:grants` still need it.

### 5. Verify

```bash
OWNER_URL=<owner> RLS_URL=<afterdark_app> yarn db:verify-rls   # expect 23/23
```

Then walk TESTING.md §5 against the deployed app. Canaries for a botched cutover, in the
order they'd surface: a venue dashboard whose Open Gigs table shows no drafts; message
threads that never mark read; **a message/notification stream that never updates without a
manual refresh (the S12 SSE-fingerprint class)**; onboarding failing at the role step (the
S12 profile-INSERT class); a talent dashboard missing FILLED bookings; the 09:00 UTC
escrow cron reporting `released: 0` despite due payouts.

## Rollback

Point `DATABASE_URL` back at the owner connection and redeploy. The policies go inert again;
no data changes, no migration to undo.
