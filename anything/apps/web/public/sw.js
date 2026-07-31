/**
 * AfterDark service worker (P10.2) — hand-written and dependency-free.
 *
 * Security contract (TENANT_GUARDRAIL §6.6), in order of importance:
 *   1. NEVER cache authenticated responses. `/api/*` requests are not even
 *      intercepted, and navigations (HTML — session-scoped and nonce-CSP'd)
 *      are network-only; the only cached HTML is the static, script-free
 *      offline fallback page.
 *   2. Purge everything on logout: the page calls the Cache API directly and
 *      also posts {type: 'PURGE_CACHES'} here (see src/lib/pwa.ts).
 *   3. Cache only what is provably non-personal: the precache list below and
 *      immutable hashed build assets under /_next/static/.
 *
 * Update flow: new versions skipWaiting + claim immediately so stale bundles
 * don't linger past a deploy (§6.6); bump VERSION to invalidate old caches.
 *
 * Behavioral tests drive this file in a sandbox: test/service-worker.test.ts.
 */

const VERSION = 'v1';
const PRECACHE = `afterdark-precache-${VERSION}`;
const RUNTIME = `afterdark-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
	OFFLINE_URL,
	'/manifest.webmanifest',
	'/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(PRECACHE)
			.then((cache) => cache.addAll(PRECACHE_URLS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith('afterdark-') && !key.endsWith(VERSION))
						.map((key) => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'PURGE_CACHES') {
		event.waitUntil(
			caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
		);
	}
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	// Non-GET can carry credentials/state transitions — never intercepted.
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	// Cross-origin (e.g. Sentry ingest) — never intercepted.
	if (url.origin !== self.location.origin) return;
	// API responses are authenticated/tenant-scoped — never intercepted, so
	// they can never end up in Cache Storage (§6.6 hard rule).
	if (url.pathname.startsWith('/api/') || url.pathname === '/api') return;

	// Navigations: network-only (session HTML must stay fresh and uncached);
	// the precached offline page is the only fallback.
	if (request.mode === 'navigate') {
		event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
		return;
	}

	// Immutable hashed build assets: cache-first (safe — content-addressed,
	// identical for every user).
	if (url.pathname.startsWith('/_next/static/')) {
		event.respondWith(
			caches.match(request).then(
				(cached) =>
					cached ||
					fetch(request).then((response) => {
						if (response.ok) {
							const copy = response.clone();
							event.waitUntil(caches.open(RUNTIME).then((cache) => cache.put(request, copy)));
						}
						return response;
					})
			)
		);
		return;
	}

	// Precached shell assets (manifest, icons): cache-first so an installed
	// app can boot its chrome offline.
	if (PRECACHE_URLS.includes(url.pathname)) {
		event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
		return;
	}

	// Everything else (public images, fontawesome proxy, …): untouched —
	// default browser networking, nothing stored.
});
