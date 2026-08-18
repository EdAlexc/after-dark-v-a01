#!/usr/bin/env tsx
/**
 * P10.4 Lighthouse gate runner — drives `lhci autorun` over the §3.2 URL
 * set in three passes (public, talent-authed, venue-authed). Auth rides a
 * real session cookie obtained from the sign-in API and injected via
 * Lighthouse extraHeaders — no separate browser automation stack.
 *
 *   BASE_URL=http://localhost:4000 PREVIEW_ACCOUNTS_SECRET=… \
 *     yarn tsx scripts/lhci-gate.ts
 *
 * Budgets/levels live in lighthouserc.cjs (single source of truth).
 */

import { spawnSync } from 'node:child_process';
import { derivePreviewPassword } from './preview-password';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';
const SECRET = process.env.PREVIEW_ACCOUNTS_SECRET ?? '';

if (!SECRET) {
  console.error('PREVIEW_ACCOUNTS_SECRET is required (authed passes sign in as preview accounts).');
  process.exit(1);
}

/**
 * Sign in and return a Cookie header value for the session. One 429 retry:
 * the S1 limiter allows 10 sign-ins/min/IP and this gate runs right after
 * the axe + S16 E2E gates on the same runner IP — waiting out one window
 * beats a flaky budget gate (same policy as e2e/fixtures.ts).
 */
async function sessionCookie(email: string): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      // Origin satisfies better-auth's trusted-origin CSRF check.
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email, password: derivePreviewPassword(SECRET, email) }),
    });
    if (res.status === 429 && attempt === 0) {
      console.log('sign-in rate-limited (sibling gates share this IP) — waiting out one window…');
      await new Promise((resolve) => setTimeout(resolve, 61_000));
      continue;
    }
    if (!res.ok) throw new Error(`Sign-in failed for ${email}: HTTP ${res.status}`);
    const cookies = res.headers.getSetCookie();
    if (cookies.length === 0) throw new Error(`No session cookie returned for ${email}`);
    return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  }
}

async function firstGigId(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/gigs`);
  const body = (await res.json()) as { gigs: Array<{ id: string }> };
  const id = body.gigs?.[0]?.id;
  if (!id) throw new Error('No published gig — seed the database first.');
  return id;
}

function runPass(name: string, urls: string[], cookie?: string): boolean {
  const args = ['exec', 'lhci', 'autorun', '--config=lighthouserc.cjs'];
  for (const url of urls) args.push(`--collect.url=${BASE_URL}${url}`);
  if (cookie) {
    args.push(`--collect.settings.extraHeaders=${JSON.stringify({ Cookie: cookie })}`);
  }
  console.log(`\n── Lighthouse pass: ${name} (${urls.join(', ')})`);
  const result = spawnSync('yarn', args, { stdio: 'inherit' });
  return result.status === 0;
}

async function main() {
  const gigId = await firstGigId();
  const talentCookie = await sessionCookie('talent.preview@afterdark.dev');
  const venueCookie = await sessionCookie('venue.preview@afterdark.dev');

  const passes: Array<{ name: string; ok: boolean }> = [];
  passes.push({ name: 'public', ok: runPass('public', ['/', `/gigs/${gigId}`]) });
  passes.push({
    name: 'talent',
    ok: runPass('talent', ['/dashboard/talent/browse', '/dashboard/talent/messages'], talentCookie),
  });
  passes.push({ name: 'venue', ok: runPass('venue', ['/dashboard/venue'], venueCookie) });

  const failed = passes.filter((pass) => !pass.ok);
  if (failed.length > 0) {
    console.error(`\n✗ Lighthouse gate failed: ${failed.map((pass) => pass.name).join(', ')}`);
    process.exit(1);
  }
  console.log('\n✓ Lighthouse gate passed (5 URLs across 3 passes).');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
