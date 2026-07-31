#!/usr/bin/env node
/**
 * Minimal forward-only SQL migration runner (CLAUDE.md §6.2 / DEV_TIMELINE P0.1).
 *
 *   DATABASE_URL=postgres://… node scripts/migrate.mjs [--dry-run]
 *
 * - applies migrations/NNNN_name.sql in order, each inside a transaction;
 * - records applied names in _migrations;
 * - idempotent: already-applied files are skipped.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ws from 'ws';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { selectPending } from './migrate-core.mjs';

neonConfig.webSocketConstructor = ws;
// P10.4: CI runs against a vanilla Postgres behind the local Neon proxy
// (mirrors src/app/api/utils/neon-local.ts — this file can't import TS).
if (process.env.NEON_LOCAL_PROXY === '1') {
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.wsProxy = (host) => `${host}:4444/v2`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const dryRun = process.argv.includes('--dry-run');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. See .env.example.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const available = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'));
    const appliedRows = await client.query('SELECT name FROM _migrations ORDER BY name');
    const applied = appliedRows.rows.map((row) => row.name);
    const pending = selectPending(available, applied);

    if (pending.length === 0) {
      console.log('✓ No pending migrations.');
      return;
    }
    if (dryRun) {
      console.log(`Pending (dry run):\n  ${pending.join('\n  ')}`);
      return;
    }

    for (const name of pending) {
      const sqlText = await readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
      console.log(`→ applying ${name}…`);
      try {
        await client.query('BEGIN');
        await client.query(sqlText);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log(`✓ ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`✗ ${name} failed — rolled back:`, error.message);
        process.exit(1);
      }
    }
    console.log(`✓ Applied ${pending.length} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration runner crashed:', error);
  process.exit(1);
});
