/**
 * Tagged-template + .transaction() adapter over a pg-style Pool (S12).
 *
 * scripts/verify-rls.mjs is written against neon()'s HTTP driver surface, but
 * in CI the local Neon proxy pins its own upstream credentials on the HTTP
 * path — role identity (the entire point of verify-rls) only survives the
 * WebSocket tunnel, where vanilla Postgres performs real wire auth. This
 * adapter exposes the same surface over a Pool so the script body runs
 * byte-identical in both modes.
 *
 * Contract (mirrors the neon driver):
 *  - `tag\`SELECT … ${v}\`` returns a LAZY thenable — nothing executes until
 *    awaited; awaiting resolves to rows.
 *  - `tag.transaction([q1, q2])` runs the unawaited queries in order on ONE
 *    client inside BEGIN/COMMIT (ROLLBACK + rethrow on failure) and returns
 *    each query's rows. Transaction-local `set_config(..., true)` therefore
 *    scopes exactly like it does on Neon.
 *
 * Unit-tested in test/pool-sql.test.ts with an injected fake pool; the
 * wire-auth reality is proven by verify-rls check 0 (current_user +
 * rolbypassrls) — a credential-rewriting proxy fails loudly, never silently.
 */

export function createPoolSql(pool) {
  const lazy = (text, values) => {
    let running = null;
    const run = () => (running ??= pool.query(text, values).then((result) => result.rows));
    return {
      __lazyText: text,
      __lazyValues: values,
      then: (onFulfilled, onRejected) => run().then(onFulfilled, onRejected),
      catch: (onRejected) => run().catch(onRejected),
    };
  };

  const tag = (strings, ...values) =>
    lazy(
      strings.reduce((acc, part, index) => acc + (index ? `$${index}` : '') + part, ''),
      values
    );

  tag.transaction = async (queries) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const query of queries) {
        results.push((await client.query(query.__lazyText, query.__lazyValues)).rows);
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  return tag;
}
