/**
 * S16 — the remaining per-role journeys (CLAUDE.md §8 "admin can see audit
 * trail"; §6.3 "PARTY is never a principal"):
 *
 *   Admin: a real report filed by a real user is triaged OPEN → REVIEWING →
 *   CLOSED on the moderation dashboard, and the audited trail is exportable
 *   as CSV. Non-admins get the access-required card.
 *
 *   Party: public read surfaces work; a principal write is role-denied.
 */

import { test, expect } from '@playwright/test';
import { DESKTOP_VIEWPORT, storageStateFor } from './fixtures';

test.use({ viewport: DESKTOP_VIEWPORT });

test('admin journey: triage a real report and export the audit CSV', async ({ browser }) => {
	test.setTimeout(180_000);
	const reason = `E2E report ${Date.now().toString(36)} — spam in listing`;

	const talentCtx = await browser.newContext({ storageState: storageStateFor('talent') });
	const adminCtx = await browser.newContext({
		storageState: storageStateFor('admin'),
		viewport: DESKTOP_VIEWPORT,
	});
	try {
		await test.step('a talent files a report against a public gig', async () => {
			const gigsRes = await talentCtx.request.get('/api/gigs');
			expect(gigsRes.ok()).toBe(true);
			const { gigs } = (await gigsRes.json()) as { gigs: Array<{ id: string }> };
			expect(gigs.length).toBeGreaterThan(0);
			const res = await talentCtx.request.post('/api/reports', {
				data: { entity_type: 'gig', entity_id: gigs[0].id, reason, severity: 'HIGH' },
			});
			expect(res.ok(), `report create returned ${res.status()}`).toBe(true);
		});

		const admin = await adminCtx.newPage();
		await test.step('the report appears in triage and walks OPEN → REVIEWING → CLOSED', async () => {
			await admin.goto('/dashboard/admin');
			await expect(admin.getByRole('heading', { name: 'Admin Moderation' })).toBeVisible();
			await expect(admin.getByRole('heading', { name: 'Reports Triage' })).toBeVisible();

			const row = admin
				.locator('div')
				.filter({ hasText: reason })
				.filter({ has: admin.getByRole('button', { name: 'Review' }) })
				.last();
			await expect(row.getByText('HIGH')).toBeVisible();
			await row.getByRole('button', { name: 'Review' }).click();
			await expect(admin.locator('[data-sonner-toaster]')).toContainText('Report updated');

			const reviewing = admin
				.locator('div')
				.filter({ hasText: reason })
				.filter({ has: admin.getByRole('button', { name: 'Close' }) })
				.last();
			await expect(reviewing.getByText('REVIEWING')).toBeVisible();
			await reviewing.getByRole('button', { name: 'Close' }).click();
			await expect(admin.locator('div').filter({ hasText: reason }).last().getByText('CLOSED')).toBeVisible();
		});

		await test.step('the audit trail exports as CSV and records the triage', async () => {
			const downloadPromise = admin.waitForEvent('download');
			await admin.getByRole('link', { name: 'Export Audit Log' }).click();
			const download = await downloadPromise;
			expect(download.suggestedFilename()).toMatch(/\.csv$/);
			const { readFile } = await import('node:fs/promises');
			const csv = await readFile((await download.path())!, 'utf8');
			expect(csv.split('\n')[0]).toContain('action');
			expect(csv).toContain('report');
		});
	} finally {
		await talentCtx.close();
		await adminCtx.close();
	}
});

test('non-admins get the access-required card, not the moderation surface', async ({ browser }) => {
	const context = await browser.newContext({
		storageState: storageStateFor('talent'),
		viewport: DESKTOP_VIEWPORT,
	});
	try {
		const page = await context.newPage();
		await page.goto('/dashboard/admin');
		await expect(page.getByText('Admin access required')).toBeVisible();
	} finally {
		await context.close();
	}
});

test('party journey: read-only discovery works, principal writes are denied', async ({ browser }) => {
	const context = await browser.newContext({
		storageState: storageStateFor('party'),
		viewport: DESKTOP_VIEWPORT,
	});
	try {
		const page = await context.newPage();

		// Public discovery: landing, search, and a gig detail all render.
		await page.goto('/');
		await expect(page.getByText('Hot Gigs Tonight').or(page.getByText('Featured Tonight')).first()).toBeVisible();

		const gigsRes = await context.request.get('/api/gigs');
		const { gigs } = (await gigsRes.json()) as { gigs: Array<{ id: string; title: string }> };
		expect(gigs.length).toBeGreaterThan(0);
		await page.goto(`/gigs/${gigs[0].id}`);
		await expect(page.getByRole('heading', { name: gigs[0].title })).toBeVisible();

		// PARTY is never a principal: posting a gig is role-denied (403).
		const write = await context.request.post('/api/gigs', {
			data: {
				title: 'Party persona should never post this',
				role_needed: 'DJ / Producer',
				status: 'PUBLISHED',
			},
		});
		expect(write.status()).toBe(403);

		// Applying to a gig is role-denied too.
		const apply = await context.request.post(`/api/gigs/${gigs[0].id}/apply`, {
			data: { cover_message: 'party apply attempt' },
		});
		expect(apply.status()).toBe(403);
	} finally {
		await context.close();
	}
});
