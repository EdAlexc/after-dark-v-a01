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

export function middleware(request: NextRequest) {
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
