/**
 * S17 (Q1 beachhead) — the create-gig wizard, centered on the F3 draft
 * integrity contract: Save Draft is gated on a real title, sends the form's
 * REAL values (no fabricated "Untitled Gig" / 2026-01-01 fillers), retains
 * the created id so re-saves PATCH the same row, and Publish promotes the
 * saved draft instead of inserting a twin.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import CreateGigPage from '../page';
import { mockFetch, renderWithQueryClient, type RecordedFetch } from '../../../../../../test/component-utils';

vi.mock('next/navigation', () => ({
	usePathname: () => '/dashboard/venue/create-gig',
	useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/components/DashboardSidebar', () => ({ default: () => null }));
vi.mock('@/components/NotificationsBell', () => ({ NotificationsBell: () => null }));

const PREVIEW = {
	matches: { total: 0, availableTonight: 0, availableOnDate: null },
	candidates: [],
	pricing: { sample: 0, p25: null, median: null, p75: null },
};

function wireFetch(): RecordedFetch[] {
	return mockFetch({
		'/api/gigs/match-preview': PREVIEW,
		'/api/gigs/gig-123': { gig: { id: 'gig-123' } },
		'/api/gigs': (call: RecordedFetch) =>
			call.method === 'POST'
				? { gig: { id: 'gig-123', status: (call.body as { status: string }).status } }
				: { gigs: [] },
	});
}

function fillTitle(value: string) {
	fireEvent.change(screen.getByPlaceholderText('e.g. "Closing DJ Set – Main Room"'), {
		target: { value },
	});
}

function saveDraftButton() {
	return screen.getByRole('button', { name: /Save Draft/ });
}

async function goToReviewStep() {
	// No per-step validation — Continue advances; the Review step swaps the
	// step indicator for the Preview/Publish controls.
	for (let i = 0; i < 3; i += 1) {
		fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
	}
	await screen.findByRole('button', { name: /Publish Gig/ });
}

const gigWrites = (calls: RecordedFetch[]) =>
	calls.filter((call) => call.method !== 'GET' && !call.url.includes('match-preview'));

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('Create-gig wizard (F3 draft integrity)', () => {
	it('gates Save Draft on a real title instead of fabricating one', async () => {
		wireFetch();
		renderWithQueryClient(<CreateGigPage />);
		expect(saveDraftButton()).toBeDisabled();
		fillTitle('Ro');
		expect(saveDraftButton()).toBeDisabled();
		fillTitle('Rooftop Sunset Set');
		expect(saveDraftButton()).toBeEnabled();
	});

	it('first save POSTs the real form values — no Untitled Gig, no invented dates', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<CreateGigPage />);
		fillTitle('Rooftop Sunset Set');
		fireEvent.click(saveDraftButton());
		await waitFor(() => expect(gigWrites(calls)).toHaveLength(1));

		const [create] = gigWrites(calls);
		expect(create.method).toBe('POST');
		const body = create.body as Record<string, unknown>;
		expect(body.status).toBe('DRAFT');
		expect(body.title).toBe('Rooftop Sunset Set');
		// The old handler invented these; empty must stay empty (API stores NULL).
		expect(body.start_time).toBe('');
		expect(body.end_time).toBe('');
		expect(JSON.stringify(body)).not.toContain('Untitled');
		expect(JSON.stringify(body)).not.toContain('2026-01-01');

		// The honest saved-state label — no autosave implication.
		await screen.findByText(/re-saving updates it/);
	});

	it('re-saving PATCHes the SAME draft instead of inserting a duplicate', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<CreateGigPage />);
		fillTitle('Rooftop Sunset Set');
		fireEvent.click(saveDraftButton());
		await waitFor(() => expect(gigWrites(calls)).toHaveLength(1));

		// The first save's pending state disables the button a beat past the
		// fetch call itself — wait for re-enable or the second click no-ops.
		await waitFor(() => expect(saveDraftButton()).toBeEnabled());
		fireEvent.click(saveDraftButton());
		await waitFor(() => expect(gigWrites(calls)).toHaveLength(2));
		const [, resave] = gigWrites(calls);
		expect(resave.method).toBe('PATCH');
		expect(resave.url).toContain('/api/gigs/gig-123');
		// Exactly one POST ever — the duplicate-draft bug stays dead.
		expect(gigWrites(calls).filter((call) => call.method === 'POST')).toHaveLength(1);
	});

	it('Preview is disabled until a draft exists, then links to the real listing', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<CreateGigPage />);
		fillTitle('Rooftop Sunset Set');
		await goToReviewStep();
		expect(screen.getByRole('button', { name: /Preview/ })).toBeDisabled();

		fireEvent.click(saveDraftButton());
		await waitFor(() => expect(gigWrites(calls)).toHaveLength(1));
		const link = await screen.findByRole('link', { name: /Preview/ });
		expect(link).toHaveAttribute('href', '/gigs/gig-123');
	});

	it('publishing a saved draft promotes it (content PATCH + status PATCH, no POST)', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<CreateGigPage />);
		fillTitle('Rooftop Sunset Set');
		fireEvent.change(screen.getByRole('combobox', { name: 'Role needed' }), {
			target: { value: 'DJ / Producer' },
		});
		fireEvent.click(saveDraftButton());
		await waitFor(() => expect(gigWrites(calls)).toHaveLength(1));
		await waitFor(() => expect(saveDraftButton()).toBeEnabled());

		await goToReviewStep();
		fireEvent.click(screen.getByRole('button', { name: /Publish Gig/ }));
		await waitFor(() => expect(gigWrites(calls)).toHaveLength(3));

		const [, content, publish] = gigWrites(calls);
		expect(content.method).toBe('PATCH');
		expect(content.url).toContain('/api/gigs/gig-123');
		expect((content.body as Record<string, unknown>).title).toBe('Rooftop Sunset Set');
		expect(publish.method).toBe('PATCH');
		expect(publish.body).toEqual({ status: 'PUBLISHED' });
		// Only the initial save may POST; publishing must never insert a twin.
		expect(gigWrites(calls).slice(1).every((call) => call.method === 'PATCH')).toBe(true);
	});

	it('publishing without a saved draft POSTs real values (no invented dates)', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<CreateGigPage />);
		fillTitle('One-shot Publish');
		fireEvent.change(screen.getByRole('combobox', { name: 'Role needed' }), {
			target: { value: 'DJ / Producer' },
		});
		await goToReviewStep();
		fireEvent.click(screen.getByRole('button', { name: /Publish Gig/ }));
		await waitFor(() => expect(gigWrites(calls)).toHaveLength(1));
		const [publish] = gigWrites(calls);
		expect(publish.method).toBe('POST');
		const body = publish.body as Record<string, unknown>;
		expect(body.status).toBe('PUBLISHED');
		expect(JSON.stringify(body)).not.toContain('2026-01-01');
	});
});
