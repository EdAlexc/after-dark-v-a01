const path = require('path');
const { buildSecurityHeaders } = require('./security-headers');
const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,

  // ─── sharp / libvips on Vercel ──────────────────────────────────────────
  // Dependencies hoist to `anything/node_modules`, one level ABOVE this app,
  // so tracing has to start at the workspace root or nothing outside
  // apps/web is even a candidate for the bundle.
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  // sharp resolves its platform package statically (traced fine) but then
  // **dlopens** libvips by path at runtime — an edge static analysis cannot
  // see. The deployed function therefore shipped @img/sharp-linux-x64 without
  // the libvips .so it needs, and every route importing api/utils/media
  // (settings, talent/venue profile, upload) died at module init with
  // `ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3`. Force-include the binaries.
  outputFileTracingIncludes: {
    '/api/**': ['../../node_modules/@img/**'],
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
