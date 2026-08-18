/**
 * S17 — shared plumbing for the component-test beachhead (Q1). Every suite
 * renders under a fresh QueryClient (no retries, no shared cache between
 * tests) and mocks `fetch` per-URL.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { vi } from 'vitest';
import type { ReactElement } from 'react';

export function renderWithQueryClient(ui: ReactElement): RenderResult {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

export interface RecordedFetch {
	url: string;
	method: string;
	body: unknown;
}

type RouteHandler = (call: RecordedFetch) => unknown;

/**
 * Install a per-URL fetch mock. `routes` maps a URL substring to either a
 * JSON-serializable value or a handler; the FIRST matching key (insertion
 * order) wins, so register more specific prefixes first. Returns the call
 * log for asserting on outgoing requests.
 */
export function mockFetch(routes: Record<string, unknown | RouteHandler>): RecordedFetch[] {
	const calls: RecordedFetch[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const call: RecordedFetch = {
				url: String(input),
				method: init?.method ?? 'GET',
				body: init?.body ? JSON.parse(String(init.body)) : null,
			};
			calls.push(call);
			const key = Object.keys(routes).find((prefix) => call.url.includes(prefix));
			if (key === undefined) {
				return new Response(JSON.stringify({ error: `unmocked fetch: ${call.url}` }), { status: 404 });
			}
			const value = typeof routes[key] === 'function' ? (routes[key] as RouteHandler)(call) : routes[key];
			if (value instanceof Response) return value;
			return new Response(JSON.stringify(value), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		})
	);
	return calls;
}
