import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guards for the S1/S2 migrations (0013 shared rate limits,
 * 0014 RLS completion) and the living GRANT set (scripts/grants.sql).
 * Real enforcement is exercised by `yarn db:verify-rls` on a Neon branch;
 * this keeps the committed SQL from silently regressing.
 */

const read = (...segments: string[]) =>
  readFileSync(join(__dirname, '..', ...segments), 'utf8');

const rateLimits = read('migrations', '0013_shared_rate_limits.sql');
const completion = read('migrations', '0014_rls_completion.sql');
const grants = read('scripts', 'grants.sql');

describe('0013_shared_rate_limits.sql (S1)', () => {
  it('creates the shared counter store with an atomic-upsert-friendly key', () => {
    expect(rateLimits).toContain('CREATE TABLE IF NOT EXISTS rate_limit_counters');
    expect(rateLimits).toMatch(/PRIMARY KEY \(bucket, window_start\)/);
  });

  it("creates better-auth's rateLimit model with the shape its adapter expects", () => {
    expect(rateLimits).toContain('CREATE TABLE IF NOT EXISTS "rateLimit"');
    // UNIQUE(key) is what makes better-auth's create-conflict retry atomic.
    expect(rateLimits).toMatch(/"key" TEXT NOT NULL UNIQUE/);
    expect(rateLimits).toContain('"lastRequest" BIGINT');
  });

  it('indexes window_start so the retention purge can delete by age', () => {
    expect(rateLimits).toMatch(/idx_rate_limit_counters_window[\s\S]*?\(window_start\)/);
  });

  it('stores no PII beyond the caller key (no email/name/phone columns)', () => {
    const columnLines = rateLimits
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'));
    for (const column of ['email', 'phone', 'user_name', 'address']) {
      expect(columnLines.some((line) => new RegExp(`^\\s*"?${column}"?\\s`).test(line))).toBe(
        false
      );
    }
  });
});

describe('0014_rls_completion.sql (S2)', () => {
  it('creates legal_holds with scoped/global holds and an active-hold index', () => {
    expect(completion).toContain('CREATE TABLE IF NOT EXISTS legal_holds');
    expect(completion).toMatch(/scope IN \('USER', 'GLOBAL'\)/);
    expect(completion).toMatch(/legal_holds_user_scope CHECK \(scope = 'GLOBAL' OR user_id IS NOT NULL\)/);
    expect(completion).toMatch(/idx_legal_holds_active[\s\S]*?WHERE released_at IS NULL/);
  });

  it('restricts legal_holds to platform context (subjects must not see holds)', () => {
    expect(completion).toContain('ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY');
    expect(completion).toMatch(/legal_holds_platform[\s\S]*?IN \('ADMIN', 'SERVICE'\)/);
  });

  it('adds platform (ADMIN+SERVICE) policies for every marketplace table, not audit_logs', () => {
    for (const table of [
      'talent_profiles', 'venue_profiles', 'gigs', 'applications', 'notifications',
      'conversations', 'messages', 'reports', 'availabilities', 'shifts',
      'shift_transitions', 'payouts', 'stripe_accounts', 'stripe_events',
    ]) {
      expect(completion, `${table} missing from the platform policy loop`).toContain(`'${table}'`);
    }
    // audit_logs must NOT get the blanket platform policy — append-only.
    expect(completion).not.toMatch(/ARRAY\[[^\]]*'audit_logs'/);
  });

  it('keeps applicant deep links alive across every gig status', () => {
    expect(completion).toMatch(/gigs_applicant_read[\s\S]*?app_user_has_application\(id\)/);
    expect(completion).toMatch(/gigs_completed_public_read[\s\S]*?IN \('FILLED', 'COMPLETED'\)/);
  });

  it('routes the applicant carve-out through SECURITY DEFINER (policy-recursion fix)', () => {
    // A plain EXISTS over applications inside a gigs policy recurses (42P17):
    // 0007's application policies subquery gigs right back. The definer
    // function is what breaks the cycle — do not "simplify" it away.
    expect(completion).toMatch(/app_user_has_application[\s\S]*?SECURITY DEFINER/);
    expect(completion).toMatch(/SET search_path = public/);
  });

  it('splits the messages policy per command (mark-read fix)', () => {
    expect(completion).toContain('DROP POLICY IF EXISTS messages_participant ON messages');
    expect(completion).toMatch(/messages_participant_read[\s\S]*?FOR SELECT/);
    expect(completion).toMatch(/messages_participant_insert[\s\S]*?FOR INSERT/);
    expect(completion).toMatch(/messages_participant_update[\s\S]*?FOR UPDATE/);
    // Authorship stays pinned to the sender on INSERT.
    expect(completion).toMatch(/messages_participant_insert[\s\S]*?sender_id = current_setting\('app\.user_id', true\)/);
  });

  it('scopes the erasure rewrite to SERVICE context and the actor_id column only', () => {
    expect(completion).toMatch(/audit_logs_service_pseudonymize[\s\S]*?FOR UPDATE/);
    expect(completion).toMatch(/audit_logs_service_pseudonymize[\s\S]*?'SERVICE'/);
    expect(completion).toContain('GRANT UPDATE (actor_id) ON audit_logs');
  });

  it('lets the DSR export read the subject’s own audit rows', () => {
    expect(completion).toMatch(/audit_logs_own_read[\s\S]*?actor_id = current_setting\('app\.user_id', true\)/);
  });

  it('admits checkout payout INSERTs from the shift’s own parties', () => {
    expect(completion).toMatch(/payouts_participant_insert[\s\S]*?FOR INSERT/);
  });

  it('uses the missing-setting-safe current_setting form throughout', () => {
    expect(completion).not.toMatch(/current_setting\('app\.[a-z_]+'\)/);
  });
});

describe('scripts/grants.sql (living GRANT set)', () => {
  it('grants DML on every RLS-governed and infra table the app touches', () => {
    for (const table of [
      'talent_profiles', 'venue_profiles', 'gigs', 'audit_logs',
      'applications', 'notifications', 'conversations', 'messages', 'reports',
      'availabilities', 'shifts', 'shift_transitions',
      'payouts', 'stripe_accounts', 'stripe_events', 'legal_holds',
      'rate_limit_counters', '"rateLimit"',
      '"user"', '"session"', '"account"', '"verification"', '"twoFactor"',
    ]) {
      expect(grants, `${table} missing from grants.sql`).toContain(table);
    }
  });

  it('re-asserts the audit and ledger freezes after the blanket grant', () => {
    expect(grants).toContain('REVOKE UPDATE, DELETE ON audit_logs');
    expect(grants).toContain('GRANT UPDATE (actor_id) ON audit_logs');
    expect(grants).toContain('REVOKE UPDATE ON payouts');
    expect(grants).toMatch(/GRANT UPDATE \(status, stripe_charge_id, stripe_transfer_id, released_at\)/);
    expect(grants).toContain('REVOKE UPDATE, DELETE ON stripe_events');
  });

  it('covers future tables via default privileges', () => {
    expect(grants).toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA public');
  });
});
