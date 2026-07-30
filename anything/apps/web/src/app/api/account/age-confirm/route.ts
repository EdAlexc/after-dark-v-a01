import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { withRoute } from '@/app/api/utils/route-kit';

/**
 * Records the signup-time 18+ attestation (TENANT_GUARDRAIL §4.2 G12).
 *
 * Called immediately after a successful signup, when the user already has a
 * session. Deliberately takes **no body**: the client cannot choose a date or
 * a subject — the timestamp is `NOW()` and the subject is the session user.
 *
 * Idempotent: the first attestation wins, so a replay can't rewrite the date
 * on the legal record.
 */
export const POST = withRoute('account.age-confirm', async () => {
  const user = await authGuard.requireSession();

  const rows = (await sql`
    UPDATE "user"
    SET age_confirmed_at = NOW()
    WHERE id = ${user.id} AND age_confirmed_at IS NULL
    RETURNING age_confirmed_at
  `) as Array<{ age_confirmed_at: string }>;

  // Only audit the first time — replays are no-ops, not events.
  if (rows.length > 0) {
    await auditLogger.record({
      actorId: user.id,
      action: 'account.age_confirmed',
      entityType: 'user',
      entityId: user.id,
      metadata: { minimumAge: 18 },
    });
  }

  return Response.json({ confirmed: true });
});
