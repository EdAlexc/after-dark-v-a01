/**
 * S16 — deep-link refresh survival + navigation safety (PRD §5 "Routing
 * Architecture", CLAUDE.md §5.3): URL-addressable state must survive a hard
 * refresh, anonymous visitors are gated with a safe callbackUrl, and logout
 * cannot be abused as an open redirect.
 */

import { test, expect } from '@playwright/test';
import {
	BASE_URL,
	DESKTOP_VIEWPORT,
	EMPTY_STORAGE_STATE,
	PREVIEW_EMAILS,
	previewPassword,
	signInViaApi,
} from './fixtures';

test.use({ viewport: DESKTOP_VIEWPORT });

test('anonymous /dashboard/* is gated to sign-in with a safe callbackUrl', async ({ page }) => {
	await page.goto('/dashboard/talent');
	await page.waitForURL(/\/account\/signin\?/);
	const url = new URL(page.url());
	expect(url.searchParams.get('callbackUrl')).toBe('/dashboard/talent');
	await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('a published gig deep link renders anonymously and survives refresh', async ({ page, request }) => {
	const res = await request.get('/api/gigs');
	expect(res.ok()).toBe(true);
	const { gigs } = (await res.json()) as { gigs: Array<{ id: string; title: string }> };
	expect(gigs.length, 'seeded PUBLISHED gigs must exist').toBeGreaterThan(0);

	await page.goto(`/gigs/${gigs[0].id}`);
	await expect(page.getByRole('heading', { name: gigs[0].title })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('heading', { name: gigs[0].title })).toBeVisible();
});

test('search results are URL-addressable and refresh-stable', async ({ page }) => {
	await page.goto('/search?q=night');
	const box = page.getByRole('searchbox', { name: 'Search gigs or talent' });
	await expect(box).toHaveValue('night');
	await page.reload();
	expect(new URL(page.url()).searchParams.get('q')).toBe('night');
	await expect(box).toHaveValue('night');
});

test('logout ignores an absolute callbackUrl (open-redirect guard)', async ({ browser }) => {
	// Fresh sign-in on its own cookie jar: signing out revokes this session
	// only, never the shared storage-state sessions the other specs reuse.
	const context = await browser.newContext({
		viewport: DESKTOP_VIEWPORT,
		storageState: EMPTY_STORAGE_STATE,
	});
	try {
		await signInViaApi(context.request, PREVIEW_EMAILS.talent, previewPassword(PREVIEW_EMAILS.talent));
		const page = await context.newPage();
		await page.goto('/account/logout?callbackUrl=https://example.org/phish');
		// The sanitizer must fall back to '/' — never leave the origin.
		await page.waitForURL((url) => !url.pathname.startsWith('/account/logout'), { timeout: 30_000 });
		expect(page.url()).toBe(new URL('/', BASE_URL).toString());
		const whoami = await context.request.get('/api/notifications');
		expect(whoami.status(), 'session must be revoked after logout').toBe(401);
	} finally {
		await context.close();
	}
});
