import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { GigIdSchema, GigStatusUpdateSchema, type GigStatus } from '@/app/api/utils/schemas';
import { GIG_TRANSITIONS, canTransition } from '@/app/api/utils/gig-lifecycle';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

const statusLimiter = getRateLimiter('gigs-status', { windowMs: 60 * 60 * 1000, max: 60 });

interface GigDetailRow {
  [key: string]: unknown;
  id: string;
  status: GigStatus;
  venue_user_id: string;
}

/** Loads a gig joined with its venue card. Returns null when absent. */
async function loadGig(id: string): Promise<GigDetailRow | null> {
  const rows = (await sql`
    SELECT g.*,
           vp.user_id AS venue_user_id,
           vp.venue_name, vp.neighborhood AS venue_neighborhood, vp.address,
           vp.description AS venue_description, vp.venue_type, vp.capacity,
           vp.rating AS venue_rating, vp.avatar_url AS venue_avatar_url,
           (SELECT COUNT(*)::int FROM gigs g2
             WHERE g2.venue_id = g.venue_id AND g2.status IN ('FILLED', 'COMPLETED'))
             AS venue_gigs_hosted
    FROM gigs g
    JOIN venue_profiles vp ON g.venue_id = vp.id
    WHERE g.id = ${id}
    LIMIT 1
  `) as GigDetailRow[];
  return rows[0] ?? null;
}

/** Serializes a row without the venue owner's auth user id. */
function toPublicGig(row: GigDetailRow, isOwner: boolean) {
  const { venue_user_id: _omitted, ...gig } = row;
  return { gig, isOwner };
}

/**
 * Public gig detail (wireframe p4). PUBLISHED gigs are world-readable.
 * Non-published statuses stay 404 to the world (drafts don't leak existence),
 * with two carve-outs: the owning venue/ADMIN, and a talent with an
 * application on the gig — their dashboard cards and shift rows deep-link
 * here, and hiring flips the gig to FILLED, which must not break those links.
 */
export const GET = withRoute('gigs.detail', async (_request, context) => {
  const params = await context.params;
  const parsed = GigIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();

  const row = await loadGig(parsed.data);
  if (!row) throw ApiError.notFound();

  const user = await authGuard.optionalUser();
  const isOwner = user !== null && (user.id === row.venue_user_id || user.role === 'ADMIN');

  // A signed-in talent sees their own application state inline ("✓ Applied").
  let myApplication: Record<string, unknown> | null = null;
  if (user !== null && user.role === 'TALENT') {
    const applicationRows = (await sql`
      SELECT a.id, a.status, a.proposed_rate_cents, a.created_at
      FROM applications a
      JOIN talent_profiles tp ON tp.id = a.talent_id
      WHERE a.gig_id = ${parsed.data} AND tp.user_id = ${user.id}
      LIMIT 1
    `) as Array<Record<string, unknown>>;
    myApplication = applicationRows[0] ?? null;
  }

  if (row.status !== 'PUBLISHED' && !isOwner && myApplication === null) {
    throw ApiError.notFound();
  }

  return Response.json({ ...toPublicGig(row, isOwner), myApplication });
});

/**
 * Owner-only status transition (P1.3 lifecycle). Idempotent: re-sending the
 * current status is a no-op 200. Every real transition is audited.
 */
export const PATCH = withRoute('gigs.status', async (request, context) => {
  const user = await authGuard.requireRole('VENUE');
  enforceRateLimit(statusLimiter, clientKey(request, user.id));

  const params = await context.params;
  const parsed = GigIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();
  const { status: nextStatus } = await parseBody(request, GigStatusUpdateSchema);

  const row = await loadGig(parsed.data);
  if (!row) throw ApiError.notFound();
  // Tenant isolation: a non-owner venue gets the same 404 as a missing gig.
  if (user.role !== 'ADMIN' && row.venue_user_id !== user.id) throw ApiError.notFound();

  const currentStatus = row.status;
  if (currentStatus === nextStatus) return Response.json(toPublicGig(row, true));

  if (!canTransition(currentStatus, nextStatus)) {
    const allowed = GIG_TRANSITIONS[currentStatus] ?? [];
    throw ApiError.badRequest(
      `Cannot move a ${currentStatus} gig to ${nextStatus}` +
        (allowed.length > 0 ? ` (allowed: ${allowed.join(', ')})` : ' (terminal status)')
    );
  }

  // Optimistic concurrency: the status must still be what we validated against.
  const updated = await sql`
    UPDATE gigs SET status = ${nextStatus}
    WHERE id = ${parsed.data} AND status = ${currentStatus}
    RETURNING *
  `;
  if (updated.length === 0) {
    throw ApiError.badRequest('Gig was modified concurrently — reload and retry');
  }

  await auditLogger.record({
    actorId: user.id,
    action: 'gig.status_change',
    entityType: 'gig',
    entityId: parsed.data,
    metadata: { from: currentStatus, to: nextStatus },
  });

  return Response.json(toPublicGig({ ...row, ...updated[0] } as GigDetailRow, true));
});
