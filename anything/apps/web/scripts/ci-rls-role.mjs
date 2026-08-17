#!/usr/bin/env node
/**
 * CI-only (S12): provisions the least-privilege `afterdark_app` role on the
 * alpha-gates job's throwaway Postgres so `yarn db:verify-rls` can prove the
 * RLS policies enforce on every PR. Production roles are created in the Neon
 * console per docs/rls-cutover.md — never by this script.
 *
 *   DATABASE_URL=<owner conn> RLS_ROLE_PASSWORD=<random> node scripts/ci-rls-role.mjs
 */

import ws from 'ws';
import { Pool, neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;
// Mirrors src/app/api/utils/neon-local.ts (this file can't import TS).
if (process.env.NEON_LOCAL_PROXY === '1') {
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.wsProxy = (host) => `${host}:4444/v2`;
}

const password = process.env.RLS_ROLE_PASSWORD;
if (!process.env.DATABASE_URL || !password) {
  console.error('Set DATABASE_URL (owner) and RLS_ROLE_PASSWORD.');
  process.exit(2);
}
// DDL takes no bind parameters; the password is CI-generated hex (openssl),
// but assert the charset anyway so nothing quotable can ever reach the string.
if (!/^[A-Za-z0-9]+$/.test(password)) {
  console.error('RLS_ROLE_PASSWORD must be alphanumeric (generate with `openssl rand -hex 24`).');
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app'");
  if (exists.rowCount === 0) {
    await client.query(`CREATE ROLE afterdark_app WITH LOGIN PASSWORD '${password}' NOBYPASSRLS`);
    console.log('✓ role afterdark_app created (LOGIN, NOBYPASSRLS)');
  } else {
    await client.query(`ALTER ROLE afterdark_app WITH LOGIN PASSWORD '${password}' NOBYPASSRLS`);
    console.log('✓ role afterdark_app already existed — password reset, NOBYPASSRLS re-asserted');
  }
} finally {
  client.release();
  process.exit(0);
}
