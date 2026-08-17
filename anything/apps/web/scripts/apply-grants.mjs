#!/usr/bin/env node
/**
 * Applies scripts/grants.sql — the complete, idempotent GRANT set for the
 * least-privilege `afterdark_app` role (docs/rls-cutover.md step 2).
 *
 *   DATABASE_URL=<OWNER connection> node scripts/apply-grants.mjs
 *
 * Must run as the table OWNER (only owners may GRANT). Fails loudly if the
 * role does not exist yet — create it first (Neon console → Roles).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ws from 'ws';
import { Pool, neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;
// S12: CI runs against a vanilla Postgres behind the local Neon proxy
// (mirrors src/app/api/utils/neon-local.ts — this file can't import TS).
if (process.env.NEON_LOCAL_PROXY === '1') {
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.wsProxy = (host) => `${host}:4444/v2`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (use the OWNER connection string).');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app'");
    if (role.rowCount === 0) {
      console.error(
        '✗ role afterdark_app does not exist on this database.\n' +
          '  Create it first (Neon console → Roles → New Role), then re-run.'
      );
      process.exit(1);
    }
    const sqlText = await readFile(path.join(__dirname, 'grants.sql'), 'utf8');
    await client.query('BEGIN');
    await client.query(sqlText);
    await client.query('COMMIT');
    console.log('✓ grants.sql applied — afterdark_app privileges re-asserted.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('✗ applying grants failed — rolled back:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
