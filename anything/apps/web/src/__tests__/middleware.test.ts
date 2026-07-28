import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, config, isExploreMode } from '../middleware';

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

describe('explore mode (DISABLE_AUTH_GATE)', () => {
  afterEach(() => {
    delete process.env.DISABLE_AUTH_GATE;
    delete process.env.VERCEL_ENV;
  });

  it('is off unless explicitly enabled', () => {
    expect(isExploreMode({})).toBe(false);
    expect(isExploreMode({ DISABLE_AUTH_GATE: '' })).toBe(false);
    expect(isExploreMode({ DISABLE_AUTH_GATE: '0' })).toBe(false);
    // Guards against a truthy-string bug enabling it by accident.
    expect(isExploreMode({ DISABLE_AUTH_GATE: 'false' })).toBe(false);
  });

  it('accepts the documented opt-in values', () => {
    expect(isExploreMode({ DISABLE_AUTH_GATE: '1' })).toBe(true);
    expect(isExploreMode({ DISABLE_AUTH_GATE: 'true' })).toBe(true);
  });

  it('is never honoured in production, even when set', () => {
    expect(
      isExploreMode({ DISABLE_AUTH_GATE: '1', VERCEL_ENV: 'production' }),
    ).toBe(false);
  });

  it('still works on preview and local deployments', () => {
    expect(isExploreMode({ DISABLE_AUTH_GATE: '1', VERCEL_ENV: 'preview' })).toBe(true);
    expect(
      isExploreMode({ DISABLE_AUTH_GATE: '1', VERCEL_ENV: 'development' }),
    ).toBe(true);
  });

  it('lets an anonymous dashboard request straight through when enabled', () => {
    process.env.DISABLE_AUTH_GATE = '1';
    const res = middleware(request('/dashboard/venue'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('re-gates as soon as it is turned off', () => {
    const res = middleware(request('/dashboard/venue'));
    expect(res.headers.get('location')).toContain('/account/signin');
  });
});
