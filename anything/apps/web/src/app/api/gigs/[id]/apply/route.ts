import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { notify } from '@/app/api/utils/notify';
import { parseBody } from '@/app/api/utils/validation';
import { ApplicationCreateSchema, GigIdSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';
import { withRlsContext } from '@/app/api/utils/rls';
import { track } from '@/app/api/utils/events';

const applyLimiter = getRateLimiter('applications-create', {
  windowMs: 60 * 60 * 1000,
  max: 30,
});

/**
 * POST /api/gigs/[id]/apply (P3.1) — TALENT applies to a PUBLISHED gig.
 *
 * The proposed rate is the talent's ask in integer cents (null = accept the
 * base rate). The 5% fee is *never* an input here — it is display math on the
 * client and server math at payout time (money.ts).
 *
 * Re-applying after WITHDRAWN revives the same row (unique gig+talent), so a
 * talent can't stack duplicate applications by withdraw/re-apply loops.
 */
export const POST = withRoute('gigs.apply', async (request, context) => {
  const user = await authGuard.requireRole('TALENT');
  await enforceRateLimit(applyLimiter, clientKey(request, user.id));

  const params = await context.params;
  const parsed = GigIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();
  const gigId = parsed.data;

  const body = await parseBody(request, ApplicationCreateSchema);

  const talentRows = (await sql`
    SELECT id FROM talent_profiles WHERE user_id = ${user.id} LIMIT 1
  `) as Array<{ id: string }>;
  if (talentRows.length === 0) {
    throw ApiError.badRequest('Create your talent profile before applying');
  }
  const talentId = talentRows[0].id;

  // Only open gigs accept applications; a non-published gig 404s like the
  // detail route (existence stays hidden).
  const gigRows = (await sql`
    SELECT g.id, g.title, g.venue_id, vp.user_id AS venue_user_id
    FROM gigs g JOIN venue_profiles vp ON vp.id = g.venue_id
    WHERE g.id = ${gigId} AND g.status = 'PUBLISHED'
    LIMIT 1
  `) as Array<{ id: string; title: string; venue_id: string; venue_user_id: string }>;
  if (gigRows.length === 0) throw ApiError.notFound('Gig not found or no longer open');
  const gig = gigRows[0];

  // Upsert-with-revive: WITHDRAWN → PENDING again; any other live status is a
  // duplicate application. RLS (S2): applications_talent_own WITH CHECK keys
  // on the request context.
  const result = await withRlsContext<Array<Record<string, unknown>>>(
    user,
    sql`
      INSERT INTO applications (gig_id, talent_id, proposed_rate_cents, cover_message)
      VALUES (${gigId}, ${talentId}, ${body.proposed_rate_cents ?? null}, ${body.cover_message})
      ON CONFLICT (gig_id, talent_id) DO UPDATE SET
        proposed_rate_cents = EXCLUDED.proposed_rate_cents,
        cover_message = EXCLUDED.cover_message,
        status = 'PENDING',
        updated_at = NOW()
      WHERE applications.status = 'WITHDRAWN'
      RETURNING *
    `
  );

  if (result.length === 0) {
    throw ApiError.badRequest('You already applied to this gig');
  }

  await auditLogger.record({
    actorId: user.id,
    action: 'application.create',
    entityType: 'application',
    entityId: String(result[0].id),
    metadata: { gigId, proposedRateCents: body.proposed_rate_cents ?? null },
  });
  await notify(gig.venue_user_id, 'application.received', {
    gigId,
    gigTitle: gig.title,
    applicationId: String(result[0].id),
  });
  // KPI capture (S6): application volume per venue/gig (no talent identity).
  await track(user, 'application.created', {
    venueId: gig.venue_id ? String(gig.venue_id) : null,
    gigId,
  });

  return Response.json({ application: result[0] }, { status: 201 });
});
