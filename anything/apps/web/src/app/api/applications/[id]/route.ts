import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { notify } from '@/app/api/utils/notify';
import { parseBody } from '@/app/api/utils/validation';
import { ApplicationIdSchema, ApplicationStatusUpdateSchema } from '@/app/api/utils/schemas';
import {
  allowedApplicationTransitions,
  canTransitionApplication,
  type ApplicationStatus,
} from '@/app/api/utils/application-lifecycle';
import { dollarsToCents } from '@/app/api/utils/money';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';
import { withRlsContext } from '@/app/api/utils/rls';

const reviewLimiter = getRateLimiter('applications-review', {
  windowMs: 60 * 60 * 1000,
  max: 120,
});

interface ApplicationRow {
  id: string;
  gig_id: string;
  talent_id: string;
  status: ApplicationStatus;
  proposed_rate_cents: number | null;
  gig_title: string;
  gig_status: string;
  gig_base_rate: string | null;
  gig_start_time: string | null;
  venue_user_id: string;
  talent_user_id: string;
}

/**
 * PATCH /api/applications/[id] (P3.2/P3.3) — actor-scoped status transition.
 *
 * TALENT may withdraw their own application; the owning VENUE may
 * shortlist / reject / hire. **HIRED is transactional**: application →
 * HIRED, gig → FILLED, and the P7 shift row are one atomic commit — a crash
 * can't leave someone hired with no shift to check in to.
 */
export const PATCH = withRoute('applications.update', async (request, context) => {
  const user = await authGuard.requireRole('TALENT', 'VENUE');
  await enforceRateLimit(reviewLimiter, clientKey(request, user.id));

  const params = await context.params;
  const parsed = ApplicationIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();
  const { status: nextStatus } = await parseBody(request, ApplicationStatusUpdateSchema);

  // RLS (S2): the row is only visible to its talent, the owning venue, or
  // platform context — the same parties the app-level check below admits.
  const rows = await withRlsContext<ApplicationRow[]>(
    user,
    sql`
      SELECT a.id, a.gig_id, a.talent_id, a.status, a.proposed_rate_cents,
             g.title AS gig_title, g.status AS gig_status, g.base_rate AS gig_base_rate,
             g.start_time AS gig_start_time,
             vp.user_id AS venue_user_id, tp.user_id AS talent_user_id
      FROM applications a
      JOIN gigs g ON g.id = a.gig_id
      JOIN venue_profiles vp ON vp.id = g.venue_id
      JOIN talent_profiles tp ON tp.id = a.talent_id
      WHERE a.id = ${parsed.data}
      LIMIT 1
    `
  );
  if (rows.length === 0) throw ApiError.notFound();
  const application = rows[0];

  // Tenant scoping: you act as the talent on your own application, or as the
  // venue on applications to your own gigs. Everyone else gets the same 404
  // a nonexistent id would produce.
  const isTalent = user.role !== 'ADMIN' && application.talent_user_id === user.id;
  const isVenue = application.venue_user_id === user.id || user.role === 'ADMIN';
  if (!isTalent && !isVenue) throw ApiError.notFound();
  const actor = isTalent ? 'TALENT' : 'VENUE';

  if (application.status === nextStatus) {
    return Response.json({ application: { ...application, status: nextStatus } });
  }
  if (!canTransitionApplication(actor, application.status, nextStatus)) {
    const allowed = allowedApplicationTransitions(actor, application.status);
    throw ApiError.badRequest(
      `Cannot move a ${application.status} application to ${nextStatus}` +
        (allowed.length > 0 ? ` (allowed: ${allowed.join(', ')})` : '')
    );
  }

  if (nextStatus === 'HIRED') {
    // Agreed rate freezes NOW: the talent's ask, else the gig's base rate.
    const agreedRateCents =
      application.proposed_rate_cents ?? dollarsToCents(application.gig_base_rate ?? 0);

    // Same atomic batch as before, now carrying the RLS context (S2) — the
    // venue may update its own gig's applications/gig/shift rows.
    const [updated] = await withRlsContext<[unknown[], unknown[], unknown[]]>(user, [
      sql`
        UPDATE applications SET status = 'HIRED', updated_at = NOW()
        WHERE id = ${application.id} AND status = ${application.status}
        RETURNING *
      `,
      // FILLED only from PUBLISHED; 0 rows is fine (gig may already be filled).
      sql`
        UPDATE gigs SET status = 'FILLED'
        WHERE id = ${application.gig_id} AND status = 'PUBLISHED'
      `,
      sql`
        INSERT INTO shifts (gig_id, talent_id, application_id, agreed_rate_cents, call_time)
        VALUES (${application.gig_id}, ${application.talent_id}, ${application.id},
                ${agreedRateCents}, ${application.gig_start_time})
        ON CONFLICT (gig_id, talent_id) DO NOTHING
      `,
    ]);
    if ((updated as unknown[]).length === 0) {
      throw ApiError.badRequest('Application was modified concurrently — reload and retry');
    }

    await auditLogger.record({
      actorId: user.id,
      action: 'application.hire',
      entityType: 'application',
      entityId: application.id,
      metadata: { gigId: application.gig_id, agreedRateCents },
    });
    await notify(application.talent_user_id, 'application.status', {
      status: 'HIRED',
      gigId: application.gig_id,
      gigTitle: application.gig_title,
    });
    return Response.json({ application: { ...application, status: 'HIRED' } });
  }

  const updated = await withRlsContext<Array<Record<string, unknown>>>(
    user,
    sql`
      UPDATE applications SET status = ${nextStatus}, updated_at = NOW()
      WHERE id = ${application.id} AND status = ${application.status}
      RETURNING *
    `
  );
  if (updated.length === 0) {
    throw ApiError.badRequest('Application was modified concurrently — reload and retry');
  }

  await auditLogger.record({
    actorId: user.id,
    action: 'application.status_change',
    entityType: 'application',
    entityId: application.id,
    metadata: { from: application.status, to: nextStatus },
  });
  // The counterpart learns about the change; withdrawals notify the venue.
  const recipient =
    actor === 'TALENT' ? application.venue_user_id : application.talent_user_id;
  await notify(recipient, 'application.status', {
    status: nextStatus,
    gigId: application.gig_id,
    gigTitle: application.gig_title,
  });

  return Response.json({ application: updated[0] });
});
