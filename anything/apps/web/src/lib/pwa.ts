/**
 * PWA client lifecycle (P10.2): service-worker registration and the §6.6
 * logout cache purge. Kept as plain functions (no component) so both are
 * unit-testable and callable from any client code path.
 */

/**
 * Register /sw.js. Production-only (dev HMR and a service worker fight over
 * freshness) and progressive enhancement — every failure path is silent
 * because the app is fully functional without a worker.
 */
export function registerServiceWorker(): void {
	if (typeof window === 'undefined') return;
	if (!('serviceWorker' in navigator)) return;
	if (process.env.NODE_ENV !== 'production') return;
	navigator.serviceWorker.register('/sw.js').catch(() => {
		// Progressive enhancement: unsupported/blocked workers are fine.
	});
}

/**
 * Delete every Cache Storage entry this origin holds (§6.6 — "purge caches on
 * logout"). Belt and braces: the worker never caches authenticated responses
 * in the first place (see public/sw.js), so this clears only shell/static
 * entries — but purging everything keeps the invariant trivially auditable.
 *
 * Calls the Cache API directly (works even when no worker controls the page
 * yet) and additionally posts PURGE_CACHES so an active worker clears any
 * write that raced the logout.
 */
export async function purgeSwCaches(): Promise<void> {
	if (typeof caches === 'undefined') return;
	try {
		const keys = await caches.keys();
		await Promise.all(keys.map((key) => caches.delete(key)));
		if (typeof navigator !== 'undefined') {
			navigator.serviceWorker?.controller?.postMessage({ type: 'PURGE_CACHES' });
		}
	} catch {
		// Best-effort: the worker stores no authenticated content, so a failed
		// purge cannot strand PII; don't block logout on it.
	}
}
