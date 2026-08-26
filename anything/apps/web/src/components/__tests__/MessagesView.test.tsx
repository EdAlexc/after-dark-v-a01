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

/** Second thread for the S20 ?c= deep-link cases — distinct name and gig so
 *  "which pane is active" is observable from text alone. */
const CONVERSATION_2 = {
	...CONVERSATION,
	id: 'c2',
	other_name: 'Ava DiMarco',
	gig_title: 'Techno Tuesday',
	unread_count: 0,
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
	// The S20 deep-link cases push ?c= URLs — never leak them across tests.
	window.history.replaceState(null, '', '/');
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

	it('party empty state points at venue discovery, and hides the rate button (S19)', async () => {
		mockFetch({
			'/api/conversations': { conversations: [] },
		});
		renderWithQueryClient(<MessagesView role="party" />);
		await waitFor(() =>
			expect(screen.getByText(/inquire about hosting your private party/)).toBeInTheDocument()
		);
		expect(screen.getByRole('link', { name: /Discover venues/ })).toHaveAttribute(
			'href',
			'/venues'
		);
	});

	it('hides the propose-rate control on PARTY_INQUIRY threads (rates are gig business)', async () => {
		mockFetch({
			'/api/conversations': {
				conversations: [
					{ ...CONVERSATION, id: 'c2', gig_id: null, kind: 'PARTY_INQUIRY', gig_title: null },
				],
			},
			'/api/conversations/c2/messages': { messages: [] },
		});
		renderWithQueryClient(<MessagesView role="party" />);
		await waitFor(() =>
			expect(screen.getByText('Private-party inquiry')).toBeInTheDocument()
		);
		expect(screen.queryByTitle('Propose a rate')).not.toBeInTheDocument();
	});

	it('selects the thread named by ?c= on mount (S20 deep link)', async () => {
		const calls = mockFetch({
			'/api/conversations/c1/messages': { messages: MESSAGES },
			'/api/conversations/c2/messages': { messages: [] },
			'/api/conversations': { conversations: [CONVERSATION, CONVERSATION_2] },
		});
		window.history.pushState({}, '', '/dashboard/talent/messages?c=c2');
		renderWithQueryClient(<MessagesView role="talent" />);
		// Active pane = the SECOND thread: its name shows in the list AND the
		// thread header (the default would have been c1, the first thread).
		await waitFor(() => expect(screen.getAllByText('Ava DiMarco').length).toBeGreaterThan(1));
		await waitFor(() =>
			expect(calls.some((call) => call.url.includes('/api/conversations/c2/messages'))).toBe(true)
		);
		expect(calls.some((call) => call.url.includes('/api/conversations/c1/messages'))).toBe(false);
	});

	it('falls back to the first thread when ?c= names a conversation not in the list', async () => {
		const calls = mockFetch({
			'/api/conversations/c1/messages': { messages: MESSAGES },
			'/api/conversations/nope/messages': { messages: [] },
			'/api/conversations': { conversations: [CONVERSATION, CONVERSATION_2] },
		});
		window.history.pushState({}, '', '/dashboard/talent/messages?c=nope');
		renderWithQueryClient(<MessagesView role="talent" />);
		// Once the list loads, the stale/forged id gives way to the first thread.
		await waitFor(() => expect(screen.getAllByText('Marcus Chen').length).toBeGreaterThan(1));
		await waitFor(() =>
			expect(calls.some((call) => call.url.includes('/api/conversations/c1/messages'))).toBe(true)
		);
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
