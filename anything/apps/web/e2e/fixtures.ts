/**
 * Shared plumbing for the S16 E2E journeys — the same session scheme the
 * sibling gates use (axe smoke, Lighthouse, k6): preview accounts with
 * passwords derived from PREVIEW_ACCOUNTS_SECRET, signed in through the real
 * better-auth endpoint. Nothing here logs a credential.
 */

import path from 'node:path';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { derivePreviewPassword } from '../scripts/preview-password';

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';

export type PreviewRole = 'talent' | 'venue' | 'party' | 'admin';

export const PREVIEW_EMAILS: Record<PreviewRole, string> = {
	talent: 'talent.preview@afterdark.dev',
	venue: 'venue.preview@afterdark.dev',
	party: 'party.preview@afterdark.dev',
	admin: 'admin.preview@afterdark.dev',
};

export function previewPassword(email: string): string {
	const secret = process.env.PREVIEW_ACCOUNTS_SECRET;
	if (!secret) {
		throw new Error(
			'PREVIEW_ACCOUNTS_SECRET is required (preview-account passwords derive from it — see TESTING.md §2).'
		);
	}
	return derivePreviewPassword(secret, email);
}

/** Storage-state file for a preview role, written by auth.setup.ts. */
export function storageStateFor(role: PreviewRole): string {
	return path.join(__dirname, '.auth', `${role}.json`);
}

/**
 * Sign in through the real credential endpoint onto the given cookie jar.
 * One 429 retry: the S1 limiter allows 10 sign-ins/min/IP and the sibling
 * gates (axe, k6) sign in from the same runner IP — waiting out one window
 * beats a flaky gate.
 */
export async function signInViaApi(
	request: APIRequestContext,
	email: string,
	password: string
): Promise<void> {
	for (let attempt = 0; ; attempt += 1) {
		const res = await request.post('/api/auth/sign-in/email', {
			// Explicit Origin: better-auth's CSRF check hard-rejects origin-less
			// POSTs the moment the jar carries any cookie.
			headers: { origin: BASE_URL },
			data: { email, password },
		});
		if (res.status() === 429 && attempt === 0) {
			await new Promise((resolve) => setTimeout(resolve, 61_000));
			continue;
		}
		expect(
			res.ok(),
			`sign-in for ${email} returned HTTP ${res.status()}: ${await res.text()}`
		).toBe(true);
		return;
	}
}

/**
 * Unique throwaway identity per attempt so signup specs survive retries and
 * repeated local runs without tripping the "email already registered" path.
 */
/**
 * A truly cookie-less context. `browser.newContext()` inherits the enclosing
 * `test.use({ storageState })`, so a spec that runs under a shared preview
 * session MUST reset it before signing in (and especially before signing
 * OUT — revoking the shared session would break every later spec).
 */
export const EMPTY_STORAGE_STATE: { cookies: never[]; origins: never[] } = {
	cookies: [],
	origins: [],
};

export function uniqueEmail(prefix: string): string {
	const nonce = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
	return `${prefix}.${nonce}@e2e-test.afterdark.dev`;
}

/** A password that satisfies the signup policy, unique per identity. */
export function throwawayPassword(): string {
	return `E2e!${Math.random().toString(36).slice(2, 10)}Aa9`;
}

/**
 * Desktop viewport for journey specs: several controls are icon-only below
 * `lg` (venue gig-row actions hide their labels under 1024px) and the rails
 * (Live Analysis, Gig in Focus, thread list) are `hidden xl:*` — 1440×900
 * keeps every accessible name intact.
 */
export const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

/** Sonner mounts one `[data-sonner-toaster]` region; toasts assert against it. */
export function toaster(page: Page): Locator {
	return page.locator('[data-sonner-toaster]');
}

/**
 * The innermost card/row that contains BOTH `rowText` and a button named
 * `action` — the app has no data-testids, so rows are scoped by their own
 * text. `.last()` resolves to the deepest matching container (ancestors of
 * the row match `hasText` too, and document order lists them first).
 */
export function rowAction(page: Page, rowText: string, action: string | RegExp): Locator {
	return page
		.locator('div')
		.filter({ hasText: rowText })
		.filter({ has: page.getByRole('button', { name: action }) })
		.last()
		.getByRole('button', { name: action });
}
