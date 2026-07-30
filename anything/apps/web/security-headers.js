/**
 * Security headers for every response (TENANT_GUARDRAIL §5 A05).
 *
 * Plain CJS so next.config.js and src/middleware.ts can both use it and
 * vitest can import it.
 *
 * Notes:
 * - The CSP is nonce-based (script-src 'nonce-…' 'strict-dynamic') and is
 *   emitted per-request by src/middleware.ts, which also forwards the nonce
 *   to Next.js via the request headers. The legacy 'unsafe-inline' script
 *   policy only remains as the no-nonce fallback path.
 * - frame-ancestors admits the create.xyz builder origins (the platform
 *   embeds the app in an iframe; cookies are SameSite=None for the same
 *   reason). Locking down to 'self' pre-GA: Technical Backlog #16.
 * - HSTS is sent unconditionally; browsers ignore it over plain http.
 */

/** @returns {string[]} configured create.xyz builder origins */
function createPlatformOrigins(env) {
  return [
    env.NEXT_PUBLIC_CREATE_BASE_URL,
    env.NEXT_PUBLIC_CREATE_HOST ? `https://${env.NEXT_PUBLIC_CREATE_HOST}` : null,
  ].filter(Boolean);
}

/**
 * Browser Sentry events post to the DSN's ingest host; without this
 * connect-src entry the CSP would silently drop them.
 * @returns {string | null}
 */
function sentryIngestOrigin(env) {
  if (!env.NEXT_PUBLIC_SENTRY_DSN) return null;
  try {
    return new URL(env.NEXT_PUBLIC_SENTRY_DSN).origin;
  } catch {
    return null;
  }
}

/**
 * @param {{ isDev?: boolean, env?: Record<string, string | undefined>, nonce?: string }} [options]
 * @returns {string} the Content-Security-Policy value
 */
function buildCsp({ isDev = false, env = process.env, nonce } = {}) {
  const frameAncestors = ["'self'", ...createPlatformOrigins(env)];
  const connect = ["'self'", ...createPlatformOrigins(env), sentryIngestOrigin(env)].filter(
    Boolean
  );
  // With a nonce, only nonce-carrying scripts run ('strict-dynamic' lets them
  // load Next's chunks). Without one (fallback path), the legacy inline
  // allowance applies. Dev needs eval for HMR either way.
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`
    : `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`;
  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    // Profile/gig media may be remote (base64 data URLs + https images today).
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}${isDev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors.join(' ')}`,
  ];
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/**
 * The non-CSP header set, applied globally via next.config.js. The CSP is
 * deliberately absent here: middleware emits it per-request with a fresh
 * nonce, and sending a second static CSP would enforce the intersection of
 * both policies and break the nonce.
 *
 * @param {{ isDev?: boolean, env?: Record<string, string | undefined> }} [options]
 * @returns {{ key: string, value: string }[]}
 */
function buildSecurityHeaders(_options = {}) {
  return [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(self), payment=()',
    },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
  ];
}

module.exports = { buildCsp, buildSecurityHeaders, createPlatformOrigins };
