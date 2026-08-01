/**
 * Local Neon-protocol proxy support (P10.4).
 *
 * The whole stack speaks the Neon serverless protocol (`neon()` over HTTP in
 * sql.ts; `Pool` over WebSocket in auth.ts and scripts/migrate.mjs), which a
 * vanilla Postgres cannot answer. The CI alpha-gates job (and any keyless
 * local setup) therefore runs the standard sidecar recipe: a plain postgres
 * container fronted by ghcr.io/timowilhelm/local-neon-http-proxy, which
 * serves the SQL-over-HTTP endpoint on :4444/sql and the WebSocket tunnel on
 * :4444/v2.
 *
 * Opt-in ONLY via NEON_LOCAL_PROXY=1 — production/preview never set it, so
 * the driver keeps its default (TLS to *.neon.tech) everywhere real. The
 * DATABASE_URL host should resolve to the proxy (db.localtest.me → 127.0.0.1
 * in CI). Call this before constructing any client/Pool; neonConfig is a
 * process-wide singleton, so each DB entry point calls it defensively.
 */

import { neonConfig } from '@neondatabase/serverless';

export function configureNeonLocalProxy(): void {
  if (process.env.NEON_LOCAL_PROXY !== '1') return;
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.wsProxy = (host) => `${host}:4444/v2`;
}
