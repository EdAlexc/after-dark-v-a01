#!/usr/bin/env node
/**
 * Proves the RLS policies in migrations/0004_rls.sql + 0014_rls_completion.sql
 * actually enforce (TENANT_GUARDRAIL §6.2, DEV_TIMELINE P2.4 / slice S2).
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
 *   2. Create the role, then apply the GRANT set:
 *        CREATE ROLE afterdark_app WITH LOGIN PASSWORD '…' NOBYPASSRLS;
 *        DATABASE_URL=<owner conn> yarn db:grants
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

// 1. No request context → only marketplace-visible rows. Since 0014,
// FILLED/COMPLETED join PUBLISHED as world-readable (venue "gigs hosted"
// counts + applicant deep links); DRAFT/CANCELLED must never appear.
const MARKETPLACE_VISIBLE = ['PUBLISHED', 'FILLED', 'COMPLETED'];
const noCtx = await sql`SELECT status, count(*)::int AS n FROM gigs GROUP BY status`;
check(
  'context-less read exposes no DRAFT/CANCELLED gigs',
  noCtx.every((row) => MARKETPLACE_VISIBLE.includes(row.status)),
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

// ─── 0014 completion policies (slice S2) ─────────────────────────────────────

/** Seeds the fixtures the 0014 checks attack: an applicant on the rival's
 * draft, a thread with an unread message, a HELD payout, an audit row. */
async function ensureCompletionFixtures() {
  await owner`
    INSERT INTO "user" (id, name, email, "emailVerified", role)
    VALUES ('rls-applicant-user', 'Verify Talent', 'rls-applicant@afterdark.test', false, 'TALENT')
    ON CONFLICT (id) DO NOTHING
  `;
  const tp = await owner`
    INSERT INTO talent_profiles (user_id, stage_name)
    VALUES ('rls-applicant-user', 'Verify Talent')
    ON CONFLICT (user_id) DO UPDATE SET stage_name = EXCLUDED.stage_name
    RETURNING id
  `;
  await owner`
    INSERT INTO applications (gig_id, talent_id, cover_message)
    VALUES (${rivalGigId}, ${tp[0].id}, 'rls-verify')
    ON CONFLICT (gig_id, talent_id) DO NOTHING
  `;
  const conversation = await owner`
    INSERT INTO conversations (venue_user_id, counterpart_user_id, kind)
    VALUES (${venueUser}, 'rls-applicant-user', 'GIG')
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  const conversationId =
    conversation[0]?.id ??
    (
      await owner`
        SELECT id FROM conversations
        WHERE venue_user_id = ${venueUser} AND counterpart_user_id = 'rls-applicant-user'
        LIMIT 1
      `
    )[0].id;
  await owner`
    INSERT INTO messages (conversation_id, sender_id, content)
    SELECT ${conversationId}, 'rls-applicant-user', 'unread probe'
    WHERE NOT EXISTS (
      SELECT 1 FROM messages WHERE conversation_id = ${conversationId} AND content = 'unread probe'
    )
  `;
  // Re-arm the probe on re-runs: the mark-read check consumed it last time.
  await owner`
    UPDATE messages SET read_at = NULL
    WHERE conversation_id = ${conversationId} AND content = 'unread probe'
  `;
  const payout = await owner`
    INSERT INTO payouts (venue_user_id, talent_user_id, gross_cents, fee_cents, net_cents, status)
    SELECT ${venueUser}, 'rls-applicant-user', 10000, 500, 9500, 'HELD'
    WHERE NOT EXISTS (
      SELECT 1 FROM payouts WHERE talent_user_id = 'rls-applicant-user' AND status = 'HELD'
    )
    RETURNING id
  `;
  const payoutId =
    payout[0]?.id ??
    (
      await owner`
        SELECT id FROM payouts WHERE talent_user_id = 'rls-applicant-user' AND status = 'HELD' LIMIT 1
      `
    )[0].id;
  await owner`
    INSERT INTO audit_logs (actor_id, action, entity_type)
    SELECT 'rls-erasure-subject', 'rls.verify', 'test'
    WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE actor_id = 'rls-erasure-subject')
  `;
  return { conversationId, payoutId };
}

const fixtures = await ensureCompletionFixtures();

// 10. Applicant carve-out: an applicant reads the gig behind their
// application even while it is a DRAFT (deep links survive unpublish).
const asApplicant = await sql.transaction([
  sql`SELECT set_config('app.user_id', 'rls-applicant-user', true)`,
  sql`SELECT id FROM gigs WHERE id = ${rivalGigId}`,
]);
check('applicant CAN read the draft gig behind their application', asApplicant[1].length === 1);

// 11. …while a context-less read of the same draft still finds nothing.
const draftNoCtx = await sql`SELECT id FROM gigs WHERE id = ${rivalGigId}`;
check('the same draft stays invisible without the applicant context', draftNoCtx.length === 0);

// 12. Mark-read: the RECIPIENT may set read_at on the counterpart's messages
// (0008's FOR ALL policy blocked this; 0014 splits the commands).
const markRead = await sql.transaction([
  sql`SELECT set_config('app.user_id', ${venueUser}, true)`,
  sql`
    UPDATE messages SET read_at = NOW()
    WHERE conversation_id = ${fixtures.conversationId}
      AND sender_id <> ${venueUser} AND read_at IS NULL
    RETURNING id
  `,
]);
check('recipient can mark the counterpart’s messages read', markRead[1].length >= 1, `rows=${markRead[1].length}`);

// 13. Escrow release: no user context may UPDATE payouts…
const payoutAsUser = await sql.transaction([
  sql`SELECT set_config('app.user_id', ${venueUser}, true)`,
  sql`UPDATE payouts SET status = 'RELEASED' WHERE id = ${fixtures.payoutId} RETURNING id`,
]);
check('a participant cannot release their own payout', payoutAsUser[1].length === 0);

// 14. …but SERVICE context (the cron) can.
const payoutAsService = await sql.transaction([
  sql`SELECT set_config('app.role', 'SERVICE', true)`,
  sql`
    UPDATE payouts SET status = 'RELEASED', released_at = NOW()
    WHERE id = ${fixtures.payoutId} AND status = 'HELD'
    RETURNING id
  `,
]);
check('SERVICE context releases the HELD payout', payoutAsService[1].length === 1);

// 15. Erasure pseudonymization: user context cannot rewrite actor ids…
const pseudonymAsUser = await sql.transaction([
  sql`SELECT set_config('app.user_id', ${venueUser}, true)`,
  sql`
    UPDATE audit_logs SET actor_id = 'deleted:probe'
    WHERE actor_id = 'rls-erasure-subject' RETURNING id
  `,
]);
check('a user context cannot pseudonymize audit rows', pseudonymAsUser[1].length === 0);

// 16. …but SERVICE can, and ONLY the actor_id column is writable at all
// (check 6 above already proved UPDATEs of other columns die at the GRANT).
const pseudonymAsService = await sql.transaction([
  sql`SELECT set_config('app.role', 'SERVICE', true)`,
  sql`
    UPDATE audit_logs SET actor_id = 'deleted:rls-verified'
    WHERE actor_id = 'rls-erasure-subject' RETURNING id
  `,
]);
check('SERVICE context pseudonymizes the audit trail', pseudonymAsService[1].length === 1);

// 17. stripe_events is deny-by-default to users, open to SERVICE (webhook).
let stripeUserBlocked = false;
try {
  await sql.transaction([
    sql`SELECT set_config('app.user_id', ${venueUser}, true)`,
    sql`INSERT INTO stripe_events (id, type) VALUES ('evt_rls_user_probe', 'probe')`,
  ]);
} catch (error) {
  stripeUserBlocked = /row-level security|permission denied/i.test(error.message);
}
check('a user context cannot write webhook replay-guard rows', stripeUserBlocked);
let stripeServiceOk = false;
let stripeServiceDetail;
try {
  await sql.transaction([
    sql`SELECT set_config('app.role', 'SERVICE', true)`,
    sql`
      INSERT INTO stripe_events (id, type) VALUES ('evt_rls_service_probe', 'probe')
      ON CONFLICT (id) DO NOTHING
    `,
  ]);
  stripeServiceOk = true;
} catch (error) {
  stripeServiceDetail = error.message.split('\n')[0];
}
check('SERVICE context records webhook events', stripeServiceOk, stripeServiceDetail);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} isolation checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
