import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guards for migrations 0007–0011 (P3–P8): every marketplace table
 * ships with its RLS policies in the same file (the P2.4 convention), money
 * is integer cents with a reconciliation CHECK, and the idempotency/replay
 * constraints the endpoints rely on actually exist in the schema.
 */

const read = (name: string) =>
  readFileSync(join(__dirname, '..', 'migrations', name), 'utf8');

describe('0007_applications.sql (P3)', () => {
  const sql = read('0007_applications.sql');
  it('constrains one application per talent per gig', () => {
    expect(sql).toContain('UNIQUE (gig_id, talent_id)');
  });
  it('stores money in integer cents', () => {
    expect(sql).toContain('proposed_rate_cents INTEGER');
    expect(sql).not.toMatch(/proposed_rate\s+NUMERIC/);
  });
  it('ships RLS for both tables in the same file', () => {
    expect(sql).toContain('ALTER TABLE applications ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE notifications ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("current_setting('app.user_id', true)");
  });
  it('lets venues review but never insert applications', () => {
    expect(sql).toMatch(/applications_venue_review[\s\S]*?FOR SELECT/);
    expect(sql).toMatch(/applications_venue_update[\s\S]*?FOR UPDATE/);
    expect(sql).not.toMatch(/applications_venue\w*[\s\S]{0,80}FOR INSERT/);
  });
});

describe('0008_messaging.sql (P5)', () => {
  const sql = read('0008_messaging.sql');
  it('prevents self-conversations and dedupes threads', () => {
    expect(sql).toContain('venue_user_id <> counterpart_user_id');
    expect(sql).toContain('idx_conversations_unique_gig');
    expect(sql).toContain('idx_conversations_unique_pair');
  });
  it('rate proposals carry integer cents', () => {
    expect(sql).toContain('rate_cents INTEGER');
  });
  it('messages are participant-scoped and sender-checked under RLS', () => {
    expect(sql).toMatch(/messages_participant[\s\S]*?WITH CHECK \(sender_id = current_setting/);
  });
  it('reports are write-only for users, read/triage for admin', () => {
    expect(sql).toMatch(/reports_create[\s\S]*?FOR INSERT/);
    expect(sql).toMatch(/reports_admin_read[\s\S]*?app\.role/);
  });
});

describe('0009_availability.sql (P6)', () => {
  const sql = read('0009_availability.sql');
  it('constrains the PRD slot model (3 named slots, one row each)', () => {
    expect(sql).toContain("'EARLY_EVENING', 'PRIME_TIME', 'AFTER_HOURS'");
    expect(sql).toContain('UNIQUE (talent_id, date, time_slot)');
  });
  it('is talent-private under RLS (no public read policy)', () => {
    expect(sql).toContain('ALTER TABLE availabilities ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toContain('FOR SELECT USING (true)');
  });
});

describe('0010_shifts.sql (P7)', () => {
  const sql = read('0010_shifts.sql');
  it('backs idempotency keys with a unique constraint (§6.3)', () => {
    expect(sql).toContain('UNIQUE (shift_id, idempotency_key)');
  });
  it('snapshots the agreed rate in cents at hire time', () => {
    expect(sql).toContain('agreed_rate_cents INTEGER NOT NULL');
  });
  it('covers both sides with RLS policies', () => {
    expect(sql).toMatch(/shifts_talent_own/);
    expect(sql).toMatch(/shifts_venue_own/);
  });
});

describe('0011_payments.sql (P8)', () => {
  const sql = read('0011_payments.sql');
  it('forces the ledger to reconcile: gross = fee + net', () => {
    expect(sql).toContain('gross_cents = fee_cents + net_cents');
  });
  it('anonymizes rather than destroys financial records on erasure', () => {
    // SET NULL, never CASCADE, on the user columns (7-year carve-out).
    expect(sql).toMatch(/venue_user_id TEXT REFERENCES "user"\(id\) ON DELETE SET NULL/);
    expect(sql).toMatch(/talent_user_id TEXT REFERENCES "user"\(id\) ON DELETE SET NULL/);
  });
  it('uses the webhook event id as the replay guard', () => {
    expect(sql).toMatch(/stripe_events \(\s*id TEXT PRIMARY KEY/);
  });
  it('stores only Stripe identifiers — no PAN/IBAN columns anywhere', () => {
    // Column definitions only (the header comment legitimately names the
    // things we refuse to store).
    const columnLines = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--') && /\s(TEXT|INTEGER|NUMERIC)/.test(line));
    for (const line of columnLines) {
      expect(line).not.toMatch(/card_number|\bpan\b|\biban\b|account_number|routing_number/i);
    }
  });
  it('freezes money columns at the privilege level for the app role', () => {
    expect(sql).toContain('REVOKE UPDATE ON payouts FROM afterdark_app');
    expect(sql).toContain('GRANT UPDATE (status, stripe_charge_id, stripe_transfer_id, released_at)');
  });
});
