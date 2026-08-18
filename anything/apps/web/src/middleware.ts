/**
 * Middleware: auth gate for protected surfaces + per-request nonce CSP.
 *
 * Auth (TENANT_GUARDRAIL §5 A01; CLAUDE.md §7.2) — optimistic check: presence
 * of the better-auth session cookie. This blocks casual/unauthenticated access
 * to `/dashboard/*` and `/onboarding` with an edge-fast redirect; real
 * authN/authZ is enforced again in every route handler via `authGuard` (the
 * cookie is not validated here — a forged cookie gets past the redirect but
 * hits 401s on every API call).
 *
 * CSP (A05, Backlog #18) — a fresh nonce per request replaces the old static
 * 'unsafe-inline' script policy. The nonce rides the forwarded request
 * headers (both `x-nonce` and the CSP header itself) so Next.js attaches it
 * to its inline bootstrap scripts; the same policy is set on the response.
 * This requires dynamic rendering — see the root layout's `force-dynamic`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { sanitizeCallbackUrl } from '@/lib/safe-redirect';
// CJS module shared with next.config.js; the bundler handles the interop.
import { buildCsp } from '../security-headers.js';

/** better-auth session cookie names (plain and __Secure- prefixed). */
const SESSION_COOKIES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
];

/** Path prefixes that require a session (§6.1 authZ surface). */
const PROTECTED_PREFIXES = ['/dashboard', '/onboarding'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isProtectedPath(pathname)) {
    const hasSession = SESSION_COOKIES.some((name) => {
      const value = request.cookies.get(name)?.value;
      return typeof value === 'string' && value.length > 0;
    });
    if (!hasSession) {
      const target = sanitizeCallbackUrl(request.nextUrl.pathname + request.nextUrl.search);
      const signIn = new URL('/account/signin', request.url);
      if (target !== '/') signIn.searchParams.set('callbackUrl', target);
      return NextResponse.redirect(signIn);
    }
  }

  // Fresh nonce per request; base64 of a UUID (edge-safe, 128 bits).
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp({ isDev: process.env.NODE_ENV !== 'production', nonce });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Everything except the static assets that ACTUALLY exist (Next's build
  // output + the files in public/) — pages and API routes all get the
  // per-request CSP; protected paths get the auth gate.
  //
  // S15: this list used to exclude by EXTENSION (`…\\.(css|js|txt|…)$`), which
  // assumed any such URL is a static file. It isn't: a nonexistent one falls
  // through to Next's HTML 404, so `/robots.txt` (and `/anything.css`, …)
  // served a document with NO CSP header — found by ZAP's first baseline run.
  // Naming the real assets instead keeps them cheap while every document,
  // including 404s, carries the nonce CSP.
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|hero-nyc\\.webp|manifest\\.webmanifest|sw\\.js|icons/).*)',
    },
  ],
};
