const { buildSecurityHeaders } = require('./security-headers');
const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,

  // ─── sharp / libvips on Vercel ──────────────────────────────────────────
  // sharp resolves its platform package statically (traced fine) but then
  // **dlopens** libvips by path at runtime — an edge static analysis cannot
  // see. The deployed function therefore shipped @img/sharp-linux-x64 without
  // the libvips .so it needs, and every route importing api/utils/media
  // (settings, talent/venue profile, upload) died at module init with
  // `ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3`.
  //
  // Scope this TIGHTLY to the deploy target's own package. A `@img/**` glob
  // drags in every platform variant (darwin, musl, wasm, arm64) and the
  // deploy step then fails outright on function size — and do NOT override
  // outputFileTracingRoot: Next already infers the workspace root from the
  // yarn.lock at `anything/`, and forcing it pulled the whole monorepo
  // (including the unused Expo workspace) into the bundle.
  outputFileTracingIncludes: {
    '/api/**': [
      '../../node_modules/@img/sharp-libvips-linux-x64/**',
      '../../node_modules/@img/sharp-linux-x64/**',
    ],
  },
  env: {
    NEXT_PUBLIC_CREATE_BASE_URL: process.env.NEXT_PUBLIC_CREATE_BASE_URL,
    NEXT_PUBLIC_CREATE_HOST: process.env.NEXT_PUBLIC_CREATE_HOST,
    NEXT_PUBLIC_PROJECT_GROUP_ID: process.env.NEXT_PUBLIC_PROJECT_GROUP_ID,
  },
  serverExternalPackages: [
    '@neondatabase/serverless',
    'ws',
    '@better-auth/kysely-adapter',
    'kysely',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders({ isDev: process.env.NODE_ENV !== 'production' }),
      },
    ];
  },
  rewrites() {
    return [
    ];
  },
};

// S18: source-map upload for readable Sentry stacks. Keyed on the upload
// token so unkeyed builds (CI, local, forks) stay byte-identical — the
// runtime SDK itself is separately keyed on the DSN (src/instrumentation*).
module.exports = process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      telemetry: false,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig;
