/**
 * S20 F5 — the notifications history page behind the bell's "View all":
 * ?role= (validated, post-mount) with the session role as fallback, an
 * infinite feed over GET /api/notifications?page=N rendered through the
 * shared describeNotification lines, and mark-all-read.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import NotificationsHistoryPage from '../page';
import {
	mockFetch,
	renderWithQueryClient,
	type RecordedFetch,
} from '../../../../../test/component-utils';

const nav = vi.hoisted(() => ({ pathname: '/dashboard/notifications' }));
vi.mock('next/navigation', () => ({
	usePathname: () => nav.pathname,
	useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
// Real DashboardSidebar + NotificationsBell render (house style) — the session
// comes from this mock; useMyRole resolves the role via /api/user/role below.
vi.mock('@/lib/auth-client', () => ({
	authClient: {
		useSession: () => ({
			data: { user: { id: 'user-1', name: 'Nova Reign', email: 'nova@example.com' } },
			isPending: false,
		}),
	},
}));

function historyRow(id: number, overrides: Record<string, unknown> = {}) {
	return {
		id,
		kind: 'message.received',
		payload: {},
		read_at: null,
		created_at: '2026-08-18T20:00:00Z',
		...overrides,
	};
}

const PAGE_1 = {
	notifications: [
		historyRow(1, { kind: 'application.received', payload: { gigTitle: 'Neon Nights' } }),
		...Array.from({ length: 29 }, (_, index) => historyRow(index + 2)),
	],
	unreadCount: 5,
	page: 1,
	hasMore: true,
};

const PAGE_2 = {
	notifications: [
		historyRow(31, { kind: 'payout.released', payload: { netCents: 12345 } }),
		historyRow(32),
	],
	unreadCount: 5,
	page: 2,
	hasMore: false,
};

function wireFetch() {
	return mockFetch({
		// More specific prefixes first — the bare endpoint serves the header
		// bell's GET and the mark-all-read POST.
		'/api/notifications?page=2': PAGE_2,
		'/api/notifications?page=1': PAGE_1,
		'/api/notifications': (call: RecordedFetch) =>
			call.method === 'POST' ? { updated: 5 } : { notifications: [], unreadCount: 0 },
		'/api/user/role': { user: { role: 'VENUE' } },
		'/api/session': { user: { id: 'user-1' } },
		'/api/conversations': { conversations: [] },
		'/api/search': { gigs: [], talent: [], venues: [] },
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
	// The ?role= case pushes a URL — never leak it across tests.
	window.history.replaceState(null, '', '/');
});

describe('Notifications history page', () => {
	it('renders the feed through describeNotification, role from the session fallback', async () => {
		wireFetch();
		renderWithQueryClient(<NotificationsHistoryPage />);
		await waitFor(() =>
			expect(screen.getByText('New application for Neon Nights')).toBeInTheDocument()
		);
		expect(screen.getAllByText('New message')).toHaveLength(29);
		expect(screen.getByText('5 unread')).toBeInTheDocument();
		// No ?role= in the URL → useMyRole (VENUE) steers the deep links.
		await waitFor(() => {
			const messageLinks = screen.getAllByRole('link', { name: /New message/ });
			expect(messageLinks[0]).toHaveAttribute('href', '/dashboard/venue/messages');
		});
	});

	it('pages older notifications until the server says hasMore: false', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<NotificationsHistoryPage />);
		const loadMore = await screen.findByRole('button', { name: 'Load older notifications' });
		fireEvent.click(loadMore);
		await waitFor(() =>
			expect(screen.getByText('Payout released: $123.45')).toBeInTheDocument()
		);
		expect(calls.some((call) => call.url.includes('/api/notifications?page=2'))).toBe(true);
		// Page 2 closed the feed — the control is gone.
		expect(
			screen.queryByRole('button', { name: 'Load older notifications' })
		).not.toBeInTheDocument();
	});

	it('mark-all-read POSTs an empty body to the notifications endpoint', async () => {
		const calls = wireFetch();
		renderWithQueryClient(<NotificationsHistoryPage />);
		const markRead = await screen.findByRole('button', { name: /Mark all read/ });
		fireEvent.click(markRead);
		await waitFor(() => {
			const post = calls.find(
				(call) => call.method === 'POST' && call.url.includes('/api/notifications')
			);
			expect(post?.body).toEqual({});
		});
	});

	it('?role=party drives the sidebar to the party nav (validated param beats session role)', async () => {
		wireFetch();
		window.history.pushState({}, '', '/dashboard/notifications?role=party');
		renderWithQueryClient(<NotificationsHistoryPage />);
		await waitFor(() =>
			expect(screen.getAllByText('Discover Venues').length).toBeGreaterThan(0)
		);
		// The session says VENUE — the param must win, so no venue nav tells.
		expect(screen.queryByText('Post a Gig')).not.toBeInTheDocument();
		expect(screen.queryByText('Venue Profile')).not.toBeInTheDocument();
	});
});
