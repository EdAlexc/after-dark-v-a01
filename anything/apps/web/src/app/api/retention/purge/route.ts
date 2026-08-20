import * as Sentry from '@sentry/nextjs';
import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { logger } from '@/app/api/utils/logger';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { serviceContext, withRlsContext } from '@/app/api/utils/rls';

const log = logger.child('retention.purge');

/**
 * POST /api/retention/purge (S2 / TENANT_GUARDRAIL §4.2 G7) — the owned,
 * tested purge job docs/retention.md §4 was missing. Runs daily via Vercel
 * Cron (vercel.json), deleting data past its retention schedule (§1):
 *
 *  - expired `session` rows (retention: session lifetime; the rows of a
 *    session that can no longer authenticate anyone are pure liability);
 *  - expired `verification` rows (one-time token artifacts);
 *  - rate-limit windows past their horizon (S1 stores) — operational data,
 *    kept ≤1 day (app counters) / ≤7 days (better-auth model).
 *
 * **Legal holds (§5) are honored structurally**: an active GLOBAL hold
 * suspends the entire run; an active USER hold excludes that user's sessions
 * from deletion. Holds live in `legal_holds` (0014) and are placed/released
 * by the incident lead per docs/incident-runbook.md §3. Verification and
 * rate-limit rows are not user-attributable token/counter artifacts, so the
 * GLOBAL hold is their only (and sufficient) hold lever.
 *
 * Every run — including a fully-held one — writes an audit row with per-table
 * counts, so "the purge ran / was held" is itself provable retrospectively.
 *
 * Callable two ways, both privileged (mirrors /api/payouts/release):
 * ADMIN session, or `Authorization: Bearer <CRON_SECRET>` (Vercel Cron GETs).
 */
function isCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = request.headers.get('authorization');
  return Boolean(cronSecret && bearer === `Bearer ${cronSecret}`);
}

const PURGE_SERVICE = serviceContext('system:retention');

interface PurgeCounts {
  sessions: number;
  verifications: number;
  rateLimitWindows: number;
  authRateLimits: number;
  rumEvents: number;
  apiTimings: number;
}

async function runPurge(viaCron: boolean): Promise<Response> {
  // Hold check first: a GLOBAL hold freezes everything (incident evidence
  // must not be rotated away — retention.md §5).
  const holds = await withRlsContext<
    Array<{ scope: string; user_id: string | null }>
  >(
    PURGE_SERVICE,
    sql`
      SELECT scope, user_id FROM legal_holds WHERE released_at IS NULL
    `
  );
  const globalHold = holds.some((hold) => hold.scope === 'GLOBAL');
  const heldUserIds = holds
    .filter((hold) => hold.scope === 'USER' && hold.user_id)
    .map((hold) => hold.user_id as string);

  if (globalHold) {
    log.warn('retention purge suspended — active GLOBAL legal hold');
    await auditLogger.record({
      actorId: viaCron ? 'system:cron' : 'admin',
      action: 'retention.purge',
      entityType: 'retention',
      metadata: { held: true, scope: 'GLOBAL', activeHolds: holds.length },
    });
    // S14 (A5): a held run is still a LIVE cron — heartbeat regardless, or a
    // long legal hold would read as a dead schedule on the admin overview.
    if (viaCron) {
      await auditLogger.record({
        actorId: 'system:cron',
        action: 'cron.heartbeat',
        entityType: 'job',
        entityId: 'retention-purge',
        metadata: { held: true },
      });
    }
    return Response.json({ held: true, activeHolds: holds.length });
  }

  // Sessions: expired AND not belonging to a held user. `<> ALL('{}')` is
  // vacuously true, so the empty-holds case needs no special branch.
  const sessions = (await sql`
    DELETE FROM "session"
    WHERE "expiresAt" < NOW()
      AND "userId" <> ALL(${heldUserIds})
    RETURNING id
  `) as Array<{ id: string }>;

  const verifications = (await sql`
    DELETE FROM "verification" WHERE "expiresAt" < NOW() RETURNING id
  `) as Array<{ id: string }>;

  // S1 stores: windows the limiter can never consult again.
  const rateLimitWindows = (await sql`
    DELETE FROM rate_limit_counters
    WHERE window_start < NOW() - INTERVAL '1 day'
    RETURNING bucket
  `) as Array<{ bucket: string }>;

  const authRateLimits = (await sql`
    DELETE FROM "rateLimit"
    WHERE "lastRequest" < (EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000)::bigint
    RETURNING id
  `) as Array<{ id: string }>;

  // S18 telemetry: platform-telemetry rows age out at 30 days
  // (docs/retention.md §1). Governed tables — the deletes run under the
  // SERVICE context, the only delete path the 0022 policies allow.
  const [rumEvents, apiTimings] = await withRlsContext<
    [Array<{ id: number }>, Array<{ id: number }>]
  >(serviceContext('system:retention'), [
    sql`DELETE FROM rum_events WHERE created_at < NOW() - INTERVAL '30 days' RETURNING id`,
    sql`DELETE FROM api_timings WHERE created_at < NOW() - INTERVAL '30 days' RETURNING id`,
  ]);

  const counts: PurgeCounts = {
    sessions: sessions.length,
    verifications: verifications.length,
    rateLimitWindows: rateLimitWindows.length,
    authRateLimits: authRateLimits.length,
    rumEvents: rumEvents.length,
    apiTimings: apiTimings.length,
  };

  await auditLogger.record({
    actorId: viaCron ? 'system:cron' : 'admin',
    action: 'retention.purge',
    entityType: 'retention',
    metadata: { held: false, userHolds: heldUserIds.length, ...counts },
  });
  log.info('retention purge complete', { ...counts, userHolds: heldUserIds.length });

  // S14 (A5) heartbeat — mirrors payouts/release: the admin overview's
  // cron-health check reads the latest of these per job.
  if (viaCron) {
    await auditLogger.record({
      actorId: 'system:cron',
      action: 'cron.heartbeat',
      entityType: 'job',
      entityId: 'retention-purge',
      metadata: counts as unknown as Record<string, unknown>,
    });
  }

  return Response.json({ held: false, purged: counts, userHolds: heldUserIds.length });
}

export const POST = withRoute('retention.purge', async (request) => {
  const viaCron = isCronRequest(request);
  if (!viaCron) {
    const user = await authGuard.requireRole('ADMIN');
    log.info('manual retention purge', { actor: user.id });
  }
  return runPurge(viaCron);
});

// Vercel Cron invokes its "crons" paths with GET + `Authorization: Bearer
// <CRON_SECRET>`; only that exact credential runs the job here — a plain GET
// still fails loudly so a misconfigured cron shows up fast.
export const GET = withRoute('retention.purge.get', async (request) => {
  if (isCronRequest(request)) return runPurge(true);
  // S14 (A5) dead-man: unset CRON_SECRET means the G7 retention purge never
  // runs — a GDPR obligation silently going unmet. Scream until it is set.
  if (!process.env.CRON_SECRET) {
    log.error(
      'CRON_SECRET is not set — the G7 retention-purge cron is DARK; expired sessions/tokens are accumulating (DEV_TIMELINE §4.6 B4)'
    );
    Sentry.captureMessage('cron dark: CRON_SECRET unset (retention/purge)', 'error');
  }
  throw ApiError.badRequest('Use POST (admin) or the cron bearer');
});
