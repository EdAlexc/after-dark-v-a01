# RLS cutover runbook

> TENANT_GUARDRAIL §6.2 · DEV_TIMELINE P2.4 · Backlog #25.
> Status as of **2026-07-30**: policies written (`0004`), GRANTs written (`0006`), enforcement
> **verified against a real non-owner role** (`yarn db:verify-rls`, 10/10). The production
> connection has **not** been switched — steps 3–4 below are the remaining work.

## What is already true

| Piece | State |
|---|---|
| Policies on `talent_profiles`, `venue_profiles`, `gigs`, `audit_logs` | ✅ `migrations/0004_rls.sql` |
| Least-privilege GRANTs (DML only, no DDL, no UPDATE/DELETE on `audit_logs`) | ✅ `migrations/0006_compliance_spine.sql`, applied conditionally when the role exists |
| Per-request context helper | ✅ `src/app/api/utils/rls.ts` (`withRlsContext`) |
| Proof the policies actually block cross-tenant reads/writes | ✅ `scripts/verify-rls.mjs` — 10/10 on a Neon branch |
| App connects as that role | ⛔ **Not yet — see below** |

Until the last row flips, the policies are **inert in production**: Postgres table owners
bypass non-forced RLS. Nothing is broken, and nothing is protected by RLS either — app-level
authZ (proven by the P2.3 matrix suite) is doing all the work.

## Why the switch is not a one-line env change

Neon's HTTP driver is **stateless per query**: there is no session to hold
`SET app.user_id` across statements. So every query that needs request context must run as a
small transaction that sets the context and then runs the statement — which is exactly what
`withRlsContext` does.

The consequence, measured during verification:

> Connected as `afterdark_app` **without** setting `app.user_id`, a venue sees only
> `PUBLISHED` gigs — its own drafts vanish. The venue dashboard would silently go half-empty.

So the cutover is gated on wiring, not on the env var. Flipping `DATABASE_URL` first would
degrade the product without warning.

## Cutover steps

### 1. Create the role (per environment)

Neon Console → Roles → **New Role** → `afterdark_app` (or `neonctl roles create --name
afterdark_app`). Neon generates the password; it must never enter git.

### 2. Apply GRANTs

```bash
DATABASE_URL=<owner connection> yarn db:migrate
```

`0006` is idempotent and re-runnable; its GRANT block is a no-op until the role exists, so this
is the step that actually attaches privileges. Verify:

```sql
SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
FROM information_schema.role_table_grants
WHERE grantee = 'afterdark_app' GROUP BY table_name;
-- audit_logs must show only INSERT,SELECT
```

### 3. Wire request context (**the remaining engineering work**)

Route every query that touches an RLS-governed table through `withRlsContext`:

| Route | Why it needs context |
|---|---|
| `api/venue/gigs` GET | Reads the venue's own non-PUBLISHED gigs |
| `api/gigs/[id]` GET, PATCH | Owner reads/writes non-PUBLISHED gigs |
| `api/gigs` POST | Insert must satisfy the ownership `WITH CHECK` |
| `api/talent/profile` PUT | Write scoped by `user_id = app.user_id` |
| `api/venue/profile` PUT | Same |

Public reads (`GET /api/gigs`, `GET /api/talent`) need **no** context — their policies are
`USING (true)` / `status = 'PUBLISHED'`.

`api/settings`, `api/account/*` and `api/user/role` touch only `user`, which is deliberately
**not** RLS-governed (better-auth must manage it before a session exists).

Wiring is safe to land *before* the cutover: while the app still connects as the owner,
`set_config` runs harmlessly and behaviour is unchanged. Do it in that order.

### 4. Flip the connection

Set `DATABASE_URL` to the `afterdark_app` **pooled** connection string in Vercel (Production
and Preview), then redeploy. Keep the owner string somewhere safe — migrations still need it.

### 5. Verify

```bash
OWNER_URL=<owner> RLS_URL=<afterdark_app> yarn db:verify-rls   # expect 10/10
```

Then walk TESTING.md §5 against the deployed app. The canary for a botched cutover is a venue
dashboard whose Open Gigs table renders but shows no drafts.

## Rollback

Point `DATABASE_URL` back at the owner connection and redeploy. The policies go inert again;
no data changes, no migration to undo.
