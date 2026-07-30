import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guard for migrations/0005_two_factor_plugin.sql (Backlog #17).
 * The live enroll → challenge → verify loop is exercised per TESTING.md §5;
 * this keeps the committed schema aligned with better-auth's twoFactor
 * plugin expectations (camelCase columns, cascade delete, legacy cleanup).
 */

const migration = readFileSync(
  join(__dirname, '..', 'migrations', '0005_two_factor_plugin.sql'),
  'utf8'
);

describe('0005_two_factor_plugin.sql', () => {
  it('creates the plugin table with every column the plugin schema declares', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "twoFactor"');
    for (const column of [
      '"secret"',
      '"backupCodes"',
      '"userId"',
      '"verified"',
      '"failedVerificationCount"',
      '"lockedUntil"',
    ]) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain('REFERENCES "user"("id") ON DELETE CASCADE');
  });

  it('adds the user flag column the plugin reads at sign-in', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN');
  });

  it('clears the legacy hand-rolled enrollment state (forces re-enroll)', () => {
    expect(migration).toMatch(/UPDATE "user" SET totp_enabled = FALSE, totp_secret = NULL/);
  });
});
