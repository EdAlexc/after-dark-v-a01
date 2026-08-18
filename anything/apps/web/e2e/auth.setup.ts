/**
 * Setup project: sign each preview role in ONCE and persist the session as
 * Playwright storage state. The specs reuse these files instead of signing in
 * per test — deliberate, because every request in CI comes from one IP and
 * the S1 limiter allows 10 sign-ins/minute (src/lib/auth.ts rateLimit).
 */

import { test as setup } from '@playwright/test';
import { PREVIEW_EMAILS, previewPassword, signInViaApi, storageStateFor, type PreviewRole } from './fixtures';

const ROLES: PreviewRole[] = ['talent', 'venue', 'party', 'admin'];

for (const role of ROLES) {
	setup(`sign in ${role} preview account`, async ({ request }) => {
		await signInViaApi(request, PREVIEW_EMAILS[role], previewPassword(PREVIEW_EMAILS[role]));
		await request.storageState({ path: storageStateFor(role) });
	});
}
