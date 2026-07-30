/**
 * The authZ matrix — TENANT_GUARDRAIL §6.1 encoded as data.
 *
 * The guardrail calls the generated suite over this table "the single most
 * important test artifact in the repo". Two things hang off it:
 *
 *  1. **Coverage**: `__tests__/authz-matrix.test.ts` walks `src/app/api` and
 *     fails if any route file has no row here. Adding an endpoint without
 *     declaring who may call it breaks the build — authZ can't be forgotten
 *     under deadline pressure.
 *  2. **Behavior**: the same suite invokes each non-platform handler once per
 *     actor and asserts the declared outcome, including the "other tenant"
 *     case, so tenant isolation is proven rather than assumed.
 *
 * Editing rules:
 *  - A new route ⇒ a new row, in the same PR.
 *  - Deny by default: if you are unsure, `FORBIDDEN` and add a test.
 *  - `NOT_FOUND` is deliberate where leaking *existence* is itself a leak
 *    (someone else's draft gig), per the §6.2 isolation rules.
 */

/** Who is calling. `anon` = no session. */
export type Actor = 'anon' | 'TALENT' | 'VENUE' | 'PARTY' | 'ADMIN';

export const ACTORS: readonly Actor[] = ['anon', 'TALENT', 'VENUE', 'PARTY', 'ADMIN'];

/** Expected outcome class for an actor. */
export type Outcome =
  /** 2xx — request is allowed. */
  | 'ALLOW'
  /** 401 — no/!valid session. */
  | 'UNAUTHENTICATED'
  /** 403 — authenticated but the role may not do this. */
  | 'FORBIDDEN'
  /** 404 — allowed to ask, but the resource must not be revealed to exist. */
  | 'NOT_FOUND';

export interface MatrixRow {
  /** Stable id, used in test names. */
  id: string;
  /** Route file path relative to `src/app/api`, e.g. `gigs/[id]/route.ts`. */
  route: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** What the endpoint does, in one line. */
  summary: string;
  /** Outcome per actor when acting on their **own** resources. */
  expect: Record<Actor, Outcome>;
  /**
   * Outcome when the caller targets **another tenant's** resource. Omit when
   * the route has no cross-tenant surface (no id parameter, self-scoped only).
   */
  expectCrossTenant?: Partial<Record<Actor, Outcome>>;
  /**
   * State the other tenant's resource is in for the cross-tenant test.
   *
   * This matters: another venue's *PUBLISHED* gig is meant to be world-readable
   * (that is the marketplace), while their DRAFT must not even be revealed to
   * exist. Testing the published case would assert nothing about isolation.
   */
  crossTenantFixture?: { gigStatus?: 'DRAFT' | 'PUBLISHED' | 'FILLED' | 'CANCELLED' };
  /**
   * Platform/vendor-owned route (better-auth catch-all, create.xyz shims).
   * Exempt from behavioral assertions — they are not ours to restructure —
   * but still declared so the coverage gate stays honest.
   */
  platform?: true;
  /** Why this route is safe to expose the way it is. */
  note?: string;
}

const PUBLIC: Record<Actor, Outcome> = {
  anon: 'ALLOW',
  TALENT: 'ALLOW',
  VENUE: 'ALLOW',
  PARTY: 'ALLOW',
  ADMIN: 'ALLOW',
};

const AUTHENTICATED_SELF: Record<Actor, Outcome> = {
  anon: 'UNAUTHENTICATED',
  TALENT: 'ALLOW',
  VENUE: 'ALLOW',
  PARTY: 'ALLOW',
  ADMIN: 'ALLOW',
};

const VENUE_ONLY: Record<Actor, Outcome> = {
  anon: 'UNAUTHENTICATED',
  TALENT: 'FORBIDDEN',
  VENUE: 'ALLOW',
  PARTY: 'FORBIDDEN',
  ADMIN: 'ALLOW',
};

const TALENT_ONLY: Record<Actor, Outcome> = {
  anon: 'UNAUTHENTICATED',
  TALENT: 'ALLOW',
  VENUE: 'FORBIDDEN',
  PARTY: 'FORBIDDEN',
  ADMIN: 'ALLOW',
};

export const AUTHZ_MATRIX: readonly MatrixRow[] = [
  // ─── Public discovery (§6.1 row 1–2) ────────────────────────────────────────
  {
    id: 'gigs.list',
    route: 'gigs/route.ts',
    method: 'GET',
    summary: 'Public gig listing — PUBLISHED only',
    expect: PUBLIC,
    note: 'Status is pinned server-side; drafts can never appear (draft-leak regression).',
  },
  {
    id: 'talent.list',
    route: 'talent/route.ts',
    method: 'GET',
    summary: 'Public talent directory — public-profile columns only',
    expect: PUBLIC,
    note: 'Selects no auth-table columns; PARTY discovery depends on this staying public.',
  },
  {
    id: 'gigs.detail',
    route: 'gigs/[id]/route.ts',
    method: 'GET',
    summary: 'Gig detail — public when PUBLISHED, owner-only otherwise',
    expect: PUBLIC,
    // Exercised against another venue's DRAFT: a non-owner must not learn it
    // exists. (Their PUBLISHED gigs are public by design — that is the point
    // of the marketplace — so asserting on those would prove nothing.)
    crossTenantFixture: { gigStatus: 'DRAFT' },
    expectCrossTenant: {
      anon: 'NOT_FOUND',
      TALENT: 'NOT_FOUND',
      VENUE: 'NOT_FOUND',
      PARTY: 'NOT_FOUND',
      ADMIN: 'ALLOW',
    },
  },

  // ─── Marketplace writes (§6.1 rows 3–5) ─────────────────────────────────────
  {
    id: 'gigs.create',
    route: 'gigs/route.ts',
    method: 'POST',
    summary: 'Create a gig for the calling venue',
    expect: VENUE_ONLY,
    note: 'venue_id is derived from the session, never from the body.',
  },
  {
    id: 'gigs.status',
    route: 'gigs/[id]/route.ts',
    method: 'PATCH',
    summary: 'Gig lifecycle transition — owning venue only',
    expect: VENUE_ONLY,
    expectCrossTenant: {
      TALENT: 'FORBIDDEN',
      VENUE: 'NOT_FOUND',
      PARTY: 'FORBIDDEN',
      ADMIN: 'ALLOW',
    },
    note: "Another venue gets 404, not 403 — existence of a rival's gig stays hidden.",
  },
  {
    id: 'venue.gigs',
    route: 'venue/gigs/route.ts',
    method: 'GET',
    summary: "The calling venue's own gigs, all statuses",
    expect: VENUE_ONLY,
  },

  // ─── Profiles (§6.1 settings/profile rows) ──────────────────────────────────
  {
    id: 'talent.profile.get',
    route: 'talent/profile/route.ts',
    method: 'GET',
    summary: "Read own talent profile",
    expect: AUTHENTICATED_SELF,
  },
  {
    id: 'talent.profile.update',
    route: 'talent/profile/route.ts',
    method: 'PUT',
    summary: 'Update own talent profile',
    expect: TALENT_ONLY,
  },
  {
    id: 'venue.profile.get',
    route: 'venue/profile/route.ts',
    method: 'GET',
    summary: 'Read own venue profile',
    expect: AUTHENTICATED_SELF,
  },
  {
    id: 'venue.profile.update',
    route: 'venue/profile/route.ts',
    method: 'PUT',
    summary: 'Update own venue profile',
    expect: VENUE_ONLY,
  },

  // ─── Account & settings (self-scoped: no cross-tenant surface exists) ───────
  {
    id: 'settings.get',
    route: 'settings/route.ts',
    method: 'GET',
    summary: 'Read own settings',
    expect: AUTHENTICATED_SELF,
  },
  {
    id: 'settings.update',
    route: 'settings/route.ts',
    method: 'PUT',
    summary: 'Update own settings',
    expect: AUTHENTICATED_SELF,
  },
  {
    id: 'settings.change-password',
    route: 'settings/change-password/route.ts',
    method: 'POST',
    summary: 'Change own password (re-auth required)',
    expect: AUTHENTICATED_SELF,
  },
  {
    id: 'user.role.get',
    route: 'user/role/route.ts',
    method: 'GET',
    summary: 'Read own role',
    expect: AUTHENTICATED_SELF,
  },
  {
    id: 'user.role.set',
    route: 'user/role/route.ts',
    method: 'POST',
    summary: 'Self-service role selection — TALENT/VENUE/PARTY only',
    expect: AUTHENTICATED_SELF,
    note: 'ADMIN is rejected by the schema — privilege-escalation regression (§7 finding 1).',
  },
  {
    id: 'session.get',
    route: 'session/route.ts',
    method: 'GET',
    summary: 'Current session probe',
    expect: AUTHENTICATED_SELF,
    note: 'Returns 401 (not an empty body) when signed out, and only ever the caller’s own session.',
  },

  // ─── Data-subject requests (§4.2 G4) ────────────────────────────────────────
  {
    id: 'account.export',
    route: 'account/export/route.ts',
    method: 'GET',
    summary: 'Export own data (Art. 15/20)',
    expect: AUTHENTICATED_SELF,
    note: 'No id parameter exists, so one user can never export another.',
  },
  {
    id: 'account.delete',
    route: 'account/route.ts',
    method: 'DELETE',
    summary: 'Erase own account (Art. 17) — password re-auth + typed confirmation',
    expect: AUTHENTICATED_SELF,
  },
  {
    id: 'account.age-confirm',
    route: 'account/age-confirm/route.ts',
    method: 'POST',
    summary: 'Record the 18+ attestation (G12)',
    expect: AUTHENTICATED_SELF,
    note: 'Takes no body: subject is the session user, timestamp is NOW().',
  },

  // ─── Platform / vendor routes (declared, not behaviorally asserted) ─────────
  {
    id: 'auth.catch-all',
    route: 'auth/[...all]/route.ts',
    method: 'POST',
    summary: 'better-auth handler (sign-in/up/2FA/session)',
    expect: PUBLIC,
    platform: true,
    note: 'DO NOT REWRITE. better-auth enforces its own authZ; rate limits configured in auth.ts.',
  },
  {
    id: 'auth.token',
    route: 'auth/token/route.ts',
    method: 'GET',
    summary: 'Bearer token for the mobile WebView',
    expect: AUTHENTICATED_SELF,
    platform: true,
  },
  {
    id: 'auth.expo-web-success',
    route: 'auth/expo-web-success/route.ts',
    method: 'GET',
    summary: 'Expo auth bridge callback',
    expect: PUBLIC,
    platform: true,
    note: 'Platform file; postMessage target origin tracked in CLAUDE.md §7 finding 5.',
  },
  {
    id: 'create.check-social-secrets',
    route: '__create/check-social-secrets/route.ts',
    method: 'GET',
    summary: 'create.xyz dev-only probe for configured OAuth providers',
    expect: PUBLIC,
    platform: true,
    note: 'Reports only whether env vars are present — never their values.',
  },
];

/** Route files that legitimately have no authZ surface of their own. */
export const MATRIX_EXEMPT_ROUTES: readonly string[] = [];

/** Every distinct route file the matrix declares. */
export function declaredRoutes(): Set<string> {
  return new Set(AUTHZ_MATRIX.map((row) => row.route));
}
