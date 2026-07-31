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
 * - Embed lockdown (S1, Backlog #16): frame-ancestors is 'self' by default —
 *   the create.xyz builder origins are only admitted when
 *   CREATE_BUILDER_EMBED=1 opts back in (src/lib/auth.ts relaxes cookie
 *   SameSite under the same flag; the two must move together or the embed
 *   half-works).
 * - HSTS is sent unconditionally; browsers ignore it over plain http.
 */

/**
 * create.xyz builder origins — admitted only under the explicit embed opt-in
 * (off by default since S1; the builder pathway is dead weight for the
 * deployed product).
 * @returns {string[]}
 */
function createPlatformOrigins(env) {
  if (!['1', 'true'].includes(env.CREATE_BUILDER_EMBED ?? '')) return [];
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
 * The S10 map's tile origin (MapLibre + OSM raster, keyless by design).
 * MapLibre fetches tiles via XHR into textures, so the origin must appear
 * in connect-src as well as img-src.
 */
const MAP_TILE_ORIGIN = 'https://tile.openstreetmap.org';

/**
 * img-src, pinned when the Blob store is keyed (S3, Backlog #10 / G11):
 * exactly our store's host (derived from the token — CJS twin of
 * media.ts#blobHostname), no `data:` (the inline write path is dead with the
 * token set and the backfill moved old rows), no broad `https:` (third-party
 * image loads were the G11 egress finding). Without the token, the dev/preview
 * fallback keeps the historic permissive list so inline-stored images render.
 * @returns {string}
 */
function imgSrc(env) {
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token) return `img-src 'self' data: blob: https:`;
  const match = /^vercel_blob_rw_([a-z0-9]+)_/i.exec(token);
  const host = match
    ? `https://${match[1].toLowerCase()}.public.blob.vercel-storage.com`
    : 'https://*.public.blob.vercel-storage.com';
  // The pin stays exact: our Blob store + the map tile origin, nothing else.
  return `img-src 'self' blob: ${host} ${MAP_TILE_ORIGIN}`;
}

/**
 * @param {{ isDev?: boolean, env?: Record<string, string | undefined>, nonce?: string }} [options]
 * @returns {string} the Content-Security-Policy value
 */
function buildCsp({ isDev = false, env = process.env, nonce } = {}) {
  const frameAncestors = ["'self'", ...createPlatformOrigins(env)];
  const connect = [
    "'self'",
    ...createPlatformOrigins(env),
    sentryIngestOrigin(env),
    MAP_TILE_ORIGIN, // S10 — MapLibre XHRs raster tiles
  ].filter(Boolean);
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
    imgSrc(env),
    "font-src 'self' data:",
    // The service worker (public/sw.js, P10.2) plus MapLibre's blob: worker
    // (S10 — it inlines its tile-decoding worker via createObjectURL).
    // Explicit because 'strict-dynamic' in script-src ignores host sources.
    "worker-src 'self' blob:",
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
