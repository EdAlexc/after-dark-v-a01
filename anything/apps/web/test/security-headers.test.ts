import { describe, expect, it } from 'vitest';
// Plain CJS module shared with next.config.js.
import { buildCsp, buildSecurityHeaders, createPlatformOrigins } from '../security-headers.js';

describe('buildCsp', () => {
  it('pins the core directives in production mode', () => {
    const csp: string = buildCsp({ isDev: false, env: {} });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('allows eval + websockets only in dev (HMR)', () => {
    const dev: string = buildCsp({ isDev: true, env: {} });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain('ws:');
    expect(dev).not.toContain('upgrade-insecure-requests');
  });

  it('admits create.xyz builder origins into frame-ancestors and connect-src', () => {
    const csp: string = buildCsp({
      isDev: false,
      env: {
        NEXT_PUBLIC_CREATE_BASE_URL: 'https://www.create.xyz',
        NEXT_PUBLIC_CREATE_HOST: 'app.create.xyz',
      },
    });
    expect(csp).toContain("frame-ancestors 'self' https://www.create.xyz https://app.create.xyz");
    expect(csp).toContain('connect-src');
    expect(csp).toContain('https://www.create.xyz');
  });

  it('falls back to self-only frame-ancestors without platform env', () => {
    expect(buildCsp({ isDev: false, env: {} })).toContain("frame-ancestors 'self'");
  });
});

describe('buildSecurityHeaders', () => {
  const headers: Array<{ key: string; value: string }> = buildSecurityHeaders({
    isDev: false,
    env: {},
  });
  const byKey = Object.fromEntries(headers.map((header) => [header.key, header.value]));

  it('sends the full A05 header set', () => {
    expect(Object.keys(byKey).sort()).toEqual(
      [
        'Content-Security-Policy',
        'Permissions-Policy',
        'Referrer-Policy',
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-DNS-Prefetch-Control',
      ].sort()
    );
  });

  it('HSTS ≥ 1 year with subdomains; nosniff; strict referrer', () => {
    expect(byKey['Strict-Transport-Security']).toMatch(/max-age=(\d{8,})/);
    expect(Number(byKey['Strict-Transport-Security'].match(/max-age=(\d+)/)![1])).toBeGreaterThan(
      31_536_000
    );
    expect(byKey['Strict-Transport-Security']).toContain('includeSubDomains');
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('locks camera/microphone/payment; geolocation self-only', () => {
    expect(byKey['Permissions-Policy']).toContain('camera=()');
    expect(byKey['Permissions-Policy']).toContain('microphone=()');
    expect(byKey['Permissions-Policy']).toContain('payment=()');
    expect(byKey['Permissions-Policy']).toContain('geolocation=(self)');
  });
});

describe('createPlatformOrigins', () => {
  it('handles missing, partial, and full env', () => {
    expect(createPlatformOrigins({})).toEqual([]);
    expect(createPlatformOrigins({ NEXT_PUBLIC_CREATE_HOST: 'x.create.xyz' })).toEqual([
      'https://x.create.xyz',
    ]);
    expect(
      createPlatformOrigins({
        NEXT_PUBLIC_CREATE_BASE_URL: 'https://a.example',
        NEXT_PUBLIC_CREATE_HOST: 'b.example',
      })
    ).toEqual(['https://a.example', 'https://b.example']);
  });
});
