/**
 * S17 (Q1 beachhead) — the browse surface and its filter panel, plus the F7
 * regression: free-text search must reach the server as a `q` param (matches
 * beyond the fetched page were unfindable when the filter was client-side).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import BrowseGigsPage from '../page';
import { mockFetch, renderWithQueryClient } from '../../../../../../test/component-utils';

vi.mock('next/navigation', () => ({
	usePathname: () => '/dashboard/talent/browse',
	useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/components/DashboardSidebar', () => ({ default: () => null }));
vi.mock('@/components/NotificationsBell', () => ({ NotificationsBell: () => null }));
vi.mock('@/components/GigsMap', () => ({ default: () => null }));

function gig(id: string, title: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		venue_id: 'vp-1',
		title,
		role_needed: 'DJ',
		description: null,
		start_time: '2026-09-01T22:00:00Z',
		end_time: '2026-09-02T02:00:00Z',
		base_rate: '200',
		tips_included: false,
		status: 'PUBLISHED',
		created_at: '2026-08-01T00:00:00Z',
		venue_name: 'Nebula NYC',
		venue_neighborhood: 'Chelsea',
		venue_avatar_url: null,
		...overrides,
	};
}

function wireFetch() {
	return mockFetch({
		'/api/gigs': {
			gigs: [gig('g1', 'Deep House Saturday'), gig('g2', 'Rooftop Sunset')],
			page: 1,
			pageSize: 12,
			hasMore: false,
		},
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('Browse gigs page', () => {
	it('renders the fetched gigs as cards', async () => {
		wireFetch();
		renderWithQueryClient(<BrowseGigsPage />);
		await waitFor(() =>
			expect(screen.getAllByText('Deep House Saturday').length).toBeGreaterThan(0)
		);
		expect(screen.getAllByText('Rooftop Sunset').length).toBeGreaterThan(0);
	});

	it('sends free-text search to the server as a debounced q param (F7)', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<BrowseGigsPage />);
		await waitFor(() =>
			expect(screen.getAllByText('Deep House Saturday').length).toBeGreaterThan(0)
		);
		fireEvent.change(screen.getByPlaceholderText('Search gigs, venues, roles…'), {
			target: { value: 'deep house' },
		});
		await waitFor(
			() =>
				expect(
					calls.some(
						(call) => call.url.includes('/api/gigs') && call.url.includes('q=deep+house')
					)
				).toBe(true),
			{ timeout: 3000 }
		);
	});

	it('filter-panel selections become validated server params', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<BrowseGigsPage />);
		await waitFor(() =>
			expect(screen.getAllByText('Deep House Saturday').length).toBeGreaterThan(0)
		);
		fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
		fireEvent.click(await screen.findByRole('button', { name: 'Chelsea' }));
		await waitFor(() =>
			expect(
				calls.some(
					(call) => call.url.includes('/api/gigs') && call.url.includes('neighborhoods=Chelsea')
				)
			).toBe(true)
		);
	});

	it('Clear all filters drops every server param again', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<BrowseGigsPage />);
		await waitFor(() =>
			expect(screen.getAllByText('Deep House Saturday').length).toBeGreaterThan(0)
		);
		fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
		fireEvent.click(await screen.findByRole('button', { name: 'Chelsea' }));
		await waitFor(() =>
			expect(calls.some((call) => call.url.includes('neighborhoods=Chelsea'))).toBe(true)
		);
		fireEvent.click(screen.getByRole('button', { name: /Clear all filters/ }));
		await waitFor(() => {
			const last = calls[calls.length - 1];
			expect(last.url.includes('neighborhoods=')).toBe(false);
		});
	});
});
