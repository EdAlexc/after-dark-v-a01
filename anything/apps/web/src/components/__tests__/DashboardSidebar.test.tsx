/**
 * S17 (Q1 beachhead) — the role-modular sidebar: every role variant renders
 * its own nav (labels are the contract the E2E selectors lean on), the
 * Messages badge sums real unread counts, and the identity line shows the
 * session's name, never a hardcoded demo identity.
 *
 * jsdom applies no CSS, so the desktop rail AND the mobile drawer both
 * "render" — labels are asserted with getAllBy* on purpose.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import DashboardSidebar from '../DashboardSidebar';
import { mockFetch, renderWithQueryClient } from '../../../test/component-utils';

// Mutable so each test can steer which route is "current" — nav groups
// auto-expand only when the pathname matches one of their children.
const nav = vi.hoisted(() => ({ pathname: '/dashboard/talent' }));
vi.mock('next/navigation', () => ({
	usePathname: () => nav.pathname,
	useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/auth-client', () => ({
	authClient: {
		useSession: () => ({
			data: { user: { id: 'user-1', name: 'Nova Reign', email: 'nova@example.com' } },
			isPending: false,
		}),
	},
}));

function wireFetch() {
	return mockFetch({
		'/api/session': { user: { id: 'user-1' } },
		'/api/conversations': { conversations: [{ unread_count: 2 }, { unread_count: 1 }] },
		'/api/search': { gigs: [], talent: [] },
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

const expectNav = (labels: string[]) => {
	for (const label of labels) {
		expect(screen.getAllByText(label).length).toBeGreaterThan(0);
	}
};

describe('DashboardSidebar', () => {
	it('talent variant renders the talent nav (active group auto-expands)', () => {
		nav.pathname = '/dashboard/talent/browse';
		wireFetch();
		renderWithQueryClient(<DashboardSidebar role="talent" />);
		expectNav(['Dashboard', 'Browse Gigs', 'My Applications', 'My Schedule', 'Messages', 'My Profile']);
		expect(screen.queryByText('Post a Gig')).not.toBeInTheDocument();
	});

	it('venue variant renders the venue nav (active group auto-expands)', () => {
		nav.pathname = '/dashboard/venue/create-gig';
		wireFetch();
		renderWithQueryClient(<DashboardSidebar role="venue" />);
		expectNav(['Dashboard', 'Post a Gig', 'Browse Gigs', 'Applicants', 'Gig Calendar', 'Messages', 'Venue Profile']);
	});

	it('admin variant renders the moderation nav only', () => {
		nav.pathname = '/dashboard/admin';
		wireFetch();
		renderWithQueryClient(<DashboardSidebar role="admin" />);
		expectNav(['Moderation', 'Reports', 'Users & Gigs', 'Audit Log']);
		expect(screen.queryByText('Post a Gig')).not.toBeInTheDocument();
		expect(screen.queryByText('My Schedule')).not.toBeInTheDocument();
	});

	it('shows the real session name, not a demo identity', async () => {
		nav.pathname = '/dashboard/talent';
		wireFetch();
		renderWithQueryClient(<DashboardSidebar role="talent" />);
		await waitFor(() => expect(screen.getAllByText('Nova Reign').length).toBeGreaterThan(0));
	});

	it('sums unread conversation counts into the Messages badge', async () => {
		nav.pathname = '/dashboard/talent';
		wireFetch();
		renderWithQueryClient(<DashboardSidebar role="talent" />);
		await waitFor(() => expect(screen.getAllByText('3').length).toBeGreaterThan(0));
	});
});
