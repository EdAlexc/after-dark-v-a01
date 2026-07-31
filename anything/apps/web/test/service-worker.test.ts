/**
 * Behavioral tests for public/sw.js (P10.2), driven in a vm sandbox with a
 * fake CacheStorage. These encode the TENANT_GUARDRAIL §6.6 contract:
 * authenticated responses (/api/*, session HTML) must never enter Cache
 * Storage, offline navigation falls back to the precached static page, and
 * PURGE_CACHES empties everything.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SW_SOURCE = readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://afterdark.test';

type FakeRequest = { method: string; url: string; mode?: string };

function cacheKey(request: FakeRequest | string): string {
	const url = typeof request === 'string' ? request : request.url;
	return new URL(url, ORIGIN).toString();
}

class FakeCache {
	store = new Map<string, unknown>();
	async addAll(urls: string[]): Promise<void> {
		for (const url of urls) this.store.set(cacheKey(url), { precached: url });
	}
	async put(request: FakeRequest | string, response: unknown): Promise<void> {
		this.store.set(cacheKey(request), response);
	}
	async match(request: FakeRequest | string): Promise<unknown> {
		return this.store.get(cacheKey(request));
	}
}

class FakeCacheStorage {
	stores = new Map<string, FakeCache>();
	async open(name: string): Promise<FakeCache> {
		if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
		return this.stores.get(name)!;
	}
	async keys(): Promise<string[]> {
		return [...this.stores.keys()];
	}
	async delete(name: string): Promise<boolean> {
		return this.stores.delete(name);
	}
	async match(request: FakeRequest | string): Promise<unknown> {
		for (const cache of this.stores.values()) {
			const hit = await cache.match(request);
			if (hit) return hit;
		}
		return undefined;
	}
	/** Total entries across every cache — for "nothing was stored" assertions. */
	entryCount(): number {
		let count = 0;
		for (const cache of this.stores.values()) count += cache.store.size;
		return count;
	}
}

type Harness = {
	listeners: Map<string, (event: unknown) => void>;
	cacheStorage: FakeCacheStorage;
	fetchMock: ReturnType<typeof vi.fn>;
	sw: {
		skipWaiting: ReturnType<typeof vi.fn>;
		clients: {
			claim: ReturnType<typeof vi.fn>;
			matchAll: ReturnType<typeof vi.fn>;
			openWindow: ReturnType<typeof vi.fn>;
		};
		registration: { showNotification: ReturnType<typeof vi.fn> };
	};
};

function loadSw(): Harness {
	const listeners = new Map<string, (event: unknown) => void>();
	const cacheStorage = new FakeCacheStorage();
	const fetchMock = vi.fn();
	const sw = {
		addEventListener: (type: string, handler: (event: unknown) => void) => {
			listeners.set(type, handler);
		},
		skipWaiting: vi.fn().mockResolvedValue(undefined),
		clients: {
			claim: vi.fn().mockResolvedValue(undefined),
			matchAll: vi.fn().mockResolvedValue([]),
			openWindow: vi.fn().mockResolvedValue(undefined),
		},
		registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
		location: { origin: ORIGIN },
	};
	const sandbox = { self: sw, caches: cacheStorage, fetch: fetchMock, URL, console };
	vm.createContext(sandbox);
	vm.runInContext(SW_SOURCE, sandbox);
	return { listeners, cacheStorage, fetchMock, sw };
}

function makeEvent(request?: FakeRequest) {
	const waited: Promise<unknown>[] = [];
	const event = {
		request,
		data: undefined as unknown,
		responded: undefined as unknown,
		waited,
		respondWith(promise: unknown) {
			this.responded = promise;
		},
		waitUntil(promise: Promise<unknown>) {
			waited.push(promise);
		},
	};
	return event;
}

async function settle(event: ReturnType<typeof makeEvent>) {
	await Promise.all(event.waited);
}

function get(pathname: string, mode = 'no-cors'): FakeRequest {
	return { method: 'GET', url: ORIGIN + pathname, mode };
}

async function install(harness: Harness) {
	const event = makeEvent();
	harness.listeners.get('install')!(event);
	await settle(event);
}

function okResponse(body: string) {
	const response = { ok: true, body, clone: () => ({ ok: true, body, clonedFrom: body }) };
	return response;
}

describe('service worker (§6.6 contract)', () => {
	it('install precaches the offline page and activates immediately', async () => {
		const harness = loadSw();
		await install(harness);
		expect(await harness.cacheStorage.match('/offline.html')).toBeTruthy();
		expect(harness.sw.skipWaiting).toHaveBeenCalled();
	});

	it('never intercepts /api requests — authenticated responses cannot be cached', async () => {
		const harness = loadSw();
		await install(harness);
		const before = harness.cacheStorage.entryCount();
		for (const pathname of ['/api', '/api/notifications', '/api/conversations/1/messages']) {
			const event = makeEvent(get(pathname));
			harness.listeners.get('fetch')!(event);
			await settle(event);
			expect(event.responded).toBeUndefined();
		}
		expect(harness.fetchMock).not.toHaveBeenCalled();
		expect(harness.cacheStorage.entryCount()).toBe(before);
	});

	it('never intercepts non-GET or cross-origin requests', async () => {
		const harness = loadSw();
		for (const request of [
			{ method: 'POST', url: `${ORIGIN}/gigs`, mode: 'no-cors' },
			{ method: 'GET', url: 'https://evil.example/steal', mode: 'no-cors' },
		]) {
			const event = makeEvent(request);
			harness.listeners.get('fetch')!(event);
			expect(event.responded).toBeUndefined();
		}
		expect(harness.fetchMock).not.toHaveBeenCalled();
	});

	it('serves navigations network-only and does not store the HTML', async () => {
		const harness = loadSw();
		await install(harness);
		const before = harness.cacheStorage.entryCount();
		const html = okResponse('<html>dashboard, full of PII</html>');
		harness.fetchMock.mockResolvedValueOnce(html);
		const event = makeEvent(get('/dashboard/talent', 'navigate'));
		harness.listeners.get('fetch')!(event);
		await settle(event);
		expect(await event.responded).toBe(html);
		expect(harness.cacheStorage.entryCount()).toBe(before);
	});

	it('falls back to the precached offline page when a navigation fails', async () => {
		const harness = loadSw();
		await install(harness);
		harness.fetchMock.mockRejectedValueOnce(new TypeError('offline'));
		const event = makeEvent(get('/dashboard/venue', 'navigate'));
		harness.listeners.get('fetch')!(event);
		await settle(event);
		expect(await event.responded).toEqual({ precached: '/offline.html' });
	});

	it('caches immutable /_next/static assets cache-first', async () => {
		const harness = loadSw();
		const asset = okResponse('hashed js chunk');
		harness.fetchMock.mockResolvedValueOnce(asset);

		const first = makeEvent(get('/_next/static/chunks/app.js'));
		harness.listeners.get('fetch')!(first);
		expect(await first.responded).toBe(asset);
		await settle(first);

		const second = makeEvent(get('/_next/static/chunks/app.js'));
		harness.listeners.get('fetch')!(second);
		const served = (await second.responded) as { clonedFrom?: string };
		expect(served.clonedFrom).toBe('hashed js chunk');
		expect(harness.fetchMock).toHaveBeenCalledTimes(1);
	});

	it('PURGE_CACHES deletes every cache (logout, §6.6)', async () => {
		const harness = loadSw();
		await install(harness);
		expect(harness.cacheStorage.entryCount()).toBeGreaterThan(0);
		const event = makeEvent();
		event.data = { type: 'PURGE_CACHES' };
		harness.listeners.get('message')!(event);
		await settle(event);
		expect(await harness.cacheStorage.keys()).toEqual([]);
	});

	it('activate drops caches from previous versions but not foreign caches', async () => {
		const harness = loadSw();
		await harness.cacheStorage.open('afterdark-precache-v0');
		await harness.cacheStorage.open('unrelated-cache');
		const event = makeEvent();
		harness.listeners.get('activate')!(event);
		await settle(event);
		const keys = await harness.cacheStorage.keys();
		expect(keys).not.toContain('afterdark-precache-v0');
		expect(keys).toContain('unrelated-cache');
		expect(harness.sw.clients.claim).toHaveBeenCalled();
	});
});

// ─── S9 Web Push (§6.6 extended: the push path must not fetch or cache) ──────

function makePushEvent(payload: unknown) {
	const event = makeEvent();
	(event as { data?: unknown }).data =
		payload === undefined ? undefined : { json: () => payload };
	return event;
}

describe('service worker — push (S9)', () => {
	it('shows a generic notification for a well-formed id-only payload', async () => {
		const harness = loadSw();
		const event = makePushEvent({ kind: 'hot_gig', gigId: 'gig-1' });
		harness.listeners.get('push')!(event);
		await settle(event);
		expect(harness.sw.registration.showNotification).toHaveBeenCalledTimes(1);
		const [title, options] = harness.sw.registration.showNotification.mock.calls[0] as [
			string,
			{ body: string; data: { url: string } },
		];
		// Generic copy only — a push payload carries no names/titles to show.
		expect(title).toContain('Hot gig');
		expect(options.data.url).toBe('/gigs/gig-1');
	});

	it('ignores malformed, foreign, or non-string-id payloads', async () => {
		const harness = loadSw();
		for (const payload of [
			undefined,
			null,
			{ kind: 'other' },
			{ kind: 'hot_gig' },
			{ kind: 'hot_gig', gigId: 42 },
		]) {
			const event = makePushEvent(payload);
			harness.listeners.get('push')!(event);
			await settle(event);
		}
		expect(harness.sw.registration.showNotification).not.toHaveBeenCalled();
	});

	it('never fetches or caches anything on the push path (§6.6)', async () => {
		const harness = loadSw();
		const before = harness.cacheStorage.entryCount();
		const event = makePushEvent({ kind: 'hot_gig', gigId: 'gig-1' });
		harness.listeners.get('push')!(event);
		await settle(event);
		expect(harness.fetchMock).not.toHaveBeenCalled();
		expect(harness.cacheStorage.entryCount()).toBe(before);
	});

	it('notification click opens the deep link only for same-origin paths', async () => {
		const harness = loadSw();
		const click = makeEvent() as ReturnType<typeof makeEvent> & {
			notification?: unknown;
		};
		click.notification = { close: vi.fn(), data: { url: '/gigs/gig-1' } };
		harness.listeners.get('notificationclick')!(click);
		await settle(click);
		expect(harness.sw.clients.openWindow).toHaveBeenCalledWith('/gigs/gig-1');

		const evil = makeEvent() as ReturnType<typeof makeEvent> & { notification?: unknown };
		evil.notification = { close: vi.fn(), data: { url: 'https://evil.example/x' } };
		harness.listeners.get('notificationclick')!(evil);
		await settle(evil);
		expect(harness.sw.clients.openWindow).toHaveBeenCalledTimes(1);
	});
});
