/**
 * Per-request RLS context (TENANT_GUARDRAIL §6.2; migrations/0004_rls.sql).
 *
 * Runs a query inside a short transaction that first sets the
 * `app.user_id` / `app.role` settings the RLS policies key on
 * (`set_config(..., true)` = transaction-local, so nothing leaks across
 * pooled connections).
 *
 * While the app connects as the table-owner role the policies are dormant
 * and this wrapper is a no-op safety net; once DATABASE_URL points at the
 * dedicated non-owner role (see the migration header), routes touching
 * tenant tables must run their statements through it.
 */

import type { NeonQueryPromise } from '@neondatabase/serverless';
import sql from './sql';

export interface RlsUser {
  id: string;
  role?: string | null;
}

/** An UNAWAITED neon tagged-template call (awaiting it would run it outside the transaction). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PendingQuery = NeonQueryPromise<false, false, any>;

/**
 * Executes `query` (an UNAWAITED neon tagged-template call) with the RLS
 * context applied. Returns that query's rows.
 *
 *   const rows = await withRlsContext(user, sql`SELECT * FROM gigs`);
 */
export async function withRlsContext<T>(user: RlsUser, query: PendingQuery): Promise<T> {
  const results = await sql.transaction([
    sql`SELECT set_config('app.user_id', ${user.id}, true),
               set_config('app.role', ${user.role ?? ''}, true)` as unknown as PendingQuery,
    query,
  ]);
  return results[1] as T;
}
