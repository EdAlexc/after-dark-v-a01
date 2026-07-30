import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import {
  EXPORT_ROW_LIMIT,
  collectAccountExport,
  deleteAccountData,
  pseudonymizeActorId,
} from '../account-data';

const USER_ID = 'user-1';

function wireSql(overrides: Record<string, unknown[]> = {}) {
  mocks.sql.mockImplementation(async (first: unknown, ..._rest: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    for (const [needle, rows] of Object.entries(overrides)) {
      if (text.includes(needle)) return rows;
    }
    if (text.includes('FROM "user"')) {
      return [{ id: USER_ID, email: 'a@b.c', name: 'A', role: 'TALENT' }];
    }
    if (text.includes('FROM talent_profiles')) return [{ id: 'tp-1', stage_name: 'DJ A' }];
    if (text.includes('FROM venue_profiles')) return [];
    if (text.includes('FROM gigs')) return [{ id: 'g-1', title: 'Gig' }];
    if (text.includes('FROM audit_logs')) return [{ action: 'gig.create' }];
    if (text.includes('UPDATE audit_logs')) return [{ id: 1 }, { id: 2 }];
    if (text.includes('DELETE FROM "user"')) return [{ id: USER_ID }];
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  wireSql();
});

describe('pseudonymizeActorId (G4 erasure, retention.md §2)', () => {
  it('is deterministic for the same user + secret', () => {
    expect(pseudonymizeActorId(USER_ID, 'secret')).toBe(pseudonymizeActorId(USER_ID, 'secret'));
  });

  it('differs per user, so the trail still distinguishes actors', () => {
    expect(pseudonymizeActorId('a', 'secret')).not.toBe(pseudonymizeActorId('b', 'secret'));
  });

  it('differs per secret, so the mapping cannot be recomputed without it', () => {
    expect(pseudonymizeActorId(USER_ID, 'secret-a')).not.toBe(
      pseudonymizeActorId(USER_ID, 'secret-b')
    );
  });

  it('never contains the original id (that would defeat the point)', () => {
    const token = pseudonymizeActorId('very-distinctive-id-42', 'secret');
    expect(token).not.toContain('very-distinctive-id-42');
    expect(token.startsWith('deleted:')).toBe(true);
  });
});

describe('collectAccountExport (Art. 15/20)', () => {
  it('includes every category the privacy policy promises', async () => {
    const data = await collectAccountExport(USER_ID);
    expect(Object.keys(data)).toEqual(
      expect.arrayContaining(['user', 'talent_profile', 'venue_profile', 'gigs', 'audit_log'])
    );
    expect(data.user).toMatchObject({ id: USER_ID });
    expect(data.gigs).toHaveLength(1);
  });

  it('is self-describing about what it omits', async () => {
    const data = await collectAccountExport(USER_ID);
    expect(data.meta.excluded.join(' ')).toMatch(/password/i);
    expect(data.meta.excluded.join(' ')).toMatch(/2FA|backup/i);
    expect(data.meta.format_version).toBe(1);
  });

  it('never selects credential material', async () => {
    await collectAccountExport(USER_ID);
    const issued = mocks.sql.mock.calls
      .map(([first]) => (Array.isArray(first) ? (first as string[]).join('') : String(first)))
      .join(' | ');
    expect(issued).not.toMatch(/password/i);
    expect(issued).not.toMatch(/totp_secret|backupCodes/i);
  });

  it('scopes every query to the requesting user', async () => {
    await collectAccountExport(USER_ID);
    const withUserId = mocks.sql.mock.calls.filter((call) => call.includes(USER_ID));
    expect(withUserId.length).toBeGreaterThanOrEqual(5);
  });

  it('bounds each collection so one account cannot trigger an unbounded scan', async () => {
    await collectAccountExport(USER_ID);
    const issued = mocks.sql.mock.calls
      .map(([first]) => (Array.isArray(first) ? (first as string[]).join('') : String(first)))
      .filter((text) => /FROM (gigs|audit_logs)/.test(text));
    expect(issued.length).toBe(2);
    for (const text of issued) expect(text).toContain('LIMIT');
    expect(EXPORT_ROW_LIMIT).toBeLessThanOrEqual(10_000);
  });

  it('tolerates a user with no profiles', async () => {
    wireSql({ 'FROM talent_profiles': [], 'FROM venue_profiles': [] });
    const data = await collectAccountExport(USER_ID);
    expect(data.talent_profile).toBeNull();
    expect(data.venue_profile).toBeNull();
  });
});

describe('deleteAccountData (Art. 17)', () => {
  it('pseudonymizes the audit trail BEFORE deleting the user', async () => {
    const order: string[] = [];
    mocks.sql.mockImplementation(async (first: unknown) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      if (text.includes('UPDATE audit_logs')) {
        order.push('pseudonymize');
        return [{ id: 1 }];
      }
      if (text.includes('DELETE FROM "user"')) {
        order.push('delete');
        return [{ id: USER_ID }];
      }
      return [];
    });

    await deleteAccountData(USER_ID);
    // Reversed, the link between rows and user is already gone — unrecoverable.
    expect(order).toEqual(['pseudonymize', 'delete']);
  });

  it('reports what it did', async () => {
    const result = await deleteAccountData(USER_ID);
    expect(result).toEqual({ auditRowsPseudonymized: 2, userDeleted: true });
  });

  it('reports userDeleted=false when the row was already gone', async () => {
    wireSql({ 'DELETE FROM "user"': [] });
    const result = await deleteAccountData(USER_ID);
    expect(result.userDeleted).toBe(false);
  });

  it('writes the pseudonym, never the raw id, into audit_logs', async () => {
    await deleteAccountData(USER_ID);
    const update = mocks.sql.mock.calls.find(([first]) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      return text.includes('UPDATE audit_logs');
    })!;
    const values = update.slice(1);
    expect(values[0]).toBe(pseudonymizeActorId(USER_ID));
    expect(String(values[0])).not.toBe(USER_ID);
  });
});
