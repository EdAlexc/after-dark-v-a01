/**
 * /api/session — S4 suspended-account surface.
 *
 * The suspended page reads this endpoint: 401 signed out, 403 with the
 * "Account suspended: <reason>" message when moderated, 200 otherwise. The
 * 403 message shape is load-bearing (`/account/suspended` parses it).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { GET as sessionGet } from '../route';

const SESSION = {
  user: { id: 'u1', email: 'u1@example.com', name: 'U One' },
  session: { id: 's1' },
};

function userRow(row: Record<string, unknown>) {
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    return text.includes('SELECT role, suspended_at') ? [row] : [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(SESSION);
  userRow({ role: 'TALENT', suspended_at: null, suspended_reason: null });
});

describe('GET /api/session', () => {
  it('401 when signed out', async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await sessionGet(new Request('http://t.local/api/session'), {});
    expect(res.status).toBe(401);
  });

  it('200 with own session when in good standing', async () => {
    const res = await sessionGet(new Request('http://t.local/api/session'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe('u1');
  });

  it('403 carrying the reason when suspended (the suspended page parses this)', async () => {
    userRow({ role: 'TALENT', suspended_at: '2026-07-31', suspended_reason: 'ToS violation' });
    const res = await sessionGet(new Request('http://t.local/api/session'), {});
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Account suspended: ToS violation');
  });

  it('403 with the generic message when no reason is recorded', async () => {
    userRow({ role: 'TALENT', suspended_at: '2026-07-31', suspended_reason: null });
    const res = await sessionGet(new Request('http://t.local/api/session'), {});
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Account suspended');
  });
});
