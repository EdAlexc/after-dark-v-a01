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

// ─── Web Push opt-in (S9) ────────────────────────────────────────────────────

/** Chrome hands `applicationServerKey` as a BufferSource, not base64url. */
function base64UrlToUint8Array(base64Url: string): Uint8Array {
	const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
	const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export type PushOptInResult = 'subscribed' | 'denied' | 'unsupported' | 'unavailable';

/**
 * Ask permission, subscribe this browser, and register the subscription with
 * the server. Resolves a status the UI can explain; never throws.
 */
export async function subscribeToPush(): Promise<PushOptInResult> {
	if (
		typeof window === 'undefined' ||
		!('serviceWorker' in navigator) ||
		!('PushManager' in window) ||
		!('Notification' in window)
	) {
		return 'unsupported';
	}
	try {
		const status = await fetch('/api/push/subscribe');
		if (!status.ok) return 'unavailable';
		const { enabled, vapidPublicKey } = (await status.json()) as {
			enabled: boolean;
			vapidPublicKey: string | null;
		};
		if (!enabled || !vapidPublicKey) return 'unavailable';

		const permission = await Notification.requestPermission();
		if (permission !== 'granted') return 'denied';

		const registration = await navigator.serviceWorker.ready;
		const subscription =
			(await registration.pushManager.getSubscription()) ??
			(await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: base64UrlToUint8Array(vapidPublicKey) as BufferSource,
			}));

		const saved = await fetch('/api/push/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(subscription.toJSON()),
		});
		return saved.ok ? 'subscribed' : 'unavailable';
	} catch {
		return 'unavailable';
	}
}

/** Drop this browser's subscription locally and server-side. Never throws. */
export async function unsubscribeFromPush(): Promise<void> {
	if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();
		if (!subscription) return;
		const endpoint = subscription.endpoint;
		await subscription.unsubscribe();
		await fetch('/api/push/subscribe', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ endpoint }),
		});
	} catch {
		// Best-effort — a stale server row is pruned on the next failed send.
	}
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
