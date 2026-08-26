import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * RLS wiring coverage gate (S12) — the structural counterpart of the authz
 * matrix, for tenant isolation.
 *
 * The failure mode this guards: a route reads or writes an RLS-governed table
 * with bare `sql`, works perfectly while the app connects as the table owner
 * (policies dormant), then silently reads nothing / writes nothing after the
 * cutover flips DATABASE_URL to the non-owner role. S9's /api/stream and the
 * S7 match-preview shipped exactly that way — found by the 2026-08-17 audit
 * (DEV_TIMELINE §7.2 A1), fixed in S12.
 *
 * Mechanics:
 *  - the governed-table list is DERIVED from migrations/*.sql (`ALTER TABLE x
 *    ENABLE ROW LEVEL SECURITY`), so new governed tables join the gate
 *    automatically;
 *  - every non-test file under src/app/api that imports the sql module AND
 *    references a governed table in a SQL position (FROM/JOIN/INTO/UPDATE)
 *    must have a row in RLS_WIRING below — an unlisted file fails, a stale
 *    row fails;
 *  - `wrapped` rows must actually reference withRlsContext/serviceContext;
 *    `public-read` rows must contain no writes to governed tables;
 *    `policy-insert` rows may ONLY insert into tables whose policies accept
 *    context-less INSERTs (WITH CHECK (true) — deliberate, documented).
 *
 * Honest limitation (stated, not hidden): this is a static presence check.
 * It proves a file *entered* the RLS mechanism, not that every individual
 * statement is wrapped — that end-to-end proof lives in
 * scripts/verify-rls.mjs against a real enforcing role (wired into CI, S12).
 */

const API_ROOT = join(__dirname, '..', 'src', 'app', 'api');
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

// ── Governed tables, derived from the migrations ─────────────────────────────

function governedTables(): string[] {
  const tables = new Set<string>();
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const match of text.matchAll(/ALTER TABLE\s+"?(\w+)"?\s+ENABLE ROW LEVEL SECURITY/gi)) {
      tables.add(match[1]);
    }
  }
  return [...tables].sort();
}

const GOVERNED = governedTables();

// Tables whose INSERT policies deliberately accept any context
// (`WITH CHECK (true)`): cross-user notifications, the append-only audit
// trail, and the no-PII analytics events. A file declared `policy-insert`
// may only ever INSERT, and only into these.
const ANY_CONTEXT_INSERT_TABLES = ['notifications', 'audit_logs', 'events'];

// ── The registry: file → declared wiring mode ────────────────────────────────
//
//  wrapped        file runs its governed statements through withRlsContext /
//                 serviceContext (spot-check: the import must be present)
//  public-read    file reads ONLY public-policy rows with no context by
//                 design (anon surfaces have no context to set) — writes to
//                 governed tables are forbidden
//  policy-insert  file's only governed statements are INSERTs into
//                 ANY_CONTEXT_INSERT_TABLES

type WiringMode = 'wrapped' | 'public-read' | 'policy-insert' | 'builder';

const RLS_WIRING: Record<string, WiringMode> = {
  // Routes — user/service context
  'admin/audit-logs/route.ts': 'wrapped',
  'admin/gigs/[id]/route.ts': 'wrapped',
  'admin/gigs/route.ts': 'wrapped',
  'admin/overview/route.ts': 'wrapped',
  'admin/reports/[id]/route.ts': 'wrapped',
  'admin/reports/route.ts': 'wrapped',
  'admin/users/route.ts': 'wrapped',
  'applications/[id]/route.ts': 'wrapped',
  'availability/route.ts': 'wrapped',
  'conversations/[id]/accept-rate/route.ts': 'wrapped',
  'conversations/[id]/messages/route.ts': 'wrapped',
  'conversations/route.ts': 'wrapped',
  'gigs/[id]/apply/route.ts': 'wrapped',
  'gigs/[id]/route.ts': 'wrapped',
  'gigs/match-preview/route.ts': 'wrapped', // S12 — was bare (§7.2 A1)
  'gigs/route.ts': 'wrapped',
  'notifications/route.ts': 'wrapped',
  'payouts/release/route.ts': 'wrapped',
  'push/subscribe/route.ts': 'wrapped',
  'reports/route.ts': 'wrapped',
  'retention/purge/route.ts': 'wrapped',
  'reviews/route.ts': 'wrapped',
  'search/route.ts': 'public-read', // anon FTS over public columns — no context exists
  'shifts/[id]/route.ts': 'wrapped',
  'stream/route.ts': 'wrapped', // S12 — was bare; a bare fingerprint kills SSE post-cutover
  'stripe/connect/route.ts': 'wrapped',
  'stripe/webhook/route.ts': 'wrapped',
  'talent/[id]/route.ts': 'public-read', // S20 anon talent detail — public columns only
  'talent/applications/route.ts': 'wrapped',
  'talent/profile/route.ts': 'wrapped',
  'talent/route.ts': 'public-read', // anon talent directory — public columns only
  'talent/shifts/route.ts': 'wrapped',
  'user/role/route.ts': 'wrapped', // S12 — profile INSERTs need the owner context
  'venue/applications/route.ts': 'wrapped',
  'venue/gigs/route.ts': 'wrapped',
  'venue/profile/route.ts': 'wrapped',
  'venue/saved-talent/route.ts': 'wrapped', // S20 bookmarks — owner policy (0024)
  'venue/shifts/route.ts': 'wrapped',
  'venue/stats/route.ts': 'wrapped',
  'venues/[id]/route.ts': 'public-read', // S19 anon venue detail — public columns only
  'venues/route.ts': 'public-read', // S19 anon venue directory — public columns only

  // Shared utils that execute governed SQL themselves
  'utils/account-data.ts': 'wrapped', // export = subject context; erasure = SERVICE
  'utils/audit.ts': 'policy-insert', // append-only trail, WITH CHECK (true)
  'utils/events.ts': 'policy-insert', // S6 analytics, events_insert_any_context
  'utils/telemetry.ts': 'wrapped', // S18 RUM/timings — SERVICE-context writes only (0022)
  'utils/notify.ts': 'policy-insert', // cross-user by design, WITH CHECK (true)
  'utils/push.ts': 'wrapped', // fan-out reads/prunes under SERVICE context

  // Pure query builders — never execute; the importing route owns the context
  // duty, and the builder's table refs are attributed to it (see scan below).
  'utils/gigs-query.ts': 'builder',
  'utils/match-query.ts': 'builder',
  'utils/search-query.ts': 'builder',
  'utils/talent-query.ts': 'builder',
  'utils/venue-query.ts': 'builder',
};

// ── File discovery ───────────────────────────────────────────────────────────

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...walk(full));
    } else if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

const importsSqlModule = (text: string): boolean => /from\s+['"][^'"]*\/sql['"]/.test(text);

/** Governed tables referenced in a SQL position anywhere in the file. */
function governedRefs(text: string): string[] {
  return GOVERNED.filter((table) =>
    new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE)\\s+"?${table}"?\\b`, 'i').test(text)
  );
}

/** Governed tables the file WRITES (INSERT/UPDATE/DELETE). */
function governedWrites(text: string): Array<{ table: string; verb: string }> {
  const writes: Array<{ table: string; verb: string }> = [];
  for (const table of GOVERNED) {
    for (const [verb, pattern] of [
      ['INSERT', `INSERT\\s+INTO\\s+"?${table}"?\\b`],
      ['UPDATE', `UPDATE\\s+"?${table}"?\\b`],
      ['DELETE', `DELETE\\s+FROM\\s+"?${table}"?\\b`],
    ] as const) {
      if (new RegExp(pattern, 'i').test(text)) writes.push({ table, verb });
    }
  }
  return writes;
}

interface ScannedFile {
  key: string;
  /** The file's own source — 'wrapped' presence is checked here. */
  ownText: string;
  /** Own source + any imported builders' — refs and writes span both. */
  combinedText: string;
  refs: string[];
}

const allFiles = walk(API_ROOT)
  .map((file) => ({
    key: relative(API_ROOT, file).split('\\').join('/'),
    text: readFileSync(file, 'utf8'),
  }))
  // The wrapper itself is the mechanism, not a call site (its doc comment
  // shows a `FROM gigs` usage example).
  .filter(({ key }) => key !== 'utils/rls.ts');

/**
 * Query-builder modules (governed table names, no sql import): their refs are
 * attributed to every file importing them, since that importer executes the
 * built statement and therefore owns the context duty.
 */
const builders = allFiles.filter(
  ({ text }) => !importsSqlModule(text) && governedRefs(text).length > 0
);
const importsBuilder = (text: string, builderKey: string): boolean => {
  const basename = builderKey.replace(/^.*\//, '').replace(/\.ts$/, '');
  return new RegExp(`from\\s+['"][^'"]*\\/${basename}['"]`).test(text);
};

const scanned: ScannedFile[] = allFiles
  .filter(({ text }) => importsSqlModule(text))
  .map(({ key, text }) => {
    const imported = builders.filter((builder) => importsBuilder(text, builder.key));
    const combinedText = [text, ...imported.map((builder) => builder.text)].join('\n');
    return { key, ownText: text, combinedText, refs: governedRefs(combinedText) };
  })
  .filter((entry) => entry.refs.length > 0);

// ── The gate ─────────────────────────────────────────────────────────────────

describe('RLS wiring coverage (S12)', () => {
  it('derives a plausible governed-table list from the migrations', () => {
    // Canary against the derivation regex silently matching nothing.
    for (const expected of ['gigs', 'messages', 'shifts', 'payouts', 'notifications']) {
      expect(GOVERNED).toContain(expected);
    }
    expect(GOVERNED.length).toBeGreaterThanOrEqual(15);
  });

  it('every file executing or building governed SQL has a wiring declaration', () => {
    const undeclared = [
      ...scanned
        .filter(({ key }) => !(key in RLS_WIRING))
        .map(({ key, refs }) => `${key} (executes: ${refs.join(', ')})`),
      ...builders
        .filter(({ key }) => RLS_WIRING[key] !== 'builder')
        .map(({ key }) => `${key} (builder — declare mode 'builder')`),
    ];
    expect(
      undeclared,
      `Undeclared governed SQL. Post-cutover these statements read only public rows and write nothing. ` +
        `Wrap them in withRlsContext/serviceContext (api/utils/rls.ts) and add the file to RLS_WIRING ` +
        `in ${relative(process.cwd(), __filename)} — or declare a justified exemption mode there.`
    ).toEqual([]);
  });

  it('has no stale registry rows', () => {
    const scannedKeys = new Set(scanned.map(({ key }) => key));
    const builderKeys = new Set(builders.map(({ key }) => key));
    const stale = Object.entries(RLS_WIRING)
      .filter(([key, mode]) =>
        mode === 'builder' ? !builderKeys.has(key) : !scannedKeys.has(key)
      )
      .map(([key]) => key);
    expect(
      stale,
      'RLS_WIRING rows point at files that no longer execute (or build) governed SQL — remove them.'
    ).toEqual([]);
  });

  it("'wrapped' files actually enter an RLS context", () => {
    const missing = scanned
      .filter(({ key }) => RLS_WIRING[key] === 'wrapped')
      .filter(({ ownText }) => !/withRlsContext|serviceContext/.test(ownText))
      .map(({ key }) => key);
    expect(missing).toEqual([]);
  });

  it("'public-read' files never write a governed table", () => {
    const offending = scanned
      .filter(({ key }) => RLS_WIRING[key] === 'public-read')
      .flatMap(({ key, combinedText }) =>
        governedWrites(combinedText).map(({ table, verb }) => `${key}: ${verb} ${table}`)
      );
    expect(
      offending,
      'A public-read surface acquired a governed write — it needs withRlsContext and a mode change.'
    ).toEqual([]);
  });

  it("'policy-insert' files only INSERT, and only into any-context-insert tables", () => {
    const offending: string[] = [];
    for (const { key, combinedText, refs } of scanned) {
      if (RLS_WIRING[key] !== 'policy-insert') continue;
      for (const { table, verb } of governedWrites(combinedText)) {
        if (verb !== 'INSERT' || !ANY_CONTEXT_INSERT_TABLES.includes(table)) {
          offending.push(`${key}: ${verb} ${table}`);
        }
      }
      // Reads of governed tables are context-scoped — a policy-insert file
      // that starts SELECTing governed rows needs wrapping instead.
      for (const table of refs) {
        const readsIt = new RegExp(`\\b(?:FROM|JOIN)\\s+"?${table}"?\\b`, 'i').test(combinedText);
        const insertOnly = new RegExp(`INSERT\\s+INTO\\s+"?${table}"?\\b`, 'i').test(combinedText);
        if (readsIt && !insertOnly) offending.push(`${key}: reads ${table}`);
      }
    }
    expect(offending).toEqual([]);
  });

  it('the any-context-insert allowlist matches the committed policies', () => {
    // notifications (0007) and events (0016) INSERT with CHECK (true);
    // audit_logs (0004) appends with CHECK (true). If a policy tightens,
    // this fails and the emitter needs a context instead.
    const m0007 = readFileSync(join(MIGRATIONS_DIR, '0007_applications.sql'), 'utf8');
    expect(m0007).toMatch(/notifications_own[\s\S]*?WITH CHECK \(true\)/);
    const m0004 = readFileSync(join(MIGRATIONS_DIR, '0004_rls.sql'), 'utf8');
    expect(m0004).toMatch(/audit_logs_append[\s\S]*?WITH CHECK \(true\)/);
    const m0016 = readFileSync(join(MIGRATIONS_DIR, '0016_events.sql'), 'utf8');
    expect(m0016).toMatch(/events_insert_any_context[\s\S]*?WITH CHECK\s*\(/);
  });
});
