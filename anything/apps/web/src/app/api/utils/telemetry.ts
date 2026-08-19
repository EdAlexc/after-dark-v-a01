/**
 * S18 — first-party observability capture (Q5/D6).
 *
 * Two track()-style fire-and-forget writers (see events.ts for the doctrine:
 * telemetry must NEVER take the triggering request down with it, so nothing
 * here throws) plus the production Apdex constant.
 *
 * Privacy (the S18 gate): no user ids, no session linkage, no raw URLs.
 * api_timings carries the route-kit NAME (bounded cardinality); rum_events
 * carries a normalized route shape. Both write through the SERVICE context —
 * the 0022 policies accept no other.
 */

import sql from './sql';
import { logger } from './logger';
import { serviceContext, withRlsContext } from './rls';
import type { RumMetric, RumRating } from '@/lib/rum';

const log = logger.child('telemetry');

/**
 * The §3 scorecard Apdex threshold (T=300 ms). This is the REAL bar the
 * production dashboard reports against — unlike CI's k6 gate, whose T values
 * are calibrations for a co-hosted 2-core runner (see ci.yml).
 */
export const APDEX_T_MS = 300;

/** Sampling knob for the per-request timing insert (0..1, default keep all).
 *  Read per call so tests can steer it. */
function sampleRate(): number {
  const raw = Number(process.env.TELEMETRY_SAMPLE ?? '1');
  if (!Number.isFinite(raw)) return 1;
  return Math.min(1, Math.max(0, raw));
}

const TELEMETRY_ACTOR = serviceContext('system:telemetry');

export interface ApiTiming {
	route: string;
	method: string;
	status: number;
	durationMs: number;
}

/**
 * Append one request timing. Fire-and-forget by design — callers do NOT
 * await it on the request path. Skipped under vitest (route suites assert
 * exact sql call patterns; the capture util has its own suite).
 */
export function captureApiTiming(timing: ApiTiming): void {
	if (process.env.NODE_ENV === 'test') return;
	if (Math.random() >= sampleRate()) return;
	const method = timing.method.toUpperCase();
	if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return;
	void withRlsContext(
		TELEMETRY_ACTOR,
		sql`
      INSERT INTO api_timings (route, method, status, duration_ms)
      VALUES (${timing.route.slice(0, 60)}, ${method},
              ${Math.min(599, Math.max(100, Math.round(timing.status)))},
              ${Math.max(0, Math.round(timing.durationMs))})
    `
	).catch((error) => {
		log.error('timing insert failed', { route: timing.route, error });
	});
}

export interface RumEvent {
	metric: RumMetric;
	value: number;
	rating: RumRating;
	path: string;
}

/** Append one validated web-vitals beacon (the /api/rum route validates
 *  shape and normalizes the path before calling this). Never throws. */
export async function captureRumEvent(event: RumEvent): Promise<boolean> {
	try {
		await withRlsContext(
			TELEMETRY_ACTOR,
			sql`
        INSERT INTO rum_events (metric, value, rating, path)
        VALUES (${event.metric}, ${event.value}, ${event.rating}, ${event.path})
      `
		);
		return true;
	} catch (error) {
		log.error('rum insert failed', { metric: event.metric, error });
		return false;
	}
}
