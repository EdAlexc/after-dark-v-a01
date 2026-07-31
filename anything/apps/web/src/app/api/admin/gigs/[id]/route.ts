import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { notify } from '@/app/api/utils/notify';
import { parseBody } from '@/app/api/utils/validation';
import { AdminGigUpdateSchema, GigIdSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';

/**
 * PATCH /api/admin/gigs/[id] (P9.2) — moderation takedown. The ONLY admin gig
 * write, and it only goes one way: → CANCELLED (schema enforces the literal).
 * Everything else stays the owning venue's job through their own PATCH.
 * Audited; the venue is notified with the reason.
 */
export const PATCH = withRoute('admin.gigs.update', async (request, context) => {
  const admin = await authGuard.requireRole('ADMIN');
  const params = await context.params;
  const parsed = GigIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();
  const body = await parseBody(request, AdminGigUpdateSchema);

  // RLS (S2): reading any status and writing the takedown both need the
  // ADMIN-context platform policies.
  const gigs = await withRlsContext<
    Array<{ id: string; title: string; status: string; venue_user_id: string }>
  >(
    admin,
    sql`
      SELECT g.id, g.title, g.status, vp.user_id AS venue_user_id
      FROM gigs g JOIN venue_profiles vp ON vp.id = g.venue_id
      WHERE g.id = ${parsed.data} LIMIT 1
    `
  );
  if (gigs.length === 0) throw ApiError.notFound();
  const gig = gigs[0];
  if (gig.status === 'CANCELLED') return Response.json({ gig }); // idempotent

  const updated = await withRlsContext<Array<Record<string, unknown>>>(
    admin,
    sql`
      UPDATE gigs SET status = 'CANCELLED'
      WHERE id = ${parsed.data} AND status = ${gig.status}
      RETURNING id, title, status
    `
  );
  if (updated.length === 0) {
    throw new ApiError(409, 'Gig changed underneath you — reload');
  }

  await auditLogger.record({
    actorId: admin.id,
    action: 'admin.gig.takedown',
    entityType: 'gig',
    entityId: gig.id,
    metadata: { from: gig.status, reason: body.reason ?? null },
  });
  await notify(gig.venue_user_id, 'gig.removed', {
    gigId: gig.id,
    gigTitle: gig.title,
    reason: body.reason ?? 'Removed by moderation',
  });

  return Response.json({ gig: updated[0] });
});
