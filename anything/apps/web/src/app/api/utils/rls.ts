/**
 * Per-request RLS context (TENANT_GUARDRAIL §6.2; migrations/0004_rls.sql +
 * 0014_rls_completion.sql).
 *
 * Runs one or more queries inside a short transaction that first sets the
 * `app.user_id` / `app.role` settings the RLS policies key on
 * (`set_config(..., true)` = transaction-local, so nothing leaks across
 * pooled connections).
 *
 * While the app connects as the table-owner role the policies are dormant
 * and this wrapper is a no-op safety net; once DATABASE_URL points at the
 * dedicated non-owner role (docs/rls-cutover.md), routes touching tenant
 * tables MUST run their statements through it — an unwrapped query reads
 * only public rows and writes nothing.
 *
 * System paths (cron, Stripe webhook, erasure bookkeeping) run under
 * SERVICE_CONTEXT: policies in 0014 grant the SERVICE role exactly the
 * cross-tenant writes those jobs need, so `payouts`/`shifts` stay writable
 * with no human in the loop while remaining closed to every user context.
 */

import type { NeonQueryPromise } from '@neondatabase/serverless';
import sql from './sql';

export interface RlsUser {
  id: string;
  role?: string | null;
}

/** Context for system actors (cron release, webhook, retention purge…). */
export function serviceContext(systemActorId: string): RlsUser {
  return { id: systemActorId, role: 'SERVICE' };
}

/** An UNAWAITED neon tagged-template call (awaiting it would run it outside the transaction). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PendingQuery = NeonQueryPromise<false, false, any>;
/**
 * What callers may pass: the tagged-template form types as NeonQueryPromise,
 * the function-call form (`sql(text, values)`, used by the update builders)
 * types as a plain promise — both are lazy Neon queries at runtime.
 */
type AcceptedQuery = PendingQuery | PromiseLike<unknown>;

/**
 * Executes one UNAWAITED neon tagged-template call — or an array of them,
 * atomically, in order — with the RLS context applied. Returns that query's
 * rows (single form) or each query's rows in order (array form), exactly
 * like `sql.transaction` minus the context row.
 *
 *   const rows = await withRlsContext(user, sql`SELECT * FROM gigs`);
 *   const [a, b] = await withRlsContext(user, [sql`…`, sql`…`]);
 */
export async function withRlsContext<T>(user: RlsUser, query: AcceptedQuery): Promise<T>;
export async function withRlsContext<T extends unknown[]>(
  user: RlsUser,
  queries: AcceptedQuery[]
): Promise<T>;
export async function withRlsContext(
  user: RlsUser,
  queryOrQueries: AcceptedQuery | AcceptedQuery[]
): Promise<unknown> {
  const queries = (Array.isArray(queryOrQueries)
    ? queryOrQueries
    : [queryOrQueries]) as PendingQuery[];
  const results = await sql.transaction([
    sql`SELECT set_config('app.user_id', ${user.id}, true),
               set_config('app.role', ${user.role ?? ''}, true)` as unknown as PendingQuery,
    ...queries,
  ]);
  const rows = results.slice(1);
  return Array.isArray(queryOrQueries) ? rows : rows[0];
}
