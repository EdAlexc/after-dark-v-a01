/**
 * Origins the app is served under on Vercel (CLAUDE.md §2.1; DEV_TIMELINE
 * Technical Backlog #22).
 *
 * `trustedOrigins` in `auth.ts` is built from hand-set env vars, but every
 * preview deployment gets its own hostname that nobody can know in advance.
 * A preview whose origin isn't trusted fails better-auth's CSRF check with
 * "Invalid origin" on every sign-in, so previews are unusable for auth.
 *
 * Vercel injects these hostnames as system env vars (protocol-less), so we
 * can derive the exact set at runtime:
 *
 *   VERCEL_URL                    this deployment's unique URL
 *                                 (afterdark-abc123-team.vercel.app)
 *   VERCEL_BRANCH_URL             stable per-branch alias
 *                                 (afterdark-git-my-branch-team.vercel.app)
 *   VERCEL_PROJECT_PRODUCTION_URL the project's production domain
 *
 * Deliberately NOT a `https://*.vercel.app` wildcard: that would trust every
 * app on the platform and hand any of them a working CSRF bypass. Only this
 * project's own hostnames are added.
 *
 * Requires "Automatically expose System Environment Variables" (Vercel project
 * → Settings → Environment Variables), which is on by default. Off-platform
 * the vars are absent and this returns [], leaving existing behaviour intact.
 */

/** Vercel system env vars that hold a protocol-less hostname for this app. */
const HOSTNAME_VARS = [
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
] as const;

/**
 * @param env process.env (injectable for tests)
 * @returns deduped `https://` origins for this deployment; [] when off-Vercel
 */
export function vercelOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const origins = HOSTNAME_VARS.map((name) => env[name])
    .filter((host): host is string => typeof host === 'string' && host.length > 0)
    // The vars are protocol-less by contract, but a user-set override may
    // already carry a scheme — don't emit `https://https://…` if so.
    .map((host) => (/^https?:\/\//.test(host) ? host : `https://${host}`));

  return [...new Set(origins)];
}
