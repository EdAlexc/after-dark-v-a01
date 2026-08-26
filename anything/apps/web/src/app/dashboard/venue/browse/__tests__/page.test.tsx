/**
 * S20 F4 — venue Browse Talent: the saved-talent rail is server truth
 * (GET /api/venue/saved-talent — independent of the current directory page),
 * hearts write through PUT { talent_id, saved }, and Contact opens a real
 * thread via POST /api/conversations and lands on it with ?c=.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import VenueBrowsePage from '../page';
import {
	mockFetch,
	renderWithQueryClient,
	type RecordedFetch,
} from '../../../../../../test/component-utils';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
	usePathname: () => '/dashboard/venue/browse',
	useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/components/DashboardSidebar', () => ({ default: () => null }));
vi.mock('@/components/NotificationsBell', () => ({ NotificationsBell: () => null }));
vi.mock('@/components/GigsMap', () => ({ default: () => null }));

/** Public directory row (GET /api/talent). */
function talent(id: string, stage_name: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		stage_name,
		pronouns: null,
		neighborhood: 'Brooklyn',
		bio: null,
		primary_role: 'DJ',
		genres_vibes: ['House'],
		hourly_rate_min: '100',
		hourly_rate_max: '200',
		avatar_url: null,
		profile_completion_pct: 90,
		rating: null,
		rating_count: 0,
		trust_score: null,
		created_at: '2026-08-01T00:00:00Z',
		...overrides,
	};
}

/** Server-saved row that is NOT in the fetched directory page — the rail
 *  showing it proves the list is server truth, not client-local state. */
const SAVED_ROW = {
	id: 's9',
	stage_name: 'Saved Star',
	pronouns: null,
	neighborhood: 'Harlem',
	primary_role: 'Vocalist',
	genres_vibes: ['Soul'],
	hourly_rate_min: '150',
	hourly_rate_max: '300',
	avatar_url: null,
	available_tonight: null,
	rating: null,
	rating_count: 0,
	trust_score: null,
	saved_at: '2026-08-20T00:00:00Z',
};

function wireFetch() {
	return mockFetch({
		'/api/venue/saved-talent': (call: RecordedFetch) =>
			call.method === 'PUT' ? { ok: true } : { savedTalent: [SAVED_ROW] },
		'/api/talent': {
			talent: [talent('t1', 'Nova Reign'), talent('t2', 'Marcus Chen')],
			page: 1,
			pageSize: 12,
			hasMore: false,
		},
		'/api/conversations': (call: RecordedFetch) =>
			call.method === 'POST' ? { conversation: { id: 'conv-77' } } : { conversations: [] },
		'/api/notifications': { notifications: [], unreadCount: 0 },
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
	push.mockClear();
});

describe('Venue browse talent page', () => {
	it('rail renders the server-saved list, independent of the directory page', async () => {
		wireFetch();
		renderWithQueryClient(<VenueBrowsePage />);
		await waitFor(() => expect(screen.getAllByText('Nova Reign').length).toBeGreaterThan(0));
		// Saved Star is not among the fetched directory results — only the
		// server list can put it in the rail.
		await waitFor(() => expect(screen.getByText('Saved Star')).toBeInTheDocument());
		expect(screen.getByLabelText('Message Saved Star')).toBeInTheDocument();
		expect(screen.getByLabelText('Unsave Saved Star')).toBeInTheDocument();
	});

	it('saving from a card PUTs { talent_id, saved: true }', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<VenueBrowsePage />);
		const heart = await screen.findByLabelText('Save Nova Reign');
		fireEvent.click(heart);
		await waitFor(() => {
			const put = calls.find(
				(call) => call.method === 'PUT' && call.url.includes('/api/venue/saved-talent')
			);
			expect(put?.body).toEqual({ talent_id: 't1', saved: true });
		});
	});

	it("the rail row's Unsave PUTs saved: false for that talent", async () => {
		const calls = wireFetch();
		renderWithQueryClient(<VenueBrowsePage />);
		const unsave = await screen.findByLabelText('Unsave Saved Star');
		fireEvent.click(unsave);
		await waitFor(() => {
			const put = calls.find(
				(call) => call.method === 'PUT' && call.url.includes('/api/venue/saved-talent')
			);
			expect(put?.body).toEqual({ talent_id: 's9', saved: false });
		});
	});

	it('card Contact opens the thread and lands on it via ?c= (S20)', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<VenueBrowsePage />);
		await waitFor(() => expect(screen.getAllByText('Nova Reign').length).toBeGreaterThan(0));
		fireEvent.click(screen.getAllByRole('button', { name: /Contact/ })[0]);
		await waitFor(() => {
			const post = calls.find(
				(call) => call.method === 'POST' && call.url.includes('/api/conversations')
			);
			expect(post?.body).toEqual({ talent_id: 't1' });
		});
		await waitFor(() =>
			expect(push).toHaveBeenCalledWith('/dashboard/venue/messages?c=conv-77')
		);
	});

	it('card stage name deep-links to the public talent profile', async () => {
		wireFetch();
		renderWithQueryClient(<VenueBrowsePage />);
		const link = await screen.findByRole('link', { name: /Nova Reign/ });
		expect(link).toHaveAttribute('href', '/talent/t1');
	});
});
