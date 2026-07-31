import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { notify } from '@/app/api/utils/notify';
import { parseBody } from '@/app/api/utils/validation';
import { ShiftIdSchema, ShiftTransitionSchema } from '@/app/api/utils/schemas';
import {
  canTransitionShift,
  computeShiftPayCents,
  type ShiftStatus,
} from '@/app/api/utils/shift-lifecycle';
import { splitPayout } from '@/app/api/utils/money';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';
import { withRlsContext } from '@/app/api/utils/rls';

const transitionLimiter = getRateLimiter('shifts-transition', {
  windowMs: 60 * 60 * 1000,
  max: 60,
});

interface ShiftRow {
  id: string;
  gig_id: string;
  status: ShiftStatus;
  agreed_rate_cents: number;
  check_in_at: string | null;
  check_out_at: string | null;
  call_time: string | null;
  gig_title: string;
  venue_user_id: string;
  talent_user_id: string;
}

/**
 * POST /api/shifts/[id] (P7) — check-in/out transition, replay-safe twice over:
 *
 *  1. **Idempotency key** (client-generated, unique per shift in the DB —
 *     §6.3): a retried request with the same key returns the recorded outcome
 *     instead of re-applying, so the midnight double-tap can't double-count.
 *  2. **Optimistic status guard**: the UPDATE is scoped `WHERE status = <read
 *     status>`, so two racing *different* keys can't both win.
 *
 * Checkout is the money moment: pay = agreed rate × actual worked time, and a
 * PENDING→HELD payout ledger row is written with the server-computed 5% fee
 * (client fee input does not exist).
 */
export const POST = withRoute('shifts.transition', async (request, context) => {
  const user = await authGuard.requireRole('TALENT', 'VENUE');
  await enforceRateLimit(transitionLimiter, clientKey(request, user.id));

  const params = await context.params;
  const parsed = ShiftIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();
  const body = await parseBody(request, ShiftTransitionSchema);

  // RLS (S2): shift rows resolve only for their talent, their venue, or
  // platform context — mirrored by the app-level check below.
  const rows = await withRlsContext<ShiftRow[]>(
    user,
    sql`
      SELECT s.id, s.gig_id, s.status, s.agreed_rate_cents, s.check_in_at, s.check_out_at,
             s.call_time, g.title AS gig_title,
             vp.user_id AS venue_user_id, tp.user_id AS talent_user_id
      FROM shifts s
      JOIN gigs g ON g.id = s.gig_id
      JOIN venue_profiles vp ON vp.id = g.venue_id
      JOIN talent_profiles tp ON tp.id = s.talent_id
      WHERE s.id = ${parsed.data}
      LIMIT 1
    `
  );
  if (rows.length === 0) throw ApiError.notFound();
  const shift = rows[0];

  const isTalent = user.role !== 'ADMIN' && shift.talent_user_id === user.id;
  const isVenue = shift.venue_user_id === user.id || user.role === 'ADMIN';
  if (!isTalent && !isVenue) throw ApiError.notFound(); // isolation: hide existence
  const actor = isTalent ? 'TALENT' : 'VENUE';

  // Idempotency replay? Return the recorded outcome without re-applying.
  const replay = await withRlsContext<Array<{ to_status: ShiftStatus }>>(
    user,
    sql`
      SELECT to_status FROM shift_transitions
      WHERE shift_id = ${shift.id} AND idempotency_key = ${body.idempotency_key}
      LIMIT 1
    `
  );
  if (replay.length > 0) {
    return Response.json({ shift: { ...shift, status: replay[0].to_status }, replayed: true });
  }

  if (shift.status === body.to) {
    return Response.json({ shift, replayed: false });
  }
  if (!canTransitionShift(actor, shift.status, body.to)) {
    throw ApiError.badRequest(`Cannot move a ${shift.status} shift to ${body.to} as ${actor}`);
  }

  const now = new Date();
  const checkInAt = body.to === 'CHECKED_IN' ? now.toISOString() : shift.check_in_at;
  const checkOutAt = body.to === 'CHECKED_OUT' ? now.toISOString() : shift.check_out_at;

  let shiftPayCents: number | null = null;
  if (body.to === 'CHECKED_OUT') {
    const inAt = checkInAt ? new Date(checkInAt) : null;
    if (!inAt) throw ApiError.badRequest('Cannot check out a shift that never checked in');
    shiftPayCents = computeShiftPayCents(shift.agreed_rate_cents, inAt, now);
  }

  // Transition + idempotency record commit atomically; the unique constraint
  // on (shift_id, key) is the backstop if two same-key requests race.
  const [updated] = await withRlsContext<[unknown[], unknown[]]>(user, [
    sql`
      UPDATE shifts
      SET status = ${body.to},
          check_in_at = ${checkInAt},
          check_out_at = ${checkOutAt},
          shift_pay_cents = COALESCE(${shiftPayCents}, shift_pay_cents),
          updated_at = NOW()
      WHERE id = ${shift.id} AND status = ${shift.status}
      RETURNING *
    `,
    sql`
      INSERT INTO shift_transitions (shift_id, idempotency_key, from_status, to_status, actor_id)
      VALUES (${shift.id}, ${body.idempotency_key}, ${shift.status}, ${body.to}, ${user.id})
    `,
  ]);
  if ((updated as unknown[]).length === 0) {
    throw ApiError.badRequest('Shift was modified concurrently — reload and retry');
  }

  // Checkout writes the ledger row (P8 picks it up for escrow release).
  if (body.to === 'CHECKED_OUT' && shiftPayCents !== null) {
    const split = splitPayout(shiftPayCents);
    // RLS (S2): payouts_participant_insert admits the shift's own parties.
    await withRlsContext(
      user,
      sql`
        INSERT INTO payouts (shift_id, gig_id, venue_user_id, talent_user_id,
                             gross_cents, fee_cents, net_cents, status)
        VALUES (${shift.id}, ${shift.gig_id}, ${shift.venue_user_id}, ${shift.talent_user_id},
                ${split.grossCents}, ${split.feeCents}, ${split.netCents}, 'HELD')
      `
    );
  }

  await auditLogger.record({
    actorId: user.id,
    action: 'shift.transition',
    entityType: 'shift',
    entityId: shift.id,
    metadata: { from: shift.status, to: body.to, shiftPayCents },
  });
  const counterpart = isTalent ? shift.venue_user_id : shift.talent_user_id;
  await notify(
    counterpart,
    body.to === 'CHECKED_OUT' ? 'shift.checked_out' : 'shift.checked_in',
    { shiftId: shift.id, gigTitle: shift.gig_title, status: body.to }
  );

  return Response.json({
    shift: { ...shift, status: body.to, shift_pay_cents: shiftPayCents ?? undefined },
    replayed: false,
  });
});
