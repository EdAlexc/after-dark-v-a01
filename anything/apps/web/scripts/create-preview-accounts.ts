#!/usr/bin/env tsx
/**
 * Creates the three shared PREVIEW accounts (talent / venue / party) that the
 * dev team uses to exercise the deployed site — one per role instance.
 * Credentials are documented in TESTING.md §2. Rotate them before any real
 * user data enters the database.
 *
 *   DATABASE_URL=postgres://… yarn tsx scripts/create-preview-accounts.ts
 *
 * Idempotent (keyed by email): safe to re-run; it re-asserts roles/profiles
 * and only seeds the venue's starter gigs when the venue has none. Users are
 * created through better-auth's server API so password sign-in works on any
 * deployment of this codebase (scrypt hashes don't depend on the auth secret).
 */

import { auth } from '../src/lib/auth';
import sql from '../src/app/api/utils/sql';

interface PreviewAccount {
  email: string;
  password: string;
  name: string;
  role: 'TALENT' | 'VENUE' | 'PARTY';
}

export const PREVIEW_ACCOUNTS: PreviewAccount[] = [
  {
    email: 'talent.preview@afterdark.dev',
    password: 'AfterDark-Talent-2026!',
    name: 'Nova Reign',
    role: 'TALENT',
  },
  {
    email: 'venue.preview@afterdark.dev',
    password: 'AfterDark-Venue-2026!',
    name: 'The Velvet Hour',
    role: 'VENUE',
  },
  {
    email: 'party.preview@afterdark.dev',
    password: 'AfterDark-Party-2026!',
    name: 'Jordan Nightowl',
    role: 'PARTY',
  },
];

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. See .env.example.');
  process.exit(1);
}

async function ensureUser(account: PreviewAccount): Promise<string> {
  const existing = (await sql`
    SELECT id FROM "user" WHERE email = ${account.email} LIMIT 1
  `) as Array<{ id: string }>;
  let id = existing[0]?.id;
  if (!id) {
    const result = await auth.api.signUpEmail({
      body: { email: account.email, password: account.password, name: account.name },
    });
    id = result.user.id;
    console.log(`✓ created ${account.role} preview user ${account.email}`);
  } else {
    console.log(`• ${account.email} already exists`);
  }
  await sql`UPDATE "user" SET role = ${account.role}, "updatedAt" = NOW() WHERE id = ${id}`;
  return id;
}

async function main() {
  const [talent, venue, party] = PREVIEW_ACCOUNTS;

  const talentId = await ensureUser(talent);
  await sql`
    INSERT INTO talent_profiles (user_id, stage_name, pronouns, neighborhood, bio, primary_role, genres_vibes, hourly_rate_min, hourly_rate_max, profile_completion_pct)
    VALUES (${talentId}, 'Nova Reign', 'she/her', 'Williamsburg', 'Open-format DJ & MC. Rooftops, warehouses, and everything between.', 'DJ', ${JSON.stringify(['House', 'Hip-Hop', 'Afrobeats'])}, 120, 250, 82)
    ON CONFLICT (user_id) DO UPDATE SET stage_name = EXCLUDED.stage_name, updated_at = NOW()
  `;

  const venueId = await ensureUser(venue);
  const venueRows = (await sql`
    INSERT INTO venue_profiles (user_id, venue_name, neighborhood, address, description, venue_type, capacity, music_genres)
    VALUES (${venueId}, 'The Velvet Hour', 'Lower East Side', '133 Essex St, New York, NY', 'Intimate cocktail den with a late-night dance floor.', 'Lounge', 180, ${JSON.stringify(['House', 'Disco', 'R&B'])})
    ON CONFLICT (user_id) DO UPDATE SET venue_name = EXCLUDED.venue_name, updated_at = NOW()
    RETURNING id
  `) as Array<{ id: string }>;
  const venueProfileId = venueRows[0].id;

  await ensureUser(party);
  // PARTY is read-only discovery (CLAUDE.md §6.3): no profile row by design.

  const gigCount = (await sql`
    SELECT COUNT(*)::int AS count FROM gigs WHERE venue_id = ${venueProfileId}
  `) as Array<{ count: number }>;
  if (gigCount[0].count === 0) {
    const tonight = new Date();
    tonight.setHours(22, 0, 0, 0);
    if (tonight.getTime() < Date.now()) tonight.setDate(tonight.getDate() + 1);
    const tonightEnd = new Date(tonight.getTime() + 5 * 3600 * 1000);
    const saturday = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    saturday.setHours(23, 0, 0, 0);
    const saturdayEnd = new Date(saturday.getTime() + 5 * 3600 * 1000);

    await sql`
      INSERT INTO gigs (venue_id, title, role_needed, description, start_time, end_time, base_rate, tips_included, status)
      VALUES
        (${venueProfileId}, 'Late-Night Open Format Set', 'DJ', 'Two-floor night — open format upstairs, house in the basement.', ${tonight.toISOString()}, ${tonightEnd.toISOString()}, 200, true, 'PUBLISHED'),
        (${venueProfileId}, 'Weekend Cocktail Residency', 'Mixologist', 'Signature menu launch weekend. Flair welcome.', ${saturday.toISOString()}, ${saturdayEnd.toISOString()}, 70, true, 'PUBLISHED'),
        (${venueProfileId}, 'Door Lead — Private Event (draft)', 'Security', 'Details being finalized with the promoter.', ${saturday.toISOString()}, ${saturdayEnd.toISOString()}, 55, false, 'DRAFT')
    `;
    console.log('✓ seeded 3 starter gigs for The Velvet Hour');
  } else {
    console.log(`• venue already has ${gigCount[0].count} gig(s) — not reseeding`);
  }

  console.log('\nPreview credentials (also in TESTING.md §2):');
  for (const account of PREVIEW_ACCOUNTS) {
    console.log(`  ${account.role.padEnd(6)} ${account.email} / ${account.password}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Preview account creation failed:', error);
    process.exit(1);
  });
