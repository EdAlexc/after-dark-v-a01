import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, config } from '../middleware';

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

  it('guards /onboarding too (per matcher)', () => {
    expect(config.matcher).toContain('/onboarding');
    const res = middleware(request('/onboarding'));
    expect(res.headers.get('location')).toContain('/account/signin');
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
