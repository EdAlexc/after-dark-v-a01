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

  it('emits a nonce + strict-dynamic script policy when given a nonce (Backlog #18)', () => {
    const csp: string = buildCsp({ isDev: false, env: {}, nonce: 'abc123==' });
    expect(csp).toContain("script-src 'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(csp.match(/script-src[^;]*/)?.[0]).not.toContain("'unsafe-inline'");
    // Styles keep the inline allowance (styled-jsx/tailwind inline styles).
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('falls back to the legacy inline script policy without a nonce', () => {
    const csp: string = buildCsp({ isDev: false, env: {} });
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });

  it('allows eval + websockets only in dev (HMR)', () => {
    const dev: string = buildCsp({ isDev: true, env: {}, nonce: 'n' });
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

  it("allows the service worker via worker-src 'self' (P10.2)", () => {
    // 'strict-dynamic' makes script-src ignore host sources, so without an
    // explicit worker-src the nonce policy would block /sw.js registration.
    expect(buildCsp({ isDev: false, env: {}, nonce: 'n' })).toContain("worker-src 'self'");
  });

  it('admits the Sentry ingest origin into connect-src only when configured', () => {
    const withDsn: string = buildCsp({
      isDev: false,
      env: { NEXT_PUBLIC_SENTRY_DSN: 'https://abc123@o4507.ingest.us.sentry.io/123456' },
    });
    expect(withDsn.match(/connect-src[^;]*/)?.[0]).toContain('https://o4507.ingest.us.sentry.io');
    const without: string = buildCsp({ isDev: false, env: {} });
    expect(without).not.toContain('sentry.io');
    // Garbage DSN must not throw or leak into the policy.
    const garbage: string = buildCsp({ isDev: false, env: { NEXT_PUBLIC_SENTRY_DSN: '::::' } });
    expect(garbage).toContain("connect-src 'self'");
  });
});

describe('buildSecurityHeaders', () => {
  const headers: Array<{ key: string; value: string }> = buildSecurityHeaders({
    isDev: false,
    env: {},
  });
  const byKey = Object.fromEntries(headers.map((header) => [header.key, header.value]));

  it('sends the full A05 header set (CSP is per-request via middleware)', () => {
    expect(Object.keys(byKey).sort()).toEqual(
      [
        'Permissions-Policy',
        'Referrer-Policy',
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-DNS-Prefetch-Control',
      ].sort()
    );
    // The nonce CSP must come from middleware only — a second static CSP
    // here would enforce the intersection and break the nonce.
    expect(byKey['Content-Security-Policy']).toBeUndefined();
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
