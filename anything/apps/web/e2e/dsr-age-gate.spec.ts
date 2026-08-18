/**
 * S16 — the G4 + G12 proofs as one journey on one throwaway identity:
 *
 *   G12 (age gating): signup is blocked until the 18+ attestation is ticked,
 *   and the attestation is stamped server-side (`age_confirmed_at` appears in
 *   the data export). The 21+ per-gig arm is asserted in alpha-loop.spec.ts.
 *
 *   G4 (data-subject rights): export downloads a machine-readable JSON with
 *   the documented shape and zero credential material; erasure demands both
 *   the password and the typed word DELETE; and the dead-cookie canary —
 *   a deleted account's still-valid-looking session must 401 immediately.
 *
 * One fresh account per attempt (unique email) keeps the spec retry-safe and
 * inside the signup rate limit (5/min/IP).
 */

import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { DESKTOP_VIEWPORT, throwawayPassword, uniqueEmail } from './fixtures';

test.use({ viewport: DESKTOP_VIEWPORT });

test('G12 signup attestation + G4 export and erasure', async ({ page, context }) => {
	test.setTimeout(180_000);
	const email = uniqueEmail('dsr');
	const password = throwawayPassword();

	await test.step('signup is disabled until the 18+ attestation is ticked', async () => {
		await page.goto('/account/signup');
		await page.getByRole('button', { name: 'Professional Account' }).click();
		await page.getByPlaceholder('you@example.com').fill(email);
		await page.getByPlaceholder('Min. 8 characters').fill(password);

		const join = page.getByRole('button', { name: 'Join AfterDark' });
		await expect(join).toBeDisabled();
		await page.getByRole('checkbox').check();
		await expect(join).toBeEnabled();
		await join.click();
		await page.waitForURL('**/onboarding');
	});

	await test.step('onboarding lands on the talent dashboard', async () => {
		await page.getByRole('heading', { name: 'Talent', exact: true }).click();
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByRole('button', { name: 'DJ / Producer' }).click();
		await page.getByPlaceholder('e.g. DJ Nova, Marco V…').fill(`E2E DSR ${Date.now().toString(36)}`);
		await page.getByRole('button', { name: 'Enter AfterDark' }).click();
		await page.waitForURL('**/dashboard/talent');
	});

	await test.step('export: attachment headers, documented shape, no credentials, G12 stamp', async () => {
		// Headers via the API (same session); the UI control is exercised below.
		const res = await context.request.get('/api/account/export');
		expect(res.status()).toBe(200);
		expect(res.headers()['content-disposition']).toContain('attachment');
		expect(res.headers()['content-disposition']).toContain('afterdark-data-export-');
		expect(res.headers()['cache-control']).toContain('no-store');

		await page.goto('/dashboard/settings');
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('link', { name: 'Export' }).click();
		const download = await downloadPromise;
		const raw = await readFile((await download.path())!, 'utf8');
		const data = JSON.parse(raw) as Record<string, any>;

		expect(data.user?.email).toBe(email);
		// G12: the signup attestation was stamped server-side.
		expect(data.user?.age_confirmed_at).toBeTruthy();
		expect(data.meta?.excluded?.length).toBeGreaterThan(0);
		// No credential material anywhere in the export (G4).
		const flat = raw.toLowerCase();
		for (const marker of ['password', 'totp', 'backup_code', 'session_token']) {
			// Allowed only as *names* inside meta.excluded, never as values —
			// the exclusion list documents what was withheld.
			const outsideMeta = JSON.stringify({ ...data, meta: undefined }).toLowerCase();
			expect(outsideMeta, `export leaks ${marker}`).not.toContain(marker);
		}
		expect(flat).toContain('excluded');
	});

	await test.step('erasure needs BOTH factors: wrong password → 400, nothing changes', async () => {
		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		await page.getByPlaceholder('Your password').fill('wrong-password-123!');
		await page.getByPlaceholder('DELETE').fill('DELETE');
		await page.getByRole('button', { name: 'Delete forever' }).click();
		await expect(page.getByText('Password is incorrect')).toBeVisible();
		// Session still alive — nothing was deleted.
		const alive = await context.request.get('/api/notifications');
		expect(alive.status()).toBe(200);
	});

	await test.step('erasure with password + DELETE removes the account', async () => {
		await page.getByPlaceholder('Your password').fill(password);
		await page.getByRole('button', { name: 'Delete forever' }).click();
		await page.waitForURL('**/?deleted=1');
	});

	await test.step('dead-cookie canary: the old session 401s immediately', async () => {
		const dead = await context.request.get('/api/notifications');
		expect(dead.status()).toBe(401);
	});

	await test.step('deleted credentials can no longer sign in', async () => {
		const res = await context.request.post('/api/auth/sign-in/email', {
			data: { email, password },
		});
		expect(res.ok()).toBe(false);
	});
});
