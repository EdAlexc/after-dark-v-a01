import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guard for migrations/0004_rls.sql (TENANT_GUARDRAIL §6.2).
 * Real enforcement is exercised against a Neon branch (TESTING.md §RLS);
 * this keeps the committed policy set from silently regressing.
 */

const migration = readFileSync(join(__dirname, '..', 'migrations', '0004_rls.sql'), 'utf8');

describe('0004_rls.sql', () => {
  it('enables RLS on every tenant table', () => {
    for (const table of ['talent_profiles', 'venue_profiles', 'gigs', 'audit_logs']) {
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it('keys ownership policies on the per-request app.user_id setting', () => {
    expect(migration).toContain("current_setting('app.user_id', true)");
    // The missing-setting-safe form (second arg true) must be used throughout —
    // otherwise a context-less query would error instead of filtering.
    expect(migration).not.toMatch(/current_setting\('app\.[a-z_]+'\)/);
  });

  it('only exposes PUBLISHED gigs to the public read policy', () => {
    expect(migration).toMatch(/gigs_public_read[\s\S]*?status = 'PUBLISHED'/);
  });

  it('keeps audit_logs append-only (no UPDATE/DELETE policies)', () => {
    const auditSection = migration.slice(migration.indexOf('audit_logs'));
    expect(auditSection).toContain('FOR INSERT');
    expect(auditSection).not.toContain('FOR UPDATE');
    expect(auditSection).not.toContain('FOR DELETE');
  });

  it('leaves better-auth tables out of RLS', () => {
    for (const table of ['"user"', 'session', 'account', 'verification']) {
      expect(migration).not.toContain(`ALTER TABLE ${table} ENABLE`);
    }
  });
});
