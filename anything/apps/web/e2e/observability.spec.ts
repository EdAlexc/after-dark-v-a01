/**
 * S18 — the RUM/observability pipeline end-to-end on the real stack: an
 * anonymous beacon is accepted (SERVICE-context insert through RLS), the
 * suite's own API traffic shows up as route timings, and the admin overview
 * + dashboard render the telemetry (Q5/D6 proof).
 */

import { test, expect } from '@playwright/test';
import { DESKTOP_VIEWPORT, storageStateFor } from './fixtures';

test.use({ viewport: DESKTOP_VIEWPORT });

test('anonymous beacon lands and the admin sees traffic, Apdex and vitals', async ({
	browser,
	request,
}) => {
	// Anonymous ingest: strict-validated, no session, 204 with no body.
	const beacon = await request.post('/api/rum', {
		data: { metric: 'LCP', value: 1500, rating: 'good', path: '/dashboard/talent' },
	});
	expect(beacon.status()).toBe(204);

	// Identity fields must be rejected, not silently dropped (strict schema).
	const smuggled = await request.post('/api/rum', {
		data: { metric: 'LCP', value: 1500, rating: 'good', path: '/x', userId: 'u-1' },
	});
	expect(smuggled.status()).toBe(400);

	const adminCtx = await browser.newContext({
		storageState: storageStateFor('admin'),
		viewport: DESKTOP_VIEWPORT,
	});
	try {
		const overview = await adminCtx.request.get('/api/admin/overview');
		expect(overview.ok()).toBe(true);
		const body = (await overview.json()) as {
			telemetry: {
				apdexT: number;
				traffic: { day_count: number; hour_count: number; errors: number };
				endpointApdex: Array<{ route: string; count: number; apdex: number }>;
				webVitals: Array<{ metric: string; p75: number; samples: number }>;
			};
		};
		// The suite's own API calls are the traffic — route-kit captured them.
		expect(body.telemetry.apdexT).toBe(300);
		expect(body.telemetry.traffic.day_count).toBeGreaterThan(0);
		expect(body.telemetry.endpointApdex.length).toBeGreaterThan(0);
		expect(body.telemetry.webVitals.some((vital) => vital.metric === 'LCP')).toBe(true);

		// And the wireframe-p1 cards render from it.
		const page = await adminCtx.newPage();
		await page.goto('/dashboard/admin');
		await expect(page.getByText('API Requests (24h)')).toBeVisible();
		await expect(page.getByText(/API Apdex \(24h/)).toBeVisible();
		await expect(page.getByText('LCP p75 (7d · RUM)')).toBeVisible();
		await expect(page.getByText('INP p75 (7d · RUM)')).toBeVisible();
	} finally {
		await adminCtx.close();
	}
});
