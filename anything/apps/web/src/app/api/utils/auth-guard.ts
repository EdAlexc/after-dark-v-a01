/**
 * AuthN/AuthZ guard for route handlers (TENANT_GUARDRAIL §6.1 authZ matrix).
 *
 * - `requireSession()` → 401 when unauthenticated **or when the account no
 *   longer exists**.
 * - `requireRole(...)` → 401/403 per the matrix. The role is read from the
 *   DB on every call (never from client input, never from a stale cookie
 *   cache), so role changes take effect immediately.
 *
 * Why the existence check matters: better-auth caches the session in the
 * cookie itself (7 days, see `auth.ts`), so `getSession` succeeds without
 * touching the database. Without a DB lookup, a **deleted** account's cookie
 * keeps authenticating until the cache expires — found during P2 verification,
 * when a just-erased user could still call authenticated endpoints. The same
 * lookup will cover admin-suspended accounts in P9.
 *
 * It costs one indexed primary-key lookup, and it replaces the query
 * `requireRole` was already making — so the common path is no more expensive
 * than before.
 *
 * Dependencies are constructor-injected so tests run without better-auth or
 * a database. Production code uses the `authGuard` singleton.
 */

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import sql from './sql';
import { ApiError } from './route-kit';

export type Role = 'TALENT' | 'VENUE' | 'PARTY' | 'ADMIN';

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

/** A row in `user`, or null when the account no longer exists. */
export interface UserRecord {
  role: Role | null;
}

export interface GuardDeps {
  getSessionUser: () => Promise<SessionUser | null>;
  /** Returns null when the user row is gone (deleted account). */
  getUserRecord: (userId: string) => Promise<UserRecord | null>;
}

export class AuthGuard {
  constructor(private readonly deps: GuardDeps) {}

  /**
   * Returns the authenticated user, or throws 401 when signed out or when the
   * account has been erased.
   */
  async requireSession(): Promise<SessionUser> {
    const { user } = await this.resolve();
    return user;
  }

  /**
   * Returns the user + role when the role is one of `allowed` (ADMIN always
   * passes). Throws 401 when signed out, 403 otherwise.
   */
  async requireRole(...allowed: Role[]): Promise<SessionUser & { role: Role }> {
    const { user, record } = await this.resolve();
    const role = record.role;
    if (role !== 'ADMIN' && (role === null || !allowed.includes(role))) {
      throw ApiError.forbidden('Your role does not allow this action');
    }
    return { ...user, role: role as Role };
  }

  /**
   * Returns the user + DB role, or null when signed out / erased. For public
   * surfaces that show extras to the owner (e.g. a venue viewing its own draft
   * gig) — never use this where access must be denied; that's requireRole's job.
   */
  async optionalUser(): Promise<(SessionUser & { role: Role | null }) | null> {
    const user = await this.deps.getSessionUser();
    if (!user?.id) return null;
    const record = await this.deps.getUserRecord(user.id);
    if (record === null) return null;
    return { ...user, role: record.role };
  }

  /** Session + existence check in one place, so the two can't diverge. */
  private async resolve(): Promise<{ user: SessionUser; record: UserRecord }> {
    const user = await this.deps.getSessionUser();
    if (!user?.id) throw ApiError.unauthorized();
    const record = await this.deps.getUserRecord(user.id);
    // Cookie is valid but the account is gone — treat as signed out, not as a
    // user with no role, or an erased account keeps a working session.
    if (record === null) throw ApiError.unauthorized('Account no longer exists');
    return { user, record };
  }
}

const productionDeps: GuardDeps = {
  async getSessionUser() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return null;
    const { id, email, name } = session.user;
    return { id, email, name };
  },
  async getUserRecord(userId) {
    const rows = (await sql`
      SELECT role FROM "user" WHERE id = ${userId} LIMIT 1
    `) as Array<{ role: string | null }>;
    if (rows.length === 0) return null;
    return { role: (rows[0].role as Role | null) ?? null };
  },
};

/** Shared guard wired to better-auth + Neon. */
export const authGuard = new AuthGuard(productionDeps);
