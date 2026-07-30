/**
 * Small parameterized-SQL builders shared by the profile/settings routes.
 *
 * Invariants (TENANT_GUARDRAIL §5 A03):
 *  - identifiers come from code-owned literals, never from request data
 *    (zod strips unknown keys first); a strict identifier check enforces it;
 *  - every VALUE travels via $n placeholders.
 */

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${JSON.stringify(name)}`);
  }
  return name;
}

/** JSON-stringify preserving `undefined` (= "field not provided"). */
export function jsonify(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}

/** Shallow copy without `undefined` entries, so spreads can't erase fields. */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export interface BuiltStatement {
  text: string;
  values: unknown[];
}

/**
 * Builds `UPDATE <table> SET … WHERE <keyColumn> = $n RETURNING <returning>`
 * from the defined entries of `fields`. Returns null when nothing to update.
 */
export function buildUpdateByKey(options: {
  table: string;
  fields: Record<string, unknown>;
  keyColumn: string;
  keyValue: unknown;
  returning?: string;
}): BuiltStatement | null {
  const table = assertIdentifier(options.table);
  const keyColumn = assertIdentifier(options.keyColumn);

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  for (const [column, value] of Object.entries(options.fields)) {
    if (value === undefined) continue;
    setClauses.push(`"${assertIdentifier(column)}" = $${index}`);
    values.push(value);
    index++;
  }
  if (setClauses.length === 0) return null;

  values.push(options.keyValue);
  const returning = options.returning ?? '*';
  return {
    text: `UPDATE "${table}" SET ${setClauses.join(', ')} WHERE "${keyColumn}" = $${index} RETURNING ${returning}`,
    values,
  };
}
