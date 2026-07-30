import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://app.local${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe('auth middleware', () => {
  it('lets a session cookie through (plain and __Secure- variants)', () => {
    for (const name of ['better-auth.session_token', '__Secure-better-auth.session_token']) {
      const res = middleware(request('/dashboard/talent', `${name}=tok123`));
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('redirects anonymous dashboard hits to sign-in with a safe callbackUrl', () => {
    const res = middleware(request('/dashboard/venue/create-gig?step=2'));
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/account/signin');
    expect(location.searchParams.get('callbackUrl')).toBe('/dashboard/venue/create-gig?step=2');
  });

  it('treats an empty cookie value as signed out', () => {
    const res = middleware(request('/dashboard/talent', 'better-auth.session_token='));
    expect(res.headers.get('location')).toContain('/account/signin');
  });

  it('guards /onboarding too', () => {
    const res = middleware(request('/onboarding'));
    expect(res.headers.get('location')).toContain('/account/signin');
  });

  it('leaves public surfaces (landing, gig detail, browse API) unauthenticated', () => {
    for (const path of ['/', '/gigs/4b4b1c2e-8f6a-4f7e-9d2a-1234567890ab', '/api/gigs']) {
      const res = middleware(request(path));
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('does not gate look-alike paths outside the protected prefixes', () => {
    const res = middleware(request('/dashboardish'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('never emits an unsafe callbackUrl even for hostile paths', () => {
    // Path smuggling attempt: the sanitized value must stay a relative path.
    const res = middleware(request('/dashboard/%2F%2Fevil.example'));
    const location = new URL(res.headers.get('location')!);
    const callback = location.searchParams.get('callbackUrl') ?? '/';
    expect(callback.startsWith('/')).toBe(true);
    expect(callback.startsWith('//')).toBe(false);
  });
});

describe('nonce CSP middleware (Backlog #18)', () => {
  it('sets a nonce-based CSP without unsafe-inline scripts', () => {
    const res = middleware(request('/'));
    const csp = res.headers.get('Content-Security-Policy')!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp.match(/script-src[^;]*/)?.[0]).not.toContain("'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it('issues a fresh nonce per request', () => {
    const nonce = (res: Response) =>
      res.headers.get('Content-Security-Policy')!.match(/'nonce-([^']+)'/)?.[1];
    const first = nonce(middleware(request('/')));
    const second = nonce(middleware(request('/')));
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });
});
