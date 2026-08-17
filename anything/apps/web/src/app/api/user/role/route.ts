import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRlsContext } from '@/app/api/utils/rls';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { RoleSelectionSchema } from '@/app/api/utils/schemas';
import { withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

const roleLimiter = getRateLimiter('user-role', { windowMs: 60 * 60 * 1000, max: 10 });

/**
 * Sets the caller's marketplace role. Self-service roles only —
 * RoleSelectionSchema rejects ADMIN (privilege-escalation fix, CLAUDE.md §7.1);
 * admin is granted out-of-band directly in the database.
 */
export const POST = withRoute('user.role.set', async (request) => {
  const user = await authGuard.requireSession();
  await enforceRateLimit(roleLimiter, clientKey(request, user.id));

  const { role, stageName, venueName, neighborhood } = await parseBody(
    request,
    RoleSelectionSchema
  );

  await sql`
    UPDATE "user"
    SET role = ${role}, "updatedAt" = NOW()
    WHERE id = ${user.id}
  `;

  // Profile writes run under the caller's RLS context (S12): the owner-write
  // policies WITH CHECK `user_id = app.user_id`, so a context-less INSERT is
  // rejected outright post-cutover and onboarding 500s. The existence SELECTs
  // ride the public-read policy and need no context.
  const rlsUser = { id: user.id, role };
  if (role === 'TALENT') {
    const existing = await sql`SELECT id FROM talent_profiles WHERE user_id = ${user.id} LIMIT 1`;
    if (existing.length > 0) {
      await withRlsContext(
        rlsUser,
        sql`
        UPDATE talent_profiles
        SET stage_name = ${stageName ?? ''}, neighborhood = ${neighborhood ?? ''}, updated_at = NOW()
        WHERE user_id = ${user.id}
      `
      );
    } else {
      await withRlsContext(
        rlsUser,
        sql`
        INSERT INTO talent_profiles (user_id, stage_name, neighborhood, profile_completion_pct)
        VALUES (${user.id}, ${stageName ?? ''}, ${neighborhood ?? ''}, ${stageName ? 20 : 10})
      `
      );
    }
  } else if (role === 'VENUE') {
    const existing = await sql`SELECT id FROM venue_profiles WHERE user_id = ${user.id} LIMIT 1`;
    if (existing.length > 0) {
      await withRlsContext(
        rlsUser,
        sql`
        UPDATE venue_profiles
        SET venue_name = ${venueName ?? ''}, updated_at = NOW()
        WHERE user_id = ${user.id}
      `
      );
    } else {
      await withRlsContext(
        rlsUser,
        sql`
        INSERT INTO venue_profiles (user_id, venue_name, description)
        VALUES (${user.id}, ${venueName ?? ''}, ${''})
      `
      );
    }
  }
  // PARTY (consumer persona) carries no marketplace profile — role only.

  await auditLogger.record({
    actorId: user.id,
    action: 'role.set',
    entityType: 'user',
    entityId: user.id,
    metadata: { role },
  });

  return Response.json({ success: true, role });
});

export const GET = withRoute('user.role.get', async () => {
  const user = await authGuard.requireSession();
  const rows = await sql`
    SELECT id, name, email, role FROM "user" WHERE id = ${user.id} LIMIT 1
  `;
  return Response.json({ user: rows[0] ?? null });
});
