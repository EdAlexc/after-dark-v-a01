import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { AdminUserUpdateSchema, UserIdSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';

/**
 * PATCH /api/admin/users/[id] (P9.2) — suspend / unsuspend an account.
 *
 * Guardrails:
 *  - an admin cannot suspend themselves (lockout foot-gun);
 *  - an admin cannot suspend another ADMIN — de-escalate the role out-of-band
 *    first, the same channel that granted it;
 *  - suspending requires a reason (it is shown to the user on their 403 and
 *    preserved in the audit trail).
 *
 * Suspension takes effect on the target's very next request: AuthGuard reads
 * the row per request, so no session invalidation dance is needed.
 */
export const PATCH = withRoute('admin.users.update', async (request, context) => {
  const admin = await authGuard.requireRole('ADMIN');
  const params = await context.params;
  const parsed = UserIdSchema.safeParse(params?.id);
  if (!parsed.success) throw ApiError.notFound();
  const body = await parseBody(request, AdminUserUpdateSchema);

  if (parsed.data === admin.id) {
    throw ApiError.badRequest('You cannot suspend your own account');
  }

  const targets = (await sql`
    SELECT id, role, suspended_at FROM "user" WHERE id = ${parsed.data} LIMIT 1
  `) as Array<{ id: string; role: string | null; suspended_at: string | null }>;
  if (targets.length === 0) throw ApiError.notFound();
  const target = targets[0];

  if (target.role === 'ADMIN') {
    throw ApiError.forbidden('Admins cannot be suspended from the dashboard');
  }
  if (body.suspended && !body.reason) {
    throw ApiError.badRequest('A reason is required to suspend an account');
  }

  const updated = (await sql`
    UPDATE "user"
    SET suspended_at = ${body.suspended ? new Date().toISOString() : null},
        suspended_reason = ${body.suspended ? (body.reason ?? null) : null}
    WHERE id = ${parsed.data}
    RETURNING id, name, email, role, "createdAt" AS created_at, suspended_at, suspended_reason
  `) as Array<Record<string, unknown>>;

  await auditLogger.record({
    actorId: admin.id,
    action: body.suspended ? 'admin.user.suspend' : 'admin.user.unsuspend',
    entityType: 'user',
    entityId: parsed.data,
    metadata: { reason: body.reason ?? null, wasSuspended: Boolean(target.suspended_at) },
  });

  return Response.json({ user: updated[0] });
});
