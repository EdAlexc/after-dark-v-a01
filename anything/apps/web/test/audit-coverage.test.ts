import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Audit-coverage gate (S15) — the third machine-checked registry, after the
 * authZ matrix (P2.3) and RLS wiring (S12). §2.0's definition of done says
 * "writes that create money, PII, or state transitions are audited via
 * auditLogger" — until now nothing failed CI when a new mutating route
 * forgot. Every route exporting a mutating handler must be declared below:
 * `audited` rows must actually call auditLogger; `exempt` rows carry their
 * reason in this file, on the record, reviewable in the PR that adds them.
 */

const API_ROOT = join(__dirname, '..', 'src', 'app', 'api');

type AuditMode =
  | 'audited'
  /** Exempt WITH the reason string — an empty reason fails the gate. */
  | { exempt: string };

const AUDIT_COVERAGE: Record<string, AuditMode> = {
  'account/age-confirm/route.ts': 'audited',
  'account/route.ts': 'audited',
  'admin/gigs/[id]/route.ts': 'audited',
  'admin/reports/[id]/route.ts': 'audited',
  'admin/users/[id]/route.ts': 'audited',
  'applications/[id]/route.ts': 'audited',
  'availability/route.ts': {
    exempt:
      'Self-scoped calendar slots: per-slot toggles are high-volume personal scheduling ' +
      'noise with no cross-tenant effect; auditing each save would bloat the trail ' +
      'without a moderation or money story. Shift state (the consequential half) IS audited.',
  },
  'conversations/[id]/accept-rate/route.ts': 'audited',
  'conversations/[id]/messages/route.ts': {
    exempt:
      'Deliberate: auditing every message would put private-comms metadata in the admin ' +
      'trail (volume + privacy). Abuse flows through reports → P9 moderation, where every ' +
      'admin read of a thread IS audited (admin.moderation.messages_read).',
  },
  'conversations/route.ts': 'audited',
  'gigs/[id]/apply/route.ts': 'audited',
  'gigs/[id]/route.ts': 'audited',
  'gigs/route.ts': 'audited',
  'notifications/route.ts': {
    exempt:
      'Mark-read on the caller\u2019s own notifications: benign self-scoped state with no ' +
      'money/PII/moderation dimension.',
  },
  'payouts/release/route.ts': 'audited',
  'push/subscribe/route.ts': {
    exempt:
      'Self-scoped push opt-in/out toggle; the subscription row is the user\u2019s own ' +
      'device endpoint, no cross-tenant or money effect. Revisit if push ever carries ' +
      'more than id-only payloads.',
  },
  'reports/route.ts': 'audited',
  'retention/purge/route.ts': 'audited',
  'rum/route.ts': {
    exempt:
      'Anonymous, strict-validated, rate-limited web-vitals telemetry (S18): the beacon ' +
      'carries no identity and touches no state a data subject owns — auditing every ' +
      'page-load metric would only amplify traffic into the audit trail.',
  },
  'reviews/route.ts': 'audited',
  'settings/change-password/route.ts': 'audited',
  'settings/route.ts': 'audited',
  'shifts/[id]/route.ts': 'audited',
  'stripe/connect/route.ts': 'audited',
  'stripe/webhook/route.ts': 'audited', // S15 retrofit — money/account state via webhook
  'talent/profile/route.ts': 'audited',
  'upload/route.ts': 'audited', // S15 retrofit — media is PII creation (G11)
  'user/role/route.ts': 'audited',
  'venue/profile/route.ts': 'audited',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...walk(full));
    } else if (entry === 'route.ts') {
      out.push(full);
    }
  }
  return out;
}

const MUTATING_EXPORT = /export const (POST|PATCH|PUT|DELETE)\b/;

const mutatingRoutes = walk(API_ROOT)
  .map((file) => ({
    key: relative(API_ROOT, file).split('\\').join('/'),
    text: readFileSync(file, 'utf8'),
  }))
  // The better-auth platform surface manages its own tables and hooks; its
  // auditable events (password reset, verification) are recorded by the S13
  // handlers in lib/auth-email.ts.
  .filter(({ key }) => !key.startsWith('auth/') && !key.startsWith('__create/'))
  .filter(({ text }) => MUTATING_EXPORT.test(text));

describe('audit coverage (S15)', () => {
  it('every mutating route has a coverage declaration', () => {
    const undeclared = mutatingRoutes
      .filter(({ key }) => !(key in AUDIT_COVERAGE))
      .map(({ key }) => key);
    expect(
      undeclared,
      `Mutating routes without an audit declaration. Either call auditLogger.record() and ` +
        `declare 'audited', or add an { exempt: '<reason>' } row in ${relative(
          process.cwd(),
          __filename
        )} — the reason goes on the record.`
    ).toEqual([]);
  });

  it('has no stale registry rows', () => {
    const keys = new Set(mutatingRoutes.map(({ key }) => key));
    const stale = Object.keys(AUDIT_COVERAGE).filter((key) => !keys.has(key));
    expect(stale, 'AUDIT_COVERAGE rows point at routes that no longer mutate — remove them.').toEqual(
      []
    );
  });

  it("'audited' routes actually record", () => {
    const missing = mutatingRoutes
      .filter(({ key }) => AUDIT_COVERAGE[key] === 'audited')
      .filter(({ text }) => !/auditLogger\s*\.\s*record/.test(text))
      .map(({ key }) => key);
    expect(missing).toEqual([]);
  });

  it('every exemption carries a substantive reason', () => {
    for (const [key, mode] of Object.entries(AUDIT_COVERAGE)) {
      if (mode === 'audited') continue;
      expect(mode.exempt.length, `${key}: exemption reason too thin`).toBeGreaterThan(40);
    }
  });
});
