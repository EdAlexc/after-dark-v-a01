/**
 * Security headers for every response (TENANT_GUARDRAIL §5 A05).
 *
 * Plain CJS so next.config.js can require() it and vitest can import it.
 *
 * Notes:
 * - CSP allows 'unsafe-inline' scripts for now (Next.js inline runtime);
 *   the nonce-based upgrade is tracked in DEV_TIMELINE → Technical Backlog.
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
 * @param {{ isDev?: boolean, env?: Record<string, string | undefined> }} [options]
 * @returns {string} the Content-Security-Policy value
 */
function buildCsp({ isDev = false, env = process.env } = {}) {
  const frameAncestors = ["'self'", ...createPlatformOrigins(env)];
  const connect = ["'self'", ...createPlatformOrigins(env)];
  const directives = [
    "default-src 'self'",
    // Next.js emits inline bootstrap scripts; dev mode needs eval for HMR.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
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
 * @param {{ isDev?: boolean, env?: Record<string, string | undefined> }} [options]
 * @returns {{ key: string, value: string }[]}
 */
function buildSecurityHeaders(options = {}) {
  return [
    { key: 'Content-Security-Policy', value: buildCsp(options) },
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
