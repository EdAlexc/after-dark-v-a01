import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * DELETE /api/account (P2.2, GDPR Art. 17) — S14. The two-factor confirm
 * gate (fresh password + typed DELETE) was verified only by manual curl
 * (TESTING.md §6); route-pinned here. The erasure mechanics themselves are
 * covered by utils/__tests__/account-data.test.ts.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInEmail: vi.fn(),
  sql: vi.fn(),
  deleteAccountData: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mocks.getSession, signInEmail: mocks.signInEmail } },
}));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));
vi.mock('@/app/api/utils/account-data', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/app/api/utils/account-data')>();
  return { ...original, deleteAccountData: mocks.deleteAccountData };
});

import { DELETE } from '../route';
import { pseudonymizeActorId } from '@/app/api/utils/account-data';
import { getRateLimiter } from '@/app/api/utils/rate-limit';

const auditValues: unknown[][] = [];

function deleteRequest(body: Record<string, unknown>): Request {
  return new Request('http://test.local/api/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auditValues.length = 0;
  getRateLimiter('account-delete', { windowMs: 1, max: 1 }).reset();
  mocks.getSession.mockResolvedValue({ user: { id: 'user-1', email: 'u@x.com' } });
  mocks.signInEmail.mockResolvedValue({ user: { id: 'user-1' } });
  mocks.deleteAccountData.mockResolvedValue({ userDeleted: true, auditRowsPseudonymized: 3 });
  mocks.sql.mockImplementation(async (first: unknown, ...values: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) return [{ role: 'TALENT' }];
    if (text.includes('INSERT INTO audit_logs')) auditValues.push(values);
    return [];
  });
});

describe('DELETE /api/account — the two-factor confirm gate', () => {
  it("confirm !== 'DELETE' → 400, no password check, no deletion", async () => {
    const res = await DELETE(deleteRequest({ password: 'pw', confirm: 'delete' }), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Type DELETE');
    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expect(mocks.deleteAccountData).not.toHaveBeenCalled();
  });

  it('wrong password → 400 with a reason-free message, no deletion', async () => {
    mocks.signInEmail.mockRejectedValue(new Error('INVALID_EMAIL_OR_PASSWORD'));
    const res = await DELETE(deleteRequest({ password: 'wrong', confirm: 'DELETE' }), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Password is incorrect');
    expect(mocks.deleteAccountData).not.toHaveBeenCalled();
  });

  it('both factors present → erasure runs for the SESSION user (no id parameter exists)', async () => {
    const res = await DELETE(deleteRequest({ password: 'right', confirm: 'DELETE' }), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, auditRowsPseudonymized: 3 });
    expect(mocks.deleteAccountData).toHaveBeenCalledWith('user-1');
  });

  it('the surviving audit row is pseudonymized BEFORE the user row dies', async () => {
    await DELETE(deleteRequest({ password: 'right', confirm: 'DELETE' }), {});
    expect(auditValues.length).toBeGreaterThan(0);
    const actorId = auditValues[0][0];
    expect(actorId).toBe(pseudonymizeActorId('user-1'));
    expect(actorId).not.toBe('user-1');
  });
});
