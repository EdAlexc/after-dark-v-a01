/**
 * S16 — the TESTING.md §9 PWA checks in a real browser, automating what was a
 * manual release gate. The load-bearing one is §6.6: no authenticated content
 * (no /api response, no session HTML) may EVER appear in Cache Storage — any
 * hit is a release blocker. Requires a production server: the worker
 * deliberately never registers under `yarn dev` (src/lib/pwa.ts).
 */

import { test, expect, type Page } from '@playwright/test';
import {
	DESKTOP_VIEWPORT,
	EMPTY_STORAGE_STATE,
	PREVIEW_EMAILS,
	previewPassword,
	signInViaApi,
	storageStateFor,
} from './fixtures';

test.use({ viewport: DESKTOP_VIEWPORT, storageState: storageStateFor('talent') });

/** URLs the worker is ALLOWED to cache: the precache list + hashed statics. */
const ALLOWED_CACHE_PATHS = [/^\/offline\.html$/, /^\/manifest\.webmanifest$/, /^\/icons\//, /^\/_next\/static\//];

async function waitForServiceWorker(page: Page): Promise<void> {
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
}

async function cachedUrls(page: Page): Promise<string[]> {
	return page.evaluate(async () => {
		const names = await caches.keys();
		const urls: string[] = [];
		for (const name of names) {
			const cache = await caches.open(name);
			for (const request of await cache.keys()) urls.push(request.url);
		}
		return urls;
	});
}

function assertOnlyStaticShell(urls: string[]): void {
	for (const raw of urls) {
		const path = new URL(raw).pathname;
		expect(
			ALLOWED_CACHE_PATHS.some((allowed) => allowed.test(path)),
			`§6.6 violation: unexpected cached entry ${path} (no /api response or app HTML may be cached)`
		).toBe(true);
		expect(path.startsWith('/api'), `§6.6 violation: API response cached: ${path}`).toBe(false);
	}
}

test('§6.6: authed browsing caches only the static shell — never /api or app HTML', async ({ page }) => {
	await page.goto('/dashboard/talent');
	await waitForServiceWorker(page);
	// Browse authed surfaces so any wrongly-scoped cache rule would trip.
	await page.goto('/dashboard/talent/browse');
	await page.goto('/dashboard/talent/messages');
	// No networkidle here — the signed-in shell keeps an SSE stream open
	// (/api/stream), so networkidle never settles. Wait on UI + a beat for
	// any (wrongly) raced cache writes to land before asserting.
	await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
	await page.waitForTimeout(1_500);

	const urls = await cachedUrls(page);
	expect(urls.length, 'precache must exist once the worker is active').toBeGreaterThan(0);
	assertOnlyStaticShell(urls);
});

test('offline navigation falls back to the AfterDark offline page, then recovers', async ({
	page,
	context,
}) => {
	await page.goto('/dashboard/talent');
	await waitForServiceWorker(page);
	// Reload so the page is controlled by the worker before going offline.
	await page.reload();

	await context.setOffline(true);
	await page.goto('/dashboard/talent/browse');
	await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();

	await context.setOffline(false);
	await page.goto('/dashboard/talent/browse');
	await expect(page.getByRole('heading', { name: 'Browse Gigs' })).toBeVisible();
});

test('manifest is installable: valid JSON, maskable icons, standalone display', async ({
	page,
	request,
}) => {
	await page.goto('/');
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);

	const res = await request.get('/manifest.webmanifest');
	expect(res.ok()).toBe(true);
	const manifest = (await res.json()) as {
		name?: string;
		display?: string;
		start_url?: string;
		icons?: Array<{ sizes?: string; purpose?: string; src?: string }>;
	};
	expect(manifest.name).toContain('AfterDark');
	expect(manifest.display).toBe('standalone');
	expect(manifest.start_url).toBeTruthy();
	const sizes = (manifest.icons ?? []).map((icon) => icon.sizes);
	expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
	expect((manifest.icons ?? []).some((icon) => icon.purpose?.includes('maskable'))).toBe(true);
	for (const icon of manifest.icons ?? []) {
		const iconRes = await request.get(icon.src!);
		expect(iconRes.ok(), `manifest icon ${icon.src} must resolve`).toBe(true);
	}
});

test('logout purges caches and leaves nothing authenticated behind', async ({ browser }) => {
	// Own cookie jar: this test signs the session OUT, which must never touch
	// the shared storage-state sessions the rest of the suite reuses —
	// newContext() inherits this file's `test.use` storageState unless reset.
	const context = await browser.newContext({
		viewport: DESKTOP_VIEWPORT,
		storageState: EMPTY_STORAGE_STATE,
	});
	try {
		await signInViaApi(context.request, PREVIEW_EMAILS.talent, previewPassword(PREVIEW_EMAILS.talent));
		const page = await context.newPage();
		await page.goto('/dashboard/talent');
		await waitForServiceWorker(page);
		await page.goto('/dashboard/talent/browse');
		expect((await cachedUrls(page)).length).toBeGreaterThan(0);

		await page.goto('/account/logout');
		await page.waitForURL((url) => !url.pathname.startsWith('/account/logout'), { timeout: 30_000 });

		// The landing page may lawfully re-cache public statics after the
		// purge; what §6.6 forbids surviving is anything authenticated.
		assertOnlyStaticShell(await cachedUrls(page));
		const dead = await context.request.get('/api/notifications');
		expect(dead.status(), 'session must be revoked by logout').toBe(401);
	} finally {
		await context.close();
	}
});
