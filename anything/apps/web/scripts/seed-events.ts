#!/usr/bin/env tsx
/**
 * NYC events import — populates the marketplace with real upcoming events
 * (crawled 2026-08-27 from public listings; dataset + provenance in
 * seed-events.data.ts) so test users have full browse / map / venues /
 * search surfaces through Oct 2026.
 *
 *   DATABASE_URL=postgres://… yarn db:seed-events
 *
 * Idempotent: venue users are keyed by email, gigs by
 * (venue_id, title, start_time) — re-running updates venue profiles and
 * skips existing gigs. Venue users are created through better-auth with a
 * random, discarded password: they are data carriers for public listings,
 * not sign-in accounts. Refuses NODE_ENV=production unless FORCE_SEED=1
 * (same convention as seed.ts).
 */

import { randomBytes } from 'node:crypto';
import { auth } from '../src/lib/auth';
import sql from '../src/app/api/utils/sql';
import { VENUES, EVENTS, type SeedEvent } from './seed-events.data';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. See .env.example.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && process.env.FORCE_SEED !== '1') {
  console.error('Refusing to seed a production database (set FORCE_SEED=1 to override).');
  process.exit(1);
}

const EMAIL_DOMAIN = 'venues.afterdark.test';

/** All event times are America/New_York EDT (UTC-4) — valid through Oct 31 2026. */
function toStartEnd(event: SeedEvent): { start: string; end: string } {
  const start = new Date(`${event.date}T${event.start}:00-04:00`);
  const end = new Date(start.getTime() + event.hours * 3600 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function ensureVenueUser(slug: string, name: string): Promise<string> {
  const email = `${slug}@${EMAIL_DOMAIN}`;
  const existing = (await sql`SELECT id FROM "user" WHERE email = ${email} LIMIT 1`) as Array<{
    id: string;
  }>;
  let id = existing[0]?.id;
  if (!id) {
    // Random, unrecorded password: nobody signs in as these accounts.
    const result = await auth.api.signUpEmail({
      body: { email, password: randomBytes(24).toString('base64url'), name },
    });
    id = result.user.id;
    console.log(`✓ created venue user ${email}`);
  }
  await sql`UPDATE "user" SET role = 'VENUE', "updatedAt" = NOW() WHERE id = ${id}`;
  return id;
}

async function main() {
  const venueIds = new Map<string, string>(); // slug → venue_profiles.id
  let venuesCreated = 0;

  for (const venue of VENUES) {
    const userId = await ensureVenueUser(venue.slug, venue.name);
    const rows = (await sql`
      INSERT INTO venue_profiles
        (user_id, venue_name, neighborhood, address, description, venue_type, capacity, music_genres)
      VALUES
        (${userId}, ${venue.name}, ${venue.neighborhood}, ${venue.address}, ${venue.description},
         ${venue.venueType}, ${venue.capacity}, ${JSON.stringify(venue.genres)})
      ON CONFLICT (user_id) DO UPDATE SET
        venue_name = EXCLUDED.venue_name,
        neighborhood = EXCLUDED.neighborhood,
        address = EXCLUDED.address,
        description = EXCLUDED.description,
        venue_type = EXCLUDED.venue_type,
        capacity = EXCLUDED.capacity,
        music_genres = EXCLUDED.music_genres,
        updated_at = NOW()
      RETURNING id, (xmax = 0) AS inserted
    `) as Array<{ id: string; inserted: boolean }>;
    venueIds.set(venue.slug, rows[0].id);
    if (rows[0].inserted) venuesCreated += 1;
  }

  let gigsCreated = 0;
  let gigsSkipped = 0;
  for (const event of EVENTS) {
    const venueId = venueIds.get(event.venue);
    const venue = VENUES.find((v) => v.slug === event.venue);
    if (!venueId || !venue) {
      throw new Error(`event "${event.title}" references unknown venue slug "${event.venue}"`);
    }
    const { start, end } = toStartEnd(event);
    const existing = (await sql`
      SELECT id FROM gigs
      WHERE venue_id = ${venueId} AND title = ${event.title} AND start_time = ${start}
      LIMIT 1
    `) as Array<{ id: string }>;
    if (existing.length > 0) {
      gigsSkipped += 1;
      continue;
    }
    await sql`
      INSERT INTO gigs
        (venue_id, title, role_needed, description, start_time, end_time, base_rate,
         tips_included, age_requirement, status, address, lat, lng)
      VALUES
        (${venueId}, ${event.title}, ${event.role}, ${event.description}, ${start}, ${end},
         ${event.rate}, ${event.tips ?? false}, ${event.age ?? 21}, 'PUBLISHED',
         ${venue.address}, ${venue.lat}, ${venue.lng})
    `;
    gigsCreated += 1;
  }

  console.log(
    `\nDone: ${VENUES.length} venues (${venuesCreated} new), ` +
      `${gigsCreated} gigs created, ${gigsSkipped} already present.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Event seed failed:', error);
    process.exit(1);
  });
