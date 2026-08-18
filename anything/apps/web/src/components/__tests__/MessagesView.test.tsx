/**
 * S17 (Q1 beachhead) — the chat surface: thread list, auto-select, rate
 * proposals with the recipient-only Accept button, and the behavioral
 * render-XSS case S15's structural gate promised this harness would carry:
 * hostile message content must render as inert text, never as markup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MessagesView } from '../MessagesView';
import { mockFetch, renderWithQueryClient } from '../../../test/component-utils';

vi.mock('next/navigation', () => ({
	usePathname: () => '/dashboard/talent/messages',
	useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/components/DashboardSidebar', () => ({ default: () => null }));
vi.mock('@/components/NotificationsBell', () => ({ NotificationsBell: () => null }));
vi.mock('@/lib/auth-client', () => ({
	authClient: {
		useSession: () => ({ data: { user: { id: 'me', name: 'Me' } }, isPending: false }),
	},
}));

const XSS_PAYLOAD = '<img src=x onerror="document.title=\'pwned\'"><script>document.title="pwned"</script>';

const CONVERSATION = {
	id: 'c1',
	gig_id: 'g1',
	kind: 'GIG',
	other_name: 'Marcus Chen',
	gig_title: 'Deep House Saturday',
	gig_status: 'PUBLISHED',
	gig_base_rate: '450',
	gig_start_time: '2026-09-01T22:00:00Z',
	last_content: 'hey',
	last_kind: 'TEXT',
	last_at: '2026-08-18T20:00:00Z',
	unread_count: 1,
};

const MESSAGES = [
	{
		id: 'm1',
		sender_id: 'other',
		content: XSS_PAYLOAD,
		kind: 'TEXT',
		rate_cents: null,
		attachment_url: null,
		created_at: '2026-08-18T20:00:00Z',
	},
	{
		id: 'm2',
		sender_id: 'other',
		content: '',
		kind: 'RATE_PROPOSAL',
		rate_cents: 17500,
		attachment_url: null,
		created_at: '2026-08-18T20:01:00Z',
	},
	{
		id: 'm3',
		sender_id: 'me',
		content: '',
		kind: 'RATE_PROPOSAL',
		rate_cents: 20000,
		attachment_url: null,
		created_at: '2026-08-18T20:02:00Z',
	},
];

beforeEach(() => {
	// jsdom has no scrollIntoView; the thread pane calls it on new messages.
	Element.prototype.scrollIntoView = vi.fn();
	mockFetch({
		'/api/conversations/c1/messages': { messages: MESSAGES },
		'/api/conversations': { conversations: [CONVERSATION] },
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('MessagesView', () => {
	it('lists the thread and auto-selects it', async () => {
		renderWithQueryClient(<MessagesView role="talent" />);
		await waitFor(() =>
			expect(screen.getAllByText('Marcus Chen').length).toBeGreaterThan(0)
		);
		await waitFor(() =>
			expect(screen.getAllByText(/Deep House Saturday/).length).toBeGreaterThan(0)
		);
	});

	it('renders rate proposals with Accept ONLY on the counterpart bubble', async () => {
		renderWithQueryClient(<MessagesView role="talent" />);
		await waitFor(() => expect(screen.getByText('Proposed $175.00/hr')).toBeInTheDocument());
		expect(screen.getByText('Proposed $200.00/hr')).toBeInTheDocument();
		// Two proposals in the thread, but only the OTHER side's is acceptable.
		expect(screen.getAllByRole('button', { name: 'Accept rate' })).toHaveLength(1);
	});

	it('renders hostile message content as inert text (behavioral XSS gate)', async () => {
		const { container } = renderWithQueryClient(<MessagesView role="talent" />);
		await waitFor(() =>
			expect(
				screen.getByText((text) => text.includes('<img src=x'))
			).toBeInTheDocument()
		);
		// The payload must never become live DOM: no injected img/script, no
		// side effects from onerror handlers.
		expect(container.querySelector('img[src="x"]')).toBeNull();
		expect(container.querySelector('script')).toBeNull();
		expect(document.title).not.toBe('pwned');
	});
});
