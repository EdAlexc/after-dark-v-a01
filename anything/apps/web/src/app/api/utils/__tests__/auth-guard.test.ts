import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('../sql', () => ({ default: vi.fn() }));

import { AuthGuard, type GuardDeps, type SessionUser } from '../auth-guard';
import { ApiError } from '../route-kit';

const USER: SessionUser = { id: 'u1', email: 'u1@example.com', name: 'U One' };

/**
 * `role: null` means "user exists but hasn't onboarded"; `exists: false` means
 * the account row is gone (deleted). Those are different outcomes — 403 vs 401
 * — which is exactly what the P2 deletion bug turned on.
 */
function guardWith(
  user: SessionUser | null,
  role: string | null,
  exists = true
): AuthGuard {
  const deps: GuardDeps = {
    getSessionUser: async () => user,
    getUserRecord: async (userId) =>
      exists && userId === USER.id ? { role: role as never } : null,
  };
  return new AuthGuard(deps);
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  try {
    await promise;
    expect.unreachable(`expected ApiError ${status}`);
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
  }
}

describe('AuthGuard.requireSession', () => {
  it('returns the user when authenticated', async () => {
    await expect(guardWith(USER, 'TALENT').requireSession()).resolves.toEqual(USER);
  });

  it('throws 401 when signed out or session is malformed', async () => {
    await expectStatus(guardWith(null, null).requireSession(), 401);
    await expectStatus(
      guardWith({ id: '', email: '' } as SessionUser, null).requireSession(),
      401
    );
  });

  it('throws 401 when the account was deleted but the cookie is still valid', async () => {
    // better-auth caches the session in the cookie for 7 days, so getSession
    // succeeds after erasure. Found in P2 verification: without the existence
    // check, a just-deleted user kept calling authenticated endpoints.
    await expectStatus(guardWith(USER, 'TALENT', false).requireSession(), 401);
  });
});

describe('AuthGuard.requireRole (authZ matrix, TENANT_GUARDRAIL §6.1)', () => {
  it('allows matching roles', async () => {
    const result = await guardWith(USER, 'VENUE').requireRole('VENUE');
    expect(result.role).toBe('VENUE');
  });

  it('ADMIN passes every role gate', async () => {
    const result = await guardWith(USER, 'ADMIN').requireRole('VENUE');
    expect(result.role).toBe('ADMIN');
  });

  it('throws 403 for mismatched roles (talent hitting venue surface)', async () => {
    await expectStatus(guardWith(USER, 'TALENT').requireRole('VENUE'), 403);
  });

  it('PARTY is denied every marketplace-principal write', async () => {
    await expectStatus(guardWith(USER, 'PARTY').requireRole('VENUE'), 403);
    await expectStatus(guardWith(USER, 'PARTY').requireRole('TALENT'), 403);
  });

  it('throws 403 when the user has no role yet (pre-onboarding)', async () => {
    await expectStatus(guardWith(USER, null).requireRole('VENUE'), 403);
  });

  it('throws 401 (not 403) when signed out entirely', async () => {
    await expectStatus(guardWith(null, null).requireRole('VENUE'), 401);
  });

  it('throws 401 for a deleted account, never 403 (it is not a role problem)', async () => {
    await expectStatus(guardWith(USER, 'VENUE', false).requireRole('VENUE'), 401);
  });

  it('supports multi-role gates', async () => {
    const result = await guardWith(USER, 'TALENT').requireRole('TALENT', 'VENUE');
    expect(result.role).toBe('TALENT');
  });

  it('never trusts a client-supplied role string (DB is the source)', async () => {
    // The guard only consults deps.getUserRecord; there is no code path for a
    // request-provided role. This assertion documents the invariant.
    const deps: GuardDeps = {
      getSessionUser: async () => USER,
      getUserRecord: vi.fn(async () => ({ role: 'TALENT' as const })),
    };
    const guard = new AuthGuard(deps);
    await expectStatus(guard.requireRole('VENUE'), 403);
    expect(deps.getUserRecord).toHaveBeenCalledWith(USER.id);
  });
});
