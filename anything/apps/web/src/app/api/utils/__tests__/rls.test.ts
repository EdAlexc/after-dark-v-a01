import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * withRlsContext / serviceContext (S12) — the mechanism every governed route
 * rides. The real enforcement is proven against an enforcing role
 * (scripts/verify-rls.mjs, wired into CI); this suite pins the wrapper's
 * contract: context first, same transaction, results unwrapped in order.
 */

const mocks = vi.hoisted(() => {
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    __lazy: true,
    text: Array.isArray(strings) ? strings.join('¤') : String(strings),
    values,
  }));
  const transaction = vi.fn(
    async (queries: unknown[]): Promise<unknown[]> => queries.map((_query, index) => [{ row: index }])
  );
  (sql as unknown as { transaction: unknown }).transaction = transaction;
  return { sql, transaction };
});
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { serviceContext, withRlsContext } from '../rls';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withRlsContext', () => {
  it('runs the context row FIRST, in the SAME transaction as the query', async () => {
    const query = mocks.sql`SELECT 1` as unknown as PromiseLike<unknown>;
    await withRlsContext({ id: 'u1', role: 'TALENT' }, query);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const batch = mocks.transaction.mock.calls[0][0] as Array<{ text: string; values: unknown[] }>;
    expect(batch).toHaveLength(2);
    expect(batch[0].text).toContain('set_config');
    expect(batch[1]).toBe(query);
  });

  it('binds app.user_id and app.role from the caller', async () => {
    await withRlsContext(
      { id: 'user-42', role: 'VENUE' },
      mocks.sql`SELECT 1` as unknown as PromiseLike<unknown>
    );
    const contextCall = mocks.sql.mock.calls.find(([strings]) =>
      (Array.isArray(strings) ? strings.join('') : String(strings)).includes('set_config')
    );
    expect(contextCall).toBeDefined();
    expect(contextCall?.slice(1)).toEqual(['user-42', 'VENUE']);
  });

  it("defaults a missing role to '' — never a privileged fallback", async () => {
    await withRlsContext({ id: 'user-1' }, mocks.sql`SELECT 1` as unknown as PromiseLike<unknown>);
    const contextCall = mocks.sql.mock.calls.find(([strings]) =>
      (Array.isArray(strings) ? strings.join('') : String(strings)).includes('set_config')
    );
    expect(contextCall?.slice(1)).toEqual(['user-1', '']);
  });

  it('single form returns the query rows, with the context row stripped', async () => {
    mocks.transaction.mockResolvedValueOnce([[{ ctx: true }], [{ id: 'g1' }, { id: 'g2' }]]);
    const rows = await withRlsContext<Array<{ id: string }>>(
      { id: 'u1' },
      mocks.sql`SELECT id FROM gigs` as unknown as PromiseLike<unknown>
    );
    expect(rows).toEqual([{ id: 'g1' }, { id: 'g2' }]);
  });

  it('array form runs atomically (ONE transaction) and returns results in order', async () => {
    mocks.transaction.mockResolvedValueOnce([[{ ctx: true }], [{ a: 1 }], [{ b: 2 }], [{ c: 3 }]]);
    const [first, second, third] = await withRlsContext<
      [Array<{ a: number }>, Array<{ b: number }>, Array<{ c: number }>]
    >({ id: 'u1', role: 'VENUE' }, [
      mocks.sql`SELECT 1` as unknown as PromiseLike<unknown>,
      mocks.sql`SELECT 2` as unknown as PromiseLike<unknown>,
      mocks.sql`SELECT 3` as unknown as PromiseLike<unknown>,
    ]);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(first).toEqual([{ a: 1 }]);
    expect(second).toEqual([{ b: 2 }]);
    expect(third).toEqual([{ c: 3 }]);
  });

  it('propagates transaction failures — a denied write must never be swallowed', async () => {
    mocks.transaction.mockRejectedValueOnce(new Error('row-level security violation'));
    await expect(
      withRlsContext({ id: 'u1' }, mocks.sql`INSERT INTO gigs` as unknown as PromiseLike<unknown>)
    ).rejects.toThrow(/row-level security/);
  });
});

describe('serviceContext', () => {
  it('produces the SERVICE role for system actors', () => {
    expect(serviceContext('system:cron')).toEqual({ id: 'system:cron', role: 'SERVICE' });
  });

  it('flows through to set_config as SERVICE', async () => {
    await withRlsContext(
      serviceContext('push-fanout'),
      mocks.sql`SELECT 1` as unknown as PromiseLike<unknown>
    );
    const contextCall = mocks.sql.mock.calls.find(([strings]) =>
      (Array.isArray(strings) ? strings.join('') : String(strings)).includes('set_config')
    );
    expect(contextCall?.slice(1)).toEqual(['push-fanout', 'SERVICE']);
  });
});
