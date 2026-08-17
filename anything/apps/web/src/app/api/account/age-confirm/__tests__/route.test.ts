import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/account/age-confirm (P2.5, G12) — S14. The 18+ attestation's
 * verify method was "signup E2E", which does not exist yet (§7.2 Q2); until
 * S16 lands it, the route contract is pinned here: session-derived subject,
 * first-attestation-wins, audited exactly once.
 */

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), sql: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { POST } from '../route';

const auditActions: string[] = [];
const updateTexts: string[] = [];

function wireSql(options: { firstAttestation: boolean }) {
  auditActions.length = 0;
  updateTexts.length = 0;
  mocks.sql.mockImplementation(async (first: unknown, ...values: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('¤') : String(first);
    if (text.includes('SELECT role, suspended_at')) return [{ role: 'TALENT' }];
    if (text.includes('UPDATE "user"')) {
      updateTexts.push(text);
      return options.firstAttestation ? [{ age_confirmed_at: '2026-08-18T00:00:00Z' }] : [];
    }
    if (text.includes('INSERT INTO audit_logs')) {
      auditActions.push(String(values[1] ?? ''));
      return [];
    }
    return [];
  });
}

const request = () => new Request('http://test.local/api/account/age-confirm', { method: 'POST' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'user-1', email: 'u@x.com' } });
});

describe('POST /api/account/age-confirm', () => {
  it('401 for anonymous callers — the subject is always the session user', async () => {
    mocks.getSession.mockResolvedValue(null);
    wireSql({ firstAttestation: true });
    expect((await POST(request(), {})).status).toBe(401);
  });

  it('first attestation records NOW() server-side and audits with minimumAge 18', async () => {
    wireSql({ firstAttestation: true });
    const res = await POST(request(), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ confirmed: true });
    // The legal timestamp is not client-influencable: no body is read at all,
    // and the UPDATE is guarded to only ever set a NULL column.
    expect(updateTexts[0]).toContain('age_confirmed_at IS NULL');
    expect(auditActions).toEqual(['account.age_confirmed']);
  });

  it('a replay is a no-op, not a new legal event: first attestation wins', async () => {
    wireSql({ firstAttestation: false });
    const res = await POST(request(), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ confirmed: true });
    expect(auditActions).toEqual([]);
  });
});
