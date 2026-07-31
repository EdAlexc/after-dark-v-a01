/**
 * AuthN/AuthZ guard for route handlers (TENANT_GUARDRAIL §6.1 authZ matrix).
 *
 * - `requireSession()` → 401 when unauthenticated **or when the account no
 *   longer exists**; 403 when the account is suspended (P9).
 * - `requireRole(...)` → 401/403 per the matrix. The role is read from the
 *   DB on every call (never from client input, never from a stale cookie
 *   cache), so role changes take effect immediately.
 *
 * Why the existence check matters: better-auth caches the session in the
 * cookie itself (7 days, see `auth.ts`), so `getSession` succeeds without
 * touching the database. Without a DB lookup, a **deleted** account's cookie
 * keeps authenticating until the cache expires — found during P2 verification.
 * P9 reuses the same lookup for **suspension**: a non-NULL `suspended_at`
 * turns every authenticated call into a 403 that carries the reason. The one
 * carve-out is `allowSuspended` on `requireSession`, used only by the GDPR
 * self-service routes — suspension must not block data-subject rights
 * (export/erasure), or a suspended user could never exercise them.
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
  /** Non-null = account suspended by an admin (P9). */
  suspendedAt?: string | null;
  suspendedReason?: string | null;
}

export interface GuardDeps {
  getSessionUser: () => Promise<SessionUser | null>;
  /** Returns null when the user row is gone (deleted account). */
  getUserRecord: (userId: string) => Promise<UserRecord | null>;
}

export interface SessionOptions {
  /**
   * Let a suspended account through. ONLY for the GDPR self-service routes
   * (`/api/account/export`, `DELETE /api/account`) — data-subject rights
   * survive moderation. Everything else must leave this unset.
   */
  allowSuspended?: boolean;
}

export class AuthGuard {
  constructor(private readonly deps: GuardDeps) {}

  /**
   * Returns the authenticated user, or throws 401 when signed out or when the
   * account has been erased; 403 when suspended (unless `allowSuspended`).
   */
  async requireSession(options: SessionOptions = {}): Promise<SessionUser> {
    const { user } = await this.resolve(options);
    return user;
  }

  /**
   * Returns the user + role when the role is one of `allowed` (ADMIN always
   * passes). Throws 401 when signed out, 403 otherwise. Suspension always
   * denies here — there is no allowSuspended for role-gated actions.
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
   * Returns the user + DB role, or null when signed out / erased / suspended.
   * For public surfaces that show extras to the owner (e.g. a venue viewing
   * its own draft gig) — never use this where access must be denied; that's
   * requireRole's job. A suspended account gets the public view, no extras.
   */
  async optionalUser(): Promise<(SessionUser & { role: Role | null }) | null> {
    const user = await this.deps.getSessionUser();
    if (!user?.id) return null;
    const record = await this.deps.getUserRecord(user.id);
    if (record === null || record.suspendedAt) return null;
    return { ...user, role: record.role };
  }

  /** Session + existence + suspension checks in one place. */
  private async resolve(
    options: SessionOptions = {}
  ): Promise<{ user: SessionUser; record: UserRecord }> {
    const user = await this.deps.getSessionUser();
    if (!user?.id) throw ApiError.unauthorized();
    const record = await this.deps.getUserRecord(user.id);
    // Cookie is valid but the account is gone — treat as signed out, not as a
    // user with no role, or an erased account keeps a working session.
    if (record === null) throw ApiError.unauthorized('Account no longer exists');
    if (record.suspendedAt && !options.allowSuspended) {
      throw ApiError.forbidden(
        record.suspendedReason
          ? `Account suspended: ${record.suspendedReason}`
          : 'Account suspended'
      );
    }
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
      SELECT role, suspended_at, suspended_reason FROM "user" WHERE id = ${userId} LIMIT 1
    `) as Array<{
      role: string | null;
      suspended_at: string | null;
      suspended_reason: string | null;
    }>;
    if (rows.length === 0) return null;
    return {
      role: (rows[0].role as Role | null) ?? null,
      suspendedAt: rows[0].suspended_at,
      suspendedReason: rows[0].suspended_reason,
    };
  },
};

/** Shared guard wired to better-auth + Neon. */
export const authGuard = new AuthGuard(productionDeps);
