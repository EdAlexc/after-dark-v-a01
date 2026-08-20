/**
 * S18 — the fire-and-forget capture writers: SERVICE-context inserts,
 * clamping, sampling, and the never-throw doctrine (telemetry must not take
 * the triggering request down).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('./../sql', () => ({
	default: Object.assign(mocks.sql, {
		transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
	}),
}));

import { captureApiTiming, captureRumEvent, flushApiTimings, APDEX_T_MS } from '../telemetry';

function sqlTexts(): string[] {
	return mocks.sql.mock.calls.map((call) =>
		Array.isArray(call[0]) ? (call[0] as string[]).join('') : String(call[0])
	);
}

async function flush(): Promise<void> {
	await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.sql.mockResolvedValue([]);
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('captureApiTiming (buffered)', () => {
	it('is a no-op under vitest (route suites assert exact sql patterns)', async () => {
		captureApiTiming({ route: 'gigs.list', method: 'GET', status: 200, durationMs: 42 });
		await flushApiTimings();
		expect(mocks.sql).not.toHaveBeenCalled();
	});

	it('buffers, then flushes ONE batched UNNEST insert with clamped values', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		captureApiTiming({ route: 'x'.repeat(80), method: 'get', status: 1200, durationMs: -5 });
		captureApiTiming({ route: 'gigs.list', method: 'GET', status: 200, durationMs: 42 });
		// Nothing hits the DB until a flush point.
		expect(mocks.sql).not.toHaveBeenCalled();

		await flushApiTimings();
		const texts = sqlTexts();
		expect(texts.some((text) => text.includes('set_config'))).toBe(true);
		const insert = mocks.sql.mock.calls.find((call) =>
			(Array.isArray(call[0]) ? (call[0] as string[]).join('') : '').includes(
				'INSERT INTO api_timings'
			)
		);
		expect(insert).toBeDefined();
		// Array params: routes (≤60 chars), methods uppercased, statuses
		// clamped, durations floored, explicit created_at per buffered row.
		const [, routes, methods, statuses, durations, times] = insert! as [
			unknown,
			string[],
			string[],
			number[],
			number[],
			string[],
		];
		expect(routes[0].length).toBe(60);
		expect(routes[1]).toBe('gigs.list');
		expect(methods).toEqual(['GET', 'GET']);
		expect(statuses).toEqual([599, 200]);
		expect(durations).toEqual([0, 42]);
		expect(times).toHaveLength(2);

		// The buffer drained: a second flush writes nothing.
		mocks.sql.mockClear();
		await flushApiTimings();
		expect(mocks.sql).not.toHaveBeenCalled();
	});

	it('drops unknown methods and honors TELEMETRY_SAMPLE=0', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		captureApiTiming({ route: 'r', method: 'OPTIONS', status: 200, durationMs: 1 });
		await flushApiTimings();
		expect(mocks.sql).not.toHaveBeenCalled();

		vi.stubEnv('TELEMETRY_SAMPLE', '0');
		captureApiTiming({ route: 'r', method: 'GET', status: 200, durationMs: 1 });
		await flushApiTimings();
		expect(mocks.sql).not.toHaveBeenCalled();
	});

	it('self-flushes once the batch threshold is reached', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		for (let i = 0; i < 25; i += 1) {
			captureApiTiming({ route: 'r', method: 'GET', status: 200, durationMs: 1 });
		}
		await flush();
		expect(
			sqlTexts().some((text) => text.includes('INSERT INTO api_timings'))
		).toBe(true);
	});

	it('never throws when the flush fails — rows are dropped, not fatal', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		mocks.sql.mockRejectedValue(new Error('db down'));
		captureApiTiming({ route: 'r', method: 'GET', status: 200, durationMs: 1 });
		await expect(flushApiTimings()).resolves.toBeUndefined();
	});
});

describe('captureRumEvent', () => {
	it('inserts the validated beacon and resolves true', async () => {
		const ok = await captureRumEvent({
			metric: 'LCP',
			value: 1234.5,
			rating: 'good',
			path: '/gigs/[id]',
		});
		expect(ok).toBe(true);
		expect(sqlTexts().some((text) => text.includes('INSERT INTO rum_events'))).toBe(true);
	});

	it('resolves false (never throws) on failure', async () => {
		mocks.sql.mockRejectedValue(new Error('db down'));
		await expect(
			captureRumEvent({ metric: 'CLS', value: 0.01, rating: 'good', path: '/' })
		).resolves.toBe(false);
	});
});

describe('APDEX_T_MS', () => {
	it('is the §3 scorecard bar, not a CI calibration', () => {
		expect(APDEX_T_MS).toBe(300);
	});
});
