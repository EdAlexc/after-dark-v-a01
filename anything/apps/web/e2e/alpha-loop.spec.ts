/**
 * S16 — the alpha loop as one journey (CLAUDE.md §8): venue publishes via the
 * wizard → talent discovers, deep-links, applies with a proposed rate →
 * negotiation in messages (rate proposal → accept) → venue shortlists/hires →
 * actor-scoped shift transitions (talent On-My-Way, venue Check-In, talent
 * Check-Out) → HELD payout visible on both dashboards.
 *
 * One test on purpose: the loop is a single causal chain, and a fresh gig
 * title per attempt keeps it retry-safe (nothing here depends on data from a
 * previous run; stale rows from a failed attempt sort behind the fresh one).
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { DESKTOP_VIEWPORT, rowAction, storageStateFor, toaster } from './fixtures';

function dateInputValue(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

test('alpha loop: publish → apply → negotiate → hire → shift → payout held', async ({ browser }) => {
	test.setTimeout(300_000);

	const nonce = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
	const gigTitle = `E2E Loop Gig ${nonce}`;
	const coverMessage = `E2E cover letter ${nonce} — resident DJ, own controller.`;

	const venueCtx: BrowserContext = await browser.newContext({
		storageState: storageStateFor('venue'),
		viewport: DESKTOP_VIEWPORT,
	});
	const talentCtx: BrowserContext = await browser.newContext({
		storageState: storageStateFor('talent'),
		viewport: DESKTOP_VIEWPORT,
	});

	try {
		const venue: Page = await venueCtx.newPage();
		const talent: Page = await talentCtx.newPage();

		await test.step('venue publishes a gig through the 4-step wizard', async () => {
			await venue.goto('/dashboard/venue/create-gig');

			// Step 1 — Identity & Role
			await venue.getByPlaceholder('e.g. "Closing DJ Set – Main Room"').fill(gigTitle);
			await venue.getByRole('combobox', { name: 'Role needed' }).selectOption('DJ / Producer');
			await venue.getByRole('button', { name: 'Continue' }).click();

			// Step 2 — Logistics: tomorrow 18:00–22:00 (a 4h shift keeps the
			// estimator's hour math assertable on the talent side).
			const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
			await venue.locator('input[type="date"]').nth(0).fill(dateInputValue(tomorrow));
			await venue.locator('input[type="time"]').nth(0).fill('18:00');
			await venue.locator('input[type="date"]').nth(1).fill(dateInputValue(tomorrow));
			await venue.locator('input[type="time"]').nth(1).fill('22:00');
			await venue.getByPlaceholder('123 Club Street, New York, NY').fill('99 E2E Avenue, New York, NY');
			await venue.getByRole('button', { name: 'Continue' }).click();

			// Step 3 — Compensation. The 21+ switch defaults ON; leaving it is
			// the G12 arm the talent side asserts as a "21+ only" badge.
			await venue.getByPlaceholder('e.g. 150').fill('150');
			await venue.getByRole('button', { name: 'Continue' }).click();

			// Step 4 — Review & Publish (no redirect on success; the toast is
			// the only completion signal).
			await expect(venue.getByText(gigTitle)).toBeVisible();
			await venue.getByRole('button', { name: 'Publish Gig' }).click();
			await expect(toaster(venue)).toContainText('Gig published! Talent are being notified.');
		});

		let gigPath = '';
		await test.step('talent finds the gig in browse and deep-links to it', async () => {
			await talent.goto('/dashboard/talent/browse');
			// S17: text search is server-side and debounced, so the list narrows
			// a beat after typing — scope the click to THIS gig's card instead
			// of assuming the filtered list has settled.
			await talent.getByPlaceholder('Search gigs, venues, roles…').fill(gigTitle);
			await expect(talent.getByText(gigTitle)).toBeVisible();
			const gigCard = talent
				.locator('div')
				.filter({ hasText: gigTitle })
				.filter({ has: talent.getByRole('link', { name: 'View & Apply' }) })
				.last();
			await gigCard.getByRole('link', { name: 'View & Apply' }).click();
			await talent.waitForURL(/\/gigs\/[^/]+$/);
			gigPath = new URL(talent.url()).pathname;

			await expect(talent.getByRole('heading', { name: gigTitle })).toBeVisible();
			await expect(talent.getByText('Open', { exact: true })).toBeVisible();
			// G12: the wizard's default 21+ toggle became a badge + explainer
			// (DOM text is "21+ only"; CSS uppercases it visually).
			await expect(talent.getByText('21+ only')).toBeVisible();
			await expect(talent.getByText('You must be 21 or older to work this gig')).toBeVisible();
		});

		await test.step('fee estimator recomputes from the proposed rate', async () => {
			await talent.getByRole('spinbutton').fill('200');
			// $200/hr × 4h = $800 → −5% fee $40 → net $760.
			await expect(talent.getByText('Estimated total (4.0h)')).toBeVisible();
			await expect(talent.getByText('Marketplace fee (5%)')).toBeVisible();
			await expect(talent.getByText('Your estimated net')).toBeVisible();
			await expect(talent.getByText('$760.00')).toBeVisible();
		});

		await test.step('talent applies with a proposed rate + cover message', async () => {
			await talent.locator('textarea').fill(coverMessage);
			await talent.getByRole('button', { name: 'Submit Application' }).click();
			await expect(toaster(talent)).toContainText('Application submitted!');
			await expect(talent.getByText('✓ Application submitted')).toBeVisible();
		});

		await test.step('deep link survives refresh with state intact', async () => {
			await talent.reload();
			await expect(talent.getByRole('heading', { name: gigTitle })).toBeVisible();
			await expect(talent.getByText('✓ Application submitted')).toBeVisible();
		});

		await test.step('talent opens a thread and proposes a rate', async () => {
			await talent.getByRole('button', { name: 'Inquire about this gig' }).click();
			// S20: Inquire now lands with the created thread deep-linked (?c=).
			await talent.waitForURL('**/dashboard/talent/messages**');
			// The fresh thread is auto-selected; the xl right rail pins the gig.
			await expect(talent.getByText('Gig in focus')).toBeVisible();
			await expect(talent.getByText(gigTitle).first()).toBeVisible();

			await talent.getByRole('button', { name: 'Propose a rate' }).click();
			await talent.getByPlaceholder('Rate $/hr').fill('175');
			await talent.getByRole('button', { name: 'Propose', exact: true }).click();
			await expect(talent.getByText('Proposed $175.00/hr')).toBeVisible();
		});

		await test.step('venue accepts the proposed rate', async () => {
			await venue.goto('/dashboard/venue/messages');
			await venue.locator('aside').getByRole('button').filter({ hasText: gigTitle }).first().click();
			await expect(venue.getByText('Proposed $175.00/hr')).toBeVisible();
			await venue.getByRole('button', { name: 'Accept rate' }).click();
			await expect(toaster(venue)).toContainText('Rate accepted — it now applies to the application');
		});

		await test.step('venue shortlists then hires; a shift is scheduled', async () => {
			await venue.goto('/dashboard/venue/applicants');
			// THIS run's card is the one carrying this run's unique cover
			// message — stale cards from earlier attempts may coexist.
			await expect(venue.getByText(coverMessage).first()).toBeVisible();
			const pendingCard = venue
				.locator('div')
				.filter({ hasText: coverMessage })
				.filter({ has: venue.getByRole('button', { name: 'Shortlist' }) })
				.last();
			// The accepted rate (not the applied rate) must be on the card.
			await expect(pendingCard.getByText('$175/hr')).toBeVisible();
			await pendingCard.getByRole('button', { name: 'Shortlist' }).click();
			await expect(toaster(venue)).toContainText('Application shortlisted');

			const shortlistedCard = venue
				.locator('div')
				.filter({ hasText: coverMessage })
				.filter({ has: venue.getByRole('button', { name: 'Hire', exact: true }) })
				.last();
			await shortlistedCard.getByRole('button', { name: 'Hire', exact: true }).click();
			await expect(toaster(venue)).toContainText('Hired! The gig is now filled and a shift was scheduled.');
			await expect(
				venue.locator('div').filter({ hasText: coverMessage }).last().getByText('Hired — shift scheduled')
			).toBeVisible();
		});

		await test.step('hired talent still reaches the FILLED gig by deep link', async () => {
			await talent.goto(gigPath);
			await expect(talent.getByText('✓ You are hired for this gig 🎉')).toBeVisible();
			await expect(talent.getByText('Filled', { exact: true })).toBeVisible();
			await talent.reload();
			await expect(talent.getByText('✓ You are hired for this gig 🎉')).toBeVisible();
		});

		await test.step('actor-scoped shift: talent on-my-way → venue check-in → talent check-out', async () => {
			await talent.goto('/dashboard/talent');
			await rowAction(talent, gigTitle, 'On My Way').click();
			await expect(toaster(talent)).toContainText('Marked in transit');

			await venue.goto('/dashboard/venue');
			await expect(rowAction(venue, gigTitle, 'Check In')).toBeVisible({ timeout: 30_000 });
			await rowAction(venue, gigTitle, 'Check In').click();
			await expect(toaster(venue)).toContainText('Checked in');

			// SSE/15s polling propagates the venue's transition to the talent tab.
			await expect(rowAction(talent, gigTitle, 'Check Out')).toBeVisible({ timeout: 30_000 });
			await rowAction(talent, gigTitle, 'Check Out').click();
			await expect(toaster(talent)).toContainText('Checked out — payout is in escrow');
		});

		await test.step('checkout leaves a HELD payout on both dashboards', async () => {
			await expect(talent.getByText('Payout in escrow (24h)').first()).toBeVisible({
				timeout: 30_000,
			});
			await expect(talent.getByText('Held in escrow')).toBeVisible();

			await venue.goto('/dashboard/venue');
			// Scope to THIS run's shift row — stale checked-out shifts from
			// earlier runs carry the same escrow note.
			const opsRow = venue
				.locator('div')
				.filter({ hasText: gigTitle })
				.filter({ hasText: 'Payout held in escrow — releases 24h after checkout.' })
				.last();
			await expect(opsRow).toBeVisible({ timeout: 30_000 });
			await expect(venue.getByText(/awaiting release/)).toBeVisible();
		});
	} finally {
		await venueCtx.close();
		await talentCtx.close();
	}
});
