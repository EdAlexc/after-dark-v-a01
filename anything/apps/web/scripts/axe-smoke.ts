#!/usr/bin/env tsx
/**
 * P10.4 axe smoke — WCAG scan of the 10 core screens (CLAUDE.md §5.2)
 * against a running server.
 *
 *   BASE_URL=http://localhost:4000 PREVIEW_ACCOUNTS_SECRET=… \
 *     yarn tsx scripts/axe-smoke.ts
 *
 * Gate semantics (deliberate): the run FAILS on any `critical` axe violation
 * and prints `serious` ones as warnings — this is the smoke baseline §5's
 * plan calls for; the a11y DEEP pass (Backlog #13: keyboard calendar,
 * contrast sweep, reduced-motion) is its documented follow-on and will
 * ratchet `serious` into the gate.
 *
 * Screens needing a session sign in as the S1 preview accounts (passwords
 * derived from PREVIEW_ACCOUNTS_SECRET — same scheme the provisioning
 * script used; nothing is logged).
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { derivePreviewPassword } from './preview-password';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';
const SECRET = process.env.PREVIEW_ACCOUNTS_SECRET ?? '';

if (!SECRET) {
  console.error('PREVIEW_ACCOUNTS_SECRET is required (authed screens sign in as preview accounts).');
  process.exit(1);
}

type Actor = 'anon' | 'talent' | 'venue' | 'admin';

const ACCOUNTS: Record<Exclude<Actor, 'anon'>, string> = {
  talent: 'talent.preview@afterdark.dev',
  venue: 'venue.preview@afterdark.dev',
  admin: 'admin.preview@afterdark.dev',
};

/** The 10 wireframe screens (CLAUDE.md §5.2), each under its natural actor. */
const SCREENS: Array<{ name: string; path: string | (() => Promise<string>); actor: Actor }> = [
  { name: 'p5 landing', path: '/', actor: 'anon' },
  { name: 'p2 browse gigs', path: '/dashboard/talent/browse', actor: 'talent' },
  { name: 'p3 create gig', path: '/dashboard/venue/create-gig', actor: 'venue' },
  { name: 'p4 gig detail', path: firstGigPath, actor: 'talent' },
  { name: 'p6 messages', path: '/dashboard/talent/messages', actor: 'talent' },
  { name: 'p7 availability', path: '/dashboard/talent/schedule', actor: 'talent' },
  { name: 'p8 talent dashboard', path: '/dashboard/talent', actor: 'talent' },
  { name: 'p9 profile editor', path: '/dashboard/talent/profile', actor: 'talent' },
  { name: 'p10 venue dashboard', path: '/dashboard/venue', actor: 'venue' },
  { name: 'p1 admin moderation', path: '/dashboard/admin', actor: 'admin' },
];

async function firstGigPath(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/gigs`);
  const body = (await res.json()) as { gigs: Array<{ id: string }> };
  const id = body.gigs?.[0]?.id;
  if (!id) throw new Error('No published gig to scan — seed the database first.');
  return `/gigs/${id}`;
}

async function signIn(context: BrowserContext, email: string): Promise<void> {
  const page = await context.newPage();
  const res = await page.request.post(`${BASE_URL}/api/auth/sign-in/email`, {
    data: { email, password: derivePreviewPassword(SECRET, email) },
  });
  if (!res.ok()) {
    throw new Error(`Sign-in failed for ${email}: HTTP ${res.status()}`);
  }
  await page.close();
}

async function scan(page: Page, name: string, path: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  return results.violations.map((violation) => ({
    screen: name,
    id: violation.id,
    impact: violation.impact ?? 'unknown',
    help: violation.help,
    nodes: violation.nodes.length,
  }));
}

async function main() {
  const browser = await chromium.launch();
  const contexts = new Map<Actor, BrowserContext>();
  const allViolations: Array<{ screen: string; id: string; impact: string; help: string; nodes: number }> = [];

  try {
    for (const actor of ['anon', 'talent', 'venue', 'admin'] as Actor[]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      if (actor !== 'anon') await signIn(context, ACCOUNTS[actor]);
      contexts.set(actor, context);
    }

    for (const screen of SCREENS) {
      const path = typeof screen.path === 'function' ? await screen.path() : screen.path;
      const page = await contexts.get(screen.actor)!.newPage();
      const violations = await scan(page, screen.name, path);
      allViolations.push(...violations);
      await page.close();
      console.log(`scanned ${screen.name} (${path}) — ${violations.length} violation(s)`);
    }
  } finally {
    await browser.close();
  }

  const critical = allViolations.filter((violation) => violation.impact === 'critical');
  const serious = allViolations.filter((violation) => violation.impact === 'serious');
  const rest = allViolations.filter(
    (violation) => violation.impact !== 'critical' && violation.impact !== 'serious'
  );

  if (serious.length > 0) {
    console.warn(`\n⚠ SERIOUS violations (warning — the #13 deep pass ratchets these into the gate):`);
    for (const violation of serious) {
      console.warn(`  ${violation.screen}: ${violation.id} ×${violation.nodes} — ${violation.help}`);
    }
  }
  if (rest.length > 0) {
    console.log(`\nℹ ${rest.length} moderate/minor finding(s) (informational).`);
  }

  if (critical.length > 0) {
    console.error(`\n✗ CRITICAL violations — the axe gate fails:`);
    for (const violation of critical) {
      console.error(`  ${violation.screen}: ${violation.id} ×${violation.nodes} — ${violation.help}`);
    }
    process.exit(1);
  }
  console.log(`\n✓ axe smoke passed: 10 screens, 0 critical (${serious.length} serious warned).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
