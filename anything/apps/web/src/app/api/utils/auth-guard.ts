/**
 * AuthN/AuthZ guard for route handlers (TENANT_GUARDRAIL §6.1 authZ matrix).
 *
 * - `requireSession()` → 401 when unauthenticated.
 * - `requireRole(...)` → 401/403 per the matrix. The role is read from the
 *   DB on every call (never from client input, never from a stale cookie
 *   cache), so role changes take effect immediately.
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

export interface GuardDeps {
  getSessionUser: () => Promise<SessionUser | null>;
  getUserRole: (userId: string) => Promise<string | null>;
}

export class AuthGuard {
  constructor(private readonly deps: GuardDeps) {}

  /** Returns the authenticated user or throws 401. */
  async requireSession(): Promise<SessionUser> {
    const user = await this.deps.getSessionUser();
    if (!user?.id) throw ApiError.unauthorized();
    return user;
  }

  /**
   * Returns the user + DB role, or null when signed out. For public surfaces
   * that show extras to the owner (e.g. a venue viewing its own draft gig) —
   * never use this where access must be denied; that's requireRole's job.
   */
  async optionalUser(): Promise<(SessionUser & { role: Role | null }) | null> {
    const user = await this.deps.getSessionUser();
    if (!user?.id) return null;
    const role = (await this.deps.getUserRole(user.id)) as Role | null;
    return { ...user, role };
  }

  /**
   * Returns the user + role when the role is one of `allowed` (ADMIN always
   * passes). Throws 401 when signed out, 403 otherwise.
   */
  async requireRole(...allowed: Role[]): Promise<SessionUser & { role: Role }> {
    const user = await this.requireSession();
    const role = (await this.deps.getUserRole(user.id)) as Role | null;
    if (role !== 'ADMIN' && (role === null || !allowed.includes(role))) {
      throw ApiError.forbidden('Your role does not allow this action');
    }
    return { ...user, role: role as Role };
  }
}

const productionDeps: GuardDeps = {
  async getSessionUser() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return null;
    const { id, email, name } = session.user;
    return { id, email, name };
  },
  async getUserRole(userId) {
    const rows = (await sql`
      SELECT role FROM "user" WHERE id = ${userId} LIMIT 1
    `) as Array<{ role: string | null }>;
    return rows[0]?.role ?? null;
  },
};

/** Shared guard wired to better-auth + Neon. */
export const authGuard = new AuthGuard(productionDeps);
