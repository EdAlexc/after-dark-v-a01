import { describe, expect, it, vi } from 'vitest';
import { createPoolSql } from '../scripts/pool-sql.mjs';

/**
 * The S12 verify-rls CI adapter (scripts/pool-sql.mjs): same tagged-template
 * + .transaction() surface as neon(), over a pg-style Pool. Docker isn't a
 * given on dev machines, so the adapter's logic is pinned here with a fake
 * pool; the live wire-auth run happens in the CI alpha-gates job.
 */

interface Call {
  text: string;
  values?: unknown[];
}

type Rows = Array<Record<string, unknown>>;
interface LazyQuery extends PromiseLike<Rows> {
  __lazyText: string;
  __lazyValues: unknown[];
}
interface PoolSqlTag {
  (strings: TemplateStringsArray, ...values: unknown[]): LazyQuery;
  transaction(queries: LazyQuery[]): Promise<Rows[]>;
}
const asTag = (tag: unknown): PoolSqlTag => tag as PoolSqlTag;

function fakePool() {
  const calls: Call[] = [];
  const clientCalls: Call[] = [];
  let released = 0;
  let failOn: string | null = null;
  const client = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      clientCalls.push({ text, values });
      if (failOn && text.includes(failOn)) throw new Error(`boom: ${failOn}`);
      return { rows: [{ echo: text }] };
    }),
    release: vi.fn(() => {
      released += 1;
    }),
  };
  return {
    pool: {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        return { rows: [{ echo: text }] };
      }),
      connect: vi.fn(async () => client),
    },
    calls,
    clientCalls,
    setFailOn: (needle: string) => {
      failOn = needle;
    },
    releasedCount: () => released,
  };
}

describe('createPoolSql', () => {
  it('converts template slots to $n placeholders in order', async () => {
    const { pool, calls } = fakePool();
    const sql = asTag(createPoolSql(pool));
    await sql`SELECT * FROM gigs WHERE id = ${'g1'} AND status = ${'DRAFT'}`;
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe('SELECT * FROM gigs WHERE id = $1 AND status = $2');
    expect(calls[0].values).toEqual(['g1', 'DRAFT']);
  });

  it('is lazy: nothing executes until awaited, and awaiting twice runs once', async () => {
    const { pool, calls } = fakePool();
    const sql = asTag(createPoolSql(pool));
    const query = sql`SELECT 1`;
    expect(calls).toHaveLength(0);
    await query;
    await query;
    expect(calls).toHaveLength(1);
  });

  it('resolves to rows, like the neon driver', async () => {
    const { pool } = fakePool();
    const sql = asTag(createPoolSql(pool));
    const rows = await sql`SELECT 1`;
    expect(rows).toEqual([{ echo: 'SELECT 1' }]);
  });

  it('transaction(): BEGIN → each query in order on ONE client → COMMIT, returning rows per query', async () => {
    const { pool, clientCalls, calls, releasedCount } = fakePool();
    const sql = asTag(createPoolSql(pool));
    const results = await sql.transaction([
      sql`SELECT set_config('app.user_id', ${'u1'}, true)`,
      sql`SELECT id FROM gigs WHERE venue_id = ${'v1'}`,
    ]);
    expect(clientCalls.map((c) => c.text)).toEqual([
      'BEGIN',
      "SELECT set_config('app.user_id', $1, true)",
      'SELECT id FROM gigs WHERE venue_id = $1',
      'COMMIT',
    ]);
    expect(clientCalls[1].values).toEqual(['u1']);
    // Batched queries must NOT also run on the pool path (double execution).
    expect(calls).toHaveLength(0);
    expect(results).toHaveLength(2);
    expect(releasedCount()).toBe(1);
  });

  it('transaction(): a failing statement ROLLs BACK, rethrows, and still releases the client', async () => {
    const { pool, clientCalls, setFailOn, releasedCount } = fakePool();
    setFailOn('INSERT INTO talent_profiles');
    const sql = asTag(createPoolSql(pool));
    await expect(
      sql.transaction([
        sql`SELECT set_config('app.user_id', ${'u1'}, true)`,
        sql`INSERT INTO talent_profiles (user_id) VALUES (${'u1'})`,
      ])
    ).rejects.toThrow(/boom/);
    expect(clientCalls.map((c) => c.text)).toEqual([
      'BEGIN',
      "SELECT set_config('app.user_id', $1, true)",
      'INSERT INTO talent_profiles (user_id) VALUES ($1)',
      'ROLLBACK',
    ]);
    expect(releasedCount()).toBe(1);
  });
});
