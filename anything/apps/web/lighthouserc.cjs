/**
 * P10.4 Lighthouse gate — TENANT_GUARDRAIL §3.2 budgets as assertions.
 * URLs and (for authed screens) the session cookie are injected per pass by
 * scripts/lhci-gate.ts; this file owns the budget levels.
 *
 * Levels, calibrated 2026-07-31 against the production build (documented so
 * the ratchet is honest):
 *  - error: CLS, TTFB, image weight — comfortably inside budget today; a
 *    regression is a real defect.
 *  - warn: LCP, TBT, FCP, JS weight — §3.2's own audit note predicts these
 *    stay hot until the lists move to RSC/streaming ("all pages are
 *    'use client'"); they are tracked, visible in every run, and ratchet to
 *    error with that refactor. A gate that is red from day one gates
 *    nothing.
 */

module.exports = {
  ci: {
    collect: {
      numberOfRuns: 1, // smoke cadence; the pre-release run bumps this to 3
      settings: {
        // Mobile emulation + 4x CPU throttle are Lighthouse defaults; pinned
        // here so a tooling default change can't silently move the goalposts.
        formFactor: 'mobile',
        screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75 },
        throttlingMethod: 'simulate',
        // Auth pages carry the session cookie via extraHeaders (injected by
        // the gate runner); storage reset would drop it.
        disableStorageReset: true,
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.5 }],
        'categories:accessibility': ['error', { minScore: 0.8 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 1800 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'server-response-time': ['error', { maxNumericValue: 800 }],
        'resource-summary:script:size': ['warn', { maxNumericValue: 300_000 }],
        'resource-summary:image:size': ['error', { maxNumericValue: 500_000 }],
      },
    },
    // Reports stay local (CI keeps them as a workflow artifact) — screens
    // include seeded preview data, so nothing is pushed to public storage.
    upload: { target: 'filesystem', outputDir: '.lighthouseci/reports' },
  },
};
