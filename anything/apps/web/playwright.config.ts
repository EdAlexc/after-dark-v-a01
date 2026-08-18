/**
 * S16 — Playwright E2E journeys (DEV_TIMELINE §7.3), run against an already
 * running production server, exactly like the sibling P10.4 gates (axe,
 * Lighthouse, k6):
 *
 *   BASE_URL=http://localhost:4000 PREVIEW_ACCOUNTS_SECRET=… yarn test:e2e
 *
 * The suite needs the same stack CI's alpha-gates job provisions: migrated +
 * seeded DB, preview accounts, `yarn build && yarn start`. A production build
 * is required (not `yarn dev`) — the PWA spec exercises the service worker,
 * which registers in production only (src/lib/pwa.ts).
 *
 * Serial on purpose (workers: 1): the journeys mutate one shared database,
 * and every sign-in comes from one IP — the S1 shared rate limiter allows
 * 10 sign-ins + 5 sign-ups per minute, so the setup project signs each role
 * in once and the specs reuse the saved storage state.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	outputDir: './e2e/.results',
	fullyParallel: false,
	workers: 1,
	// One CI retry: specs are retry-safe (fresh per-attempt emails/gig titles)
	// and the co-hosted 2-core runner can hiccup; traces record any flake.
	retries: process.env.CI ? 1 : 0,
	forbidOnly: !!process.env.CI,
	timeout: 120_000,
	expect: { timeout: 15_000 },
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
	use: {
		baseURL: process.env.BASE_URL ?? 'http://localhost:4000',
		trace: 'retain-on-failure',
		actionTimeout: 15_000,
		navigationTimeout: 30_000,
	},
	projects: [
		{ name: 'setup', testMatch: /auth\.setup\.ts/ },
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			dependencies: ['setup'],
		},
	],
});
