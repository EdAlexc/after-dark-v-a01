/**
 * S18 — the RUM ingest boundary (the S18 security gate): anonymous by
 * design, so validation is strict — no identity fields exist, unknown keys
 * are rejected, hostile paths are normalized or refused, and the endpoint
 * is rate-limited per IP.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/api/utils/sql', () => ({
	default: Object.assign(mocks.sql, {
		transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
	}),
}));

import { POST } from '../route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';

function beacon(body: unknown, ip = '198.51.100.7'): [Request, Record<string, never>] {
	return [
		new Request('http://test.local/api/rum', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
			body: JSON.stringify(body),
		}),
		{},
	];
}

const VALID = { metric: 'LCP', value: 1234.5, rating: 'good', path: '/dashboard/talent' };

beforeEach(() => {
	vi.clearAllMocks();
	mocks.sql.mockResolvedValue([]);
	getRateLimiter('rum-ingest', { windowMs: 1, max: 1 }).reset();
});

describe('POST /api/rum', () => {
	it('accepts a valid anonymous beacon with 204 and no body', async () => {
		const res = await POST(...beacon(VALID));
		expect(res.status).toBe(204);
		expect(await res.text()).toBe('');
		const texts = mocks.sql.mock.calls.map((call) =>
			Array.isArray(call[0]) ? (call[0] as string[]).join('') : String(call[0])
		);
		expect(texts.some((text) => text.includes('INSERT INTO rum_events'))).toBe(true);
	});

	it('normalizes id-carrying paths before storing (defense in depth)', async () => {
		const res = await POST(
			...beacon({ ...VALID, path: '/gigs/4b4b1c2e-8f6a-4f7e-9d2a-1234567890ab' })
		);
		expect(res.status).toBe(204);
		const insert = mocks.sql.mock.calls.find((call) =>
			(Array.isArray(call[0]) ? (call[0] as string[]).join('') : '').includes(
				'INSERT INTO rum_events'
			)
		);
		expect(insert).toBeDefined();
		expect(insert).toContain('/gigs/[id]');
	});

	it('rejects unknown keys — identity fields cannot ride along (strict schema)', async () => {
		const res = await POST(...beacon({ ...VALID, userId: 'u-1' }));
		expect(res.status).toBe(400);
	});

	it('rejects malformed metrics, ratings, values and paths', async () => {
		expect((await POST(...beacon({ ...VALID, metric: 'FID' }))).status).toBe(400);
		expect((await POST(...beacon({ ...VALID, rating: 'meh' }))).status).toBe(400);
		expect((await POST(...beacon({ ...VALID, value: -1 }))).status).toBe(400);
		expect((await POST(...beacon({ ...VALID, value: Infinity }))).status).toBe(400);
		expect((await POST(...beacon({ ...VALID, path: 'javascript:alert(1)' }))).status).toBe(400);
		expect((await POST(...beacon({ ...VALID, path: '/x?q=secret@email.com' }))).status).toBe(400);
	});

	it('rate-limits per IP with Retry-After (240/min ceiling)', async () => {
		getRateLimiter('rum-ingest', { windowMs: 60_000, max: 240 }).reset();
		let last: Response | null = null;
		for (let i = 0; i < 241; i += 1) {
			last = await POST(...beacon(VALID, '203.0.113.9'));
		}
		expect(last!.status).toBe(429);
		expect(last!.headers.get('Retry-After')).toBeTruthy();
	});
});
