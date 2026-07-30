#!/usr/bin/env node
/**
 * Proves the RLS policies in migrations/0004_rls.sql actually enforce
 * (TENANT_GUARDRAIL §6.2, DEV_TIMELINE P2.4).
 *
 * Why this exists as a script rather than a vitest case: RLS can only be
 * observed against a **real Postgres connection using a non-owner role**.
 * Table owners bypass non-forced RLS, so a test that connects as the owner —
 * or one that mocks the driver — proves nothing at all. The committed unit
 * test (`test/rls-migration.test.ts`) only checks the policy SQL's structure.
 *
 * Usage (never against production):
 *
 *   1. Create a Neon branch and apply migrations to it.
 *   2. Create the role, then re-run `yarn db:migrate` so 0006 GRANTs to it:
 *        CREATE ROLE afterdark_app WITH LOGIN PASSWORD '…' NOBYPASSRLS;
 *   3. Seed it: `yarn db:seed`
 *   4. Run:
 *        OWNER_URL=<owner conn>  RLS_URL=<afterdark_app conn>  yarn db:verify-rls
 *
 * Exits non-zero if any isolation guarantee fails.
 */

import { neon } from '@neondatabase/serverless';

if (!process.env.RLS_URL || !process.env.OWNER_URL) {
  console.error('Set OWNER_URL (table owner) and RLS_URL (afterdark_app role). See header.');
  process.exit(2);
}

const sql = neon(process.env.RLS_URL);
const owner = neon(process.env.OWNER_URL);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? '✓ PASS' : '✗ FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Seeds a second tenant so "another venue's data" is a real thing to attack. */
async function ensureRivalTenant() {
  await owner`
    INSERT INTO "user" (id, name, email, "emailVerified", role)
    VALUES ('rls-rival-user', 'Rival Room', 'rls-rival@afterdark.test', false, 'VENUE')
    ON CONFLICT (id) DO NOTHING
  `;
  const venue = await owner`
    INSERT INTO venue_profiles (user_id, venue_name, neighborhood, address)
    VALUES ('rls-rival-user', 'Rival Room', 'SoHo', '1 Rival St')
    ON CONFLICT (user_id) DO UPDATE SET venue_name = EXCLUDED.venue_name
    RETURNING id
  `;
  const existing = await owner`SELECT id FROM gigs WHERE title = 'RLS Rival SECRET Draft' LIMIT 1`;
  if (existing.length > 0) return existing[0].id;
  const gig = await owner`
    INSERT INTO gigs (venue_id, title, role_needed, base_rate, status)
    VALUES (${venue[0].id}, 'RLS Rival SECRET Draft', 'DJ', 999, 'DRAFT')
    RETURNING id
  `;
  return gig[0].id;
}

const rivalGigId = await ensureRivalTenant();
const victim = await owner`
  SELECT user_id FROM venue_profiles WHERE user_id <> 'rls-rival-user' LIMIT 1
`;
if (victim.length === 0) {
  console.error('No second venue found — run `yarn db:seed` against this branch first.');
  process.exit(2);
}
const venueUser = victim[0].user_id;

// 0. The premise: we must not be a superuser/owner, or nothing below means anything.
const [who] = await sql`
  SELECT current_user AS u,
         (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass
`;
check(
  'connects as a non-owner role without BYPASSRLS',
  who.bypass === false,
  `current_user=${who.u} bypassrls=${who.bypass}`
);

// 1. No request context → only world-readable rows.
const noCtx = await sql`SELECT status, count(*)::int AS n FROM gigs GROUP BY status`;
check(
  'context-less read exposes only PUBLISHED gigs',
  noCtx.every((row) => row.status === 'PUBLISHED'),
  `saw: ${noCtx.map((r) => `${r.status}×${r.n}`).join(', ') || 'none'}`
);

// 2. Another tenant's draft is invisible even when its id is known.
const direct = await sql`SELECT id FROM gigs WHERE id = ${rivalGigId}`;
check("another venue's DRAFT is invisible by direct id", direct.length === 0);

// 3. …and still invisible when the attacker supplies their own valid context.
const asVictim = await sql.transaction([
  sql`SELECT set_config('app.user_id', ${venueUser}, true)`,
  sql`SELECT id FROM gigs WHERE id = ${rivalGigId}`,
]);
check("venue A cannot read venue B's draft with its own context set", asVictim[1].length === 0);

// 4. Positive control: the policy is scoping, not blanket-denying.
const ownDrafts = await sql.transaction([
  sql`SELECT set_config('app.user_id', ${venueUser}, true)`,
  sql`SELECT id FROM gigs WHERE status <> 'PUBLISHED'`,
]);
check('venue A CAN read its own non-published gigs with context', ownDrafts[1].length > 0, `rows=${ownDrafts[1].length}`);

// 5. Cross-tenant write is a no-op, not an error we might swallow.
const hijack = await sql.transaction([
  sql`SELECT set_config('app.user_id', ${venueUser}, true)`,
  sql`UPDATE gigs SET base_rate = 1 WHERE id = ${rivalGigId} RETURNING id`,
]);
check("venue A cannot UPDATE venue B's gig", hijack[1].length === 0);

// 6/7. Audit trail is append-only by privilege, not merely by convention.
for (const [label, statement] of [
  ['UPDATEd', sql`UPDATE audit_logs SET action = 'tampered' WHERE true`],
  ['DELETEd', sql`DELETE FROM audit_logs WHERE true`],
]) {
  let blocked = false;
  let detail = `${label} unexpectedly succeeded`;
  try {
    await statement;
  } catch (error) {
    blocked = /permission denied/i.test(error.message);
    detail = error.message.split('\n')[0];
  }
  check(`audit_logs cannot be ${label}`, blocked, detail);
}

// 8. No schema changes from the app role.
let ddlBlocked = false;
try {
  await sql`CREATE TABLE rls_should_not_exist (id int)`;
} catch (error) {
  ddlBlocked = /permission denied/i.test(error.message);
}
check('app role cannot run DDL', ddlBlocked);

// 9. The app must still work: public surfaces stay readable.
const [talent] = await sql`SELECT count(*)::int AS n FROM talent_profiles`;
check('public talent directory still readable', talent.n > 0, `rows=${talent.n}`);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} isolation checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
