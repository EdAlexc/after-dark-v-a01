import { describe, expect, it } from 'vitest';
import { isSafeCallbackUrl, sanitizeCallbackUrl } from '../safe-redirect';

describe('sanitizeCallbackUrl', () => {
  it('allows plain internal paths', () => {
    expect(sanitizeCallbackUrl('/')).toBe('/');
    expect(sanitizeCallbackUrl('/dashboard/talent')).toBe('/dashboard/talent');
    expect(sanitizeCallbackUrl('/gigs/123?tab=details&x=1')).toBe('/gigs/123?tab=details&x=1');
    expect(sanitizeCallbackUrl('/onboarding#step-2')).toBe('/onboarding#step-2');
  });

  it('keeps encoded slashes (they do not escape the origin)', () => {
    expect(sanitizeCallbackUrl('/%2F%2Fevil.example')).toBe('/%2F%2Fevil.example');
  });

  it('trims surrounding whitespace before validating', () => {
    expect(sanitizeCallbackUrl('  /dashboard  ')).toBe('/dashboard');
  });

  it.each([
    ['absolute http', 'http://evil.example/'],
    ['absolute https', 'https://evil.example/'],
    ['protocol-relative', '//evil.example'],
    ['triple slash', '///evil.example'],
    ['backslash host trick', '/\\evil.example'],
    ['backslash anywhere', '/dashboard\\..%2f'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,x'],
    ['mailto scheme', 'mailto:a@b.c'],
    ['missing leading slash', 'dashboard'],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['newline smuggling', '/dash\nboard'],
    ['tab smuggling', '/dash\tboard'],
    ['null byte', `/dash${String.fromCharCode(0)}board`],
  ])('falls back on %s', (_label, input) => {
    expect(sanitizeCallbackUrl(input)).toBe('/');
  });

  it('falls back on non-string inputs', () => {
    expect(sanitizeCallbackUrl(null)).toBe('/');
    expect(sanitizeCallbackUrl(undefined)).toBe('/');
  });

  it('falls back on absurdly long values', () => {
    expect(sanitizeCallbackUrl(`/${'a'.repeat(3000)}`)).toBe('/');
  });

  it('honors a custom fallback', () => {
    expect(sanitizeCallbackUrl('https://evil.example', '/onboarding')).toBe('/onboarding');
  });
});

describe('isSafeCallbackUrl', () => {
  it('reflects sanitization outcome', () => {
    expect(isSafeCallbackUrl('/dashboard')).toBe(true);
    expect(isSafeCallbackUrl('//evil.example')).toBe(false);
    expect(isSafeCallbackUrl(undefined)).toBe(false);
  });
});
