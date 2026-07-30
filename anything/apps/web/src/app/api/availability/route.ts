import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { parseBody, parseQuery } from '@/app/api/utils/validation';
import {
  AvailabilityPutSchema,
  AvailabilityQuerySchema,
  TIME_SLOTS,
} from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';

/**
 * Availability calendar (P6) — TALENT-only, self-scoped. GET returns a month
 * of slots plus any shifts in that month, so the UI can render BOOKED days
 * and conflict warnings from one round trip.
 */

async function requireTalentProfileId(userId: string): Promise<string> {
  const rows = (await sql`
    SELECT id FROM talent_profiles WHERE user_id = ${userId} LIMIT 1
  `) as Array<{ id: string }>;
  if (rows.length === 0) {
    throw ApiError.badRequest('Create your talent profile first');
  }
  return rows[0].id;
}

export const GET = withRoute('availability.get', async (request) => {
  const user = await authGuard.requireRole('TALENT');
  const { month } = parseQuery(request.url, AvailabilityQuerySchema);
  const talentId = await requireTalentProfileId(user.id);

  const monthStart = `${month}-01`;

  const [slots, shifts] = await Promise.all([
    sql`
      SELECT date, time_slot, status, notes FROM availabilities
      WHERE talent_id = ${talentId}
        AND date >= ${monthStart}::date
        AND date < (${monthStart}::date + INTERVAL '1 month')
      ORDER BY date, time_slot
    `,
    // Booked reality: shifts overlapping the month, for conflict display.
    sql`
      SELECT s.id, s.call_time, s.status, g.title AS gig_title, vp.venue_name
      FROM shifts s
      JOIN gigs g ON g.id = s.gig_id
      JOIN venue_profiles vp ON vp.id = g.venue_id
      WHERE s.talent_id = ${talentId}
        AND s.call_time >= ${monthStart}::date
        AND s.call_time < (${monthStart}::date + INTERVAL '1 month')
      ORDER BY s.call_time
    `,
  ]);

  return Response.json({ month, slots, shifts });
});

/**
 * PUT — upsert one day. The body's `slots` map is authoritative for that day:
 * listed slots are written, absent slots are cleared. (BOOKED is never set
 * here — it comes from real shifts, not self-declaration.)
 */
export const PUT = withRoute('availability.put', async (request) => {
  const user = await authGuard.requireRole('TALENT');
  const body = await parseBody(request, AvailabilityPutSchema);
  const talentId = await requireTalentProfileId(user.id);

  const entries = TIME_SLOTS.map((slot) => ({ slot, status: body.slots[slot] ?? null }));

  const statements = entries.map(({ slot, status }) =>
    status === null
      ? sql`
          DELETE FROM availabilities
          WHERE talent_id = ${talentId} AND date = ${body.date} AND time_slot = ${slot}
        `
      : sql`
          INSERT INTO availabilities (talent_id, date, time_slot, status, notes)
          VALUES (${talentId}, ${body.date}, ${slot}, ${status}, ${body.notes})
          ON CONFLICT (talent_id, date, time_slot)
          DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = NOW()
        `
  );
  // One transaction so a day never half-saves.
  await sql.transaction(statements as never[]);

  return Response.json({ saved: true, date: body.date });
});
