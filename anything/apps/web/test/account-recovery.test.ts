import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guards for the S13 account-recovery spine — the auth config is
 * inside the DO-NOT-REWRITE platform file, so (like the RLS/migration
 * structural suites) these pin the committed wiring rather than boot the
 * auth instance.
 */

const authSource = readFileSync(join(__dirname, '..', 'src', 'lib', 'auth.ts'), 'utf8');
const migration = readFileSync(
  join(__dirname, '..', 'migrations', '0021_email_verification_grandfather.sql'),
  'utf8'
);
const signinSource = readFileSync(
  join(__dirname, '..', 'src', 'app', 'account', 'signin', 'page.tsx'),
  'utf8'
);

describe('auth.ts recovery wiring (S13)', () => {
  it('ties verification enforcement to the email spine being keyed', () => {
    expect(authSource).toContain('requireEmailVerification: emailConfigured()');
  });

  it('wires reset + verification handlers from the testable module', () => {
    expect(authSource).toContain('sendResetPassword: sendResetPasswordEmail');
    expect(authSource).toContain('onPasswordReset: auditPasswordReset');
    expect(authSource).toContain('sendVerificationEmail: sendVerificationEmailTo');
    expect(authSource).toContain('sendOnSignUp: true');
  });

  it('revokes every session on password reset — a recovered account starts clean', () => {
    expect(authSource).toContain('revokeSessionsOnPasswordReset: true');
  });

  it('keeps reset tokens short-lived', () => {
    expect(authSource).toMatch(/resetPasswordTokenExpiresIn:\s*60 \* 60/);
  });

  it('rate-limits every recovery endpoint', () => {
    for (const endpoint of [
      '/request-password-reset',
      '/reset-password',
      '/send-verification-email',
    ]) {
      expect(authSource).toContain(`'${endpoint}':`);
    }
  });
});

describe('0021 grandfather migration (S13)', () => {
  it('backfills emailVerified for pre-S13 accounts, and does nothing else', () => {
    expect(migration).toMatch(/UPDATE "user"\s+SET "emailVerified" = true/);
    expect(migration).toContain('WHERE "emailVerified" = false');
    for (const forbidden of ['DELETE', 'DROP', 'INSERT', 'ALTER']) {
      expect(migration).not.toContain(forbidden);
    }
  });
});

describe('sign-in recovery entry point (S13)', () => {
  it('links to the forgot-password flow', () => {
    expect(signinSource).toContain('/account/forgot-password');
  });
});
