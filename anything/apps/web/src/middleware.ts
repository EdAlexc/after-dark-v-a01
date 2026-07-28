/**
 * Auth gate for protected surfaces (TENANT_GUARDRAIL §5 A01; CLAUDE.md §7.2).
 *
 * Optimistic check: presence of the better-auth session cookie. This blocks
 * casual/unauthenticated access to `/dashboard/*` and `/onboarding` with an
 * edge-fast redirect; real authN/authZ is enforced again in every route
 * handler via `authGuard` (the cookie is not validated here — a forged
 * cookie gets past the redirect but hits 401s on every API call).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { sanitizeCallbackUrl } from '@/lib/safe-redirect';

/** better-auth session cookie names (plain and __Secure- prefixed). */
const SESSION_COOKIES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
];

/**
 * Explore mode: set `DISABLE_AUTH_GATE=1` to walk `/dashboard/*` and
 * `/onboarding` without signing in. Intended for demoing the UI on local and
 * preview deployments, where most dashboards render mock data anyway.
 *
 * Two deliberate limits:
 *  - **Never honoured in production** (`VERCEL_ENV === 'production'`), so a
 *    stray env var can't expose the real deployment. Fails closed.
 *  - Only lifts *this* optimistic cookie check. Route handlers still enforce
 *    real authN/authZ via `authGuard`, so anything backed by a live API (the
 *    profile editors, settings) still returns 401 — by design. This is a
 *    viewing aid, not a login bypass for data.
 */
export function isExploreMode(env: Record<string, string | undefined>): boolean {
  if (env.VERCEL_ENV === 'production') return false;
  return env.DISABLE_AUTH_GATE === '1' || env.DISABLE_AUTH_GATE === 'true';
}

export function middleware(request: NextRequest) {
  if (isExploreMode(process.env)) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => {
    const value = request.cookies.get(name)?.value;
    return typeof value === 'string' && value.length > 0;
  });
  if (hasSession) return NextResponse.next();

  const target = sanitizeCallbackUrl(request.nextUrl.pathname + request.nextUrl.search);
  const signIn = new URL('/account/signin', request.url);
  if (target !== '/') signIn.searchParams.set('callbackUrl', target);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding'],
};
