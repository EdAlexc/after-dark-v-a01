/**
 * S17 (Q1 beachhead) — the real bell: unread badge, dropdown items with
 * role-aware deep links, mark-all-read, and the admin fallback added when
 * the 8 dead decorative bells were replaced (F2).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { NotificationsBell } from '../NotificationsBell';
import { mockFetch, renderWithQueryClient } from '../../../test/component-utils';

function notification(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		kind: 'message.received',
		payload: {},
		read_at: null,
		created_at: '2026-08-18T20:00:00Z',
		...overrides,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('NotificationsBell', () => {
	it('shows the unread badge and caps it at 9+', async () => {
		mockFetch({
			'/api/notifications': { notifications: [notification()], unreadCount: 12 },
		});
		renderWithQueryClient(<NotificationsBell role="talent" />);
		await waitFor(() => expect(screen.getByText('9+')).toBeInTheDocument());
	});

	it('renders no badge or mark-all-read when everything is read', async () => {
		mockFetch({
			'/api/notifications': {
				notifications: [notification({ read_at: '2026-08-18T20:01:00Z' })],
				unreadCount: 0,
			},
		});
		renderWithQueryClient(<NotificationsBell role="talent" />);
		fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
		await waitFor(() => expect(screen.getByText('New message')).toBeInTheDocument());
		expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
	});

	it('deep-links per role: talent goes to talent messages', async () => {
		mockFetch({
			'/api/notifications': { notifications: [notification()], unreadCount: 1 },
		});
		renderWithQueryClient(<NotificationsBell role="talent" />);
		fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
		const item = await screen.findByRole('link', { name: /New message/ });
		expect(item).toHaveAttribute('href', '/dashboard/talent/messages');
	});

	it('admin deep links fall back to the moderation dashboard (no 404 surfaces)', async () => {
		mockFetch({
			'/api/notifications': { notifications: [notification()], unreadCount: 1 },
		});
		renderWithQueryClient(<NotificationsBell role="admin" />);
		fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
		const item = await screen.findByRole('link', { name: /New message/ });
		expect(item).toHaveAttribute('href', '/dashboard/admin');
	});

	it('party message notifications deep-link to the party inbox (S19)', async () => {
		mockFetch({
			'/api/notifications': { notifications: [notification()], unreadCount: 1 },
		});
		renderWithQueryClient(<NotificationsBell role="party" />);
		fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
		const item = await screen.findByRole('link', { name: /New message/ });
		expect(item).toHaveAttribute('href', '/dashboard/party/messages');
	});

	it('party non-message notifications fall back to venue discovery, never a principal surface', async () => {
		mockFetch({
			'/api/notifications': {
				notifications: [notification({ kind: 'payout.released' })],
				unreadCount: 1,
			},
		});
		renderWithQueryClient(<NotificationsBell role="party" />);
		fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
		const item = await screen.findByRole('link', { name: /Payout released/ });
		expect(item).toHaveAttribute('href', '/venues');
	});

	it('mark-all-read POSTs to the notifications endpoint', async () => {
		const calls = mockFetch({
			'/api/notifications': (call: import('../../../test/component-utils').RecordedFetch) =>
				call.method === 'POST'
					? { updated: 1 }
					: { notifications: [notification()], unreadCount: 2 },
		});
		renderWithQueryClient(<NotificationsBell role="venue" />);
		fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
		const markRead = await screen.findByText('Mark all read');
		fireEvent.click(markRead);
		await waitFor(() =>
			expect(
				calls.some((call) => call.method === 'POST' && call.url.includes('/api/notifications'))
			).toBe(true)
		);
	});

	it('degrades to the empty state for a signed-out fetch failure', async () => {
		mockFetch({
			'/api/notifications': () => new Response('{}', { status: 401 }),
		});
		renderWithQueryClient(<NotificationsBell role="talent" />);
		fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
		await waitFor(() =>
			expect(screen.getByText(/Nothing yet — activity on your gigs/)).toBeInTheDocument()
		);
	});
});
