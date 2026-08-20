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

interface BufferedTiming extends ApiTiming {
	at: string;
}

/**
 * Timings are BUFFERED and flushed in batches (one UNNEST insert per
 * ~FLUSH_MAX rows / FLUSH_AFTER_MS), so the capture's cost is amortized to
 * ~zero per request — the first CI run of S18 measured a per-request insert
 * dragging the k6 read-Apdex from 0.86 to 0.79 on the co-hosted runner, and
 * cheap telemetry that degrades the thing it measures is self-defeating.
 * Trade-off, on the record: an instance that freezes/dies loses its
 * unflushed tail (≤ FLUSH_MAX rows) — acceptable for sampled telemetry.
 */
const FLUSH_MAX = 25;
const FLUSH_AFTER_MS = 5_000;

let buffer: BufferedTiming[] = [];
let bufferOpenedAt = 0;

async function flushBuffer(rows: BufferedTiming[]): Promise<void> {
	await withRlsContext(
		TELEMETRY_ACTOR,
		sql`
      INSERT INTO api_timings (route, method, status, duration_ms, created_at)
      SELECT * FROM UNNEST(
        ${rows.map((row) => row.route)}::text[],
        ${rows.map((row) => row.method)}::text[],
        ${rows.map((row) => row.status)}::smallint[],
        ${rows.map((row) => row.durationMs)}::int[],
        ${rows.map((row) => row.at)}::timestamptz[]
      )
    `
	);
}

/** Flush whatever is buffered now. Exposed for tests and never throws. */
export async function flushApiTimings(): Promise<void> {
	if (buffer.length === 0) return;
	const rows = buffer;
	buffer = [];
	try {
		await flushBuffer(rows);
	} catch (error) {
		log.error('timing flush failed', { dropped: rows.length, error });
	}
}

/**
 * Record one request timing. Buffered fire-and-forget — never awaited on
 * the request path. Skipped under vitest (route suites assert exact sql
 * call patterns; this util has its own suite).
 */
export function captureApiTiming(timing: ApiTiming): void {
	if (process.env.NODE_ENV === 'test') return;
	if (Math.random() >= sampleRate()) return;
	const method = timing.method.toUpperCase();
	if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return;
	if (buffer.length === 0) bufferOpenedAt = Date.now();
	buffer.push({
		route: timing.route.slice(0, 60),
		method,
		status: Math.min(599, Math.max(100, Math.round(timing.status))),
		durationMs: Math.max(0, Math.round(timing.durationMs)),
		at: new Date().toISOString(),
	});
	if (buffer.length >= FLUSH_MAX || Date.now() - bufferOpenedAt >= FLUSH_AFTER_MS) {
		void flushApiTimings();
	}
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
