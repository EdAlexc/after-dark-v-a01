#!/usr/bin/env tsx
/**
 * Demo seed for local/dev databases (DEV_TIMELINE P0.1).
 *
 *   DATABASE_URL=postgres://… AUTH_SECRET_ENCRYPTION_KEY=… yarn db:seed
 *
 * Creates (idempotently, keyed by email):
 *  - a VENUE user + venue profile ("Nebula NYC")
 *  - a TALENT user + talent profile ("DJ Midnight Echo")
 *  - three gigs (two PUBLISHED — one tonight — and one DRAFT)
 *
 * Users are created through better-auth's server API so password sign-in
 * works. Refuses to run in production unless FORCE_SEED=1.
 */

import { auth } from '../src/lib/auth';
import sql from '../src/app/api/utils/sql';

const VENUE_EMAIL = 'venue.demo@afterdark.test';
const TALENT_EMAIL = 'talent.demo@afterdark.test';
const DEMO_PASSWORD = 'afterdark-demo-1';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. See .env.example.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && process.env.FORCE_SEED !== '1') {
  console.error('Refusing to seed a production database (set FORCE_SEED=1 to override).');
  process.exit(1);
}

async function ensureUser(email: string, name: string, role: 'TALENT' | 'VENUE'): Promise<string> {
  const existing = (await sql`SELECT id FROM "user" WHERE email = ${email} LIMIT 1`) as Array<{
    id: string;
  }>;
  let id = existing[0]?.id;
  if (!id) {
    const result = await auth.api.signUpEmail({
      body: { email, password: DEMO_PASSWORD, name },
    });
    id = result.user.id;
    console.log(`✓ created user ${email}`);
  } else {
    console.log(`• user ${email} already exists`);
  }
  await sql`UPDATE "user" SET role = ${role}, "updatedAt" = NOW() WHERE id = ${id}`;
  return id;
}

async function main() {
  const venueUserId = await ensureUser(VENUE_EMAIL, 'Nebula NYC', 'VENUE');
  const talentUserId = await ensureUser(TALENT_EMAIL, 'DJ Midnight Echo', 'TALENT');

  // Venue profile
  const venueRows = (await sql`
    INSERT INTO venue_profiles (user_id, venue_name, neighborhood, address, description, venue_type, capacity, music_genres)
    VALUES (${venueUserId}, 'Nebula NYC', 'Chelsea', '289 10th Ave, New York, NY', 'Premium boutique lounge — deep house & tech-house curation.', 'Lounge', 350, ${JSON.stringify(['Deep House', 'Tech House'])})
    ON CONFLICT (user_id) DO UPDATE SET venue_name = EXCLUDED.venue_name, updated_at = NOW()
    RETURNING id
  `) as Array<{ id: string }>;
  const venueId = venueRows[0].id;

  // Talent profile
  await sql`
    INSERT INTO talent_profiles (user_id, stage_name, pronouns, neighborhood, bio, primary_role, genres_vibes, hourly_rate_min, hourly_rate_max, profile_completion_pct)
    VALUES (${talentUserId}, 'DJ Midnight Echo', 'they/them', 'Bushwick', 'Deep house & industrial techno. Resident DJ at The Void.', 'DJ', ${JSON.stringify(['Techno', 'House'])}, 75, 200, 78)
    ON CONFLICT (user_id) DO UPDATE SET stage_name = EXCLUDED.stage_name, updated_at = NOW()
  `;

  // Gigs: one published tonight, one published future, one draft.
  const gigCount = (await sql`SELECT COUNT(*)::int AS count FROM gigs WHERE venue_id = ${venueId}`) as Array<{
    count: number;
  }>;
  if (gigCount[0].count === 0) {
    const tonightStart = new Date();
    tonightStart.setHours(22, 0, 0, 0);
    const tonightEnd = new Date(tonightStart);
    tonightEnd.setHours(tonightEnd.getHours() + 6);
    const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const nextWeekEnd = new Date(nextWeek.getTime() + 5 * 3600 * 1000);

    const lastWeek = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const lastWeekEnd = new Date(lastWeek.getTime() + 5 * 3600 * 1000);

    await sql`
      INSERT INTO gigs (venue_id, title, role_needed, description, start_time, end_time, base_rate, tips_included, status)
      VALUES
        (${venueId}, 'Saturday Night Deep House Set', 'Headliner DJ', 'Drive the room from 10 PM until close.', ${tonightStart.toISOString()}, ${tonightEnd.toISOString()}, 450, true, 'PUBLISHED'),
        (${venueId}, 'VIP Mixologist — Weekend Residency', 'Mixologist', 'Craft cocktail program for the mezzanine bar.', ${nextWeek.toISOString()}, ${nextWeekEnd.toISOString()}, 55, true, 'PUBLISHED'),
        (${venueId}, 'Warehouse Party Opener (TBD)', 'Opener DJ', 'Draft — details being finalized.', ${nextWeek.toISOString()}, ${nextWeekEnd.toISOString()}, 200, false, 'DRAFT'),
        (${venueId}, 'Friday Rooftop Sunset Set', 'DJ', 'Filled last week — lifecycle demo.', ${lastWeek.toISOString()}, ${lastWeekEnd.toISOString()}, 180, false, 'FILLED')
    `;
    console.log('✓ seeded 4 gigs (PUBLISHED ×2, DRAFT, FILLED)');
  } else {
    console.log(`• gigs already present (${gigCount[0].count})`);
  }

  console.log('\nDemo credentials:');
  console.log(`  venue:  ${VENUE_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  talent: ${TALENT_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
