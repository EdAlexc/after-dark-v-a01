#!/usr/bin/env tsx
/**
 * S3 (Backlog #10 remainder): move every inline `data:` image row into Vercel
 * Blob, so the CSP can drop `data:` from img-src and the DB stops carrying
 * base64 blobs (the pre-P4 storage model, and the P4 fallback's output from
 * before the token was set).
 *
 *   DATABASE_URL=<owner> BLOB_READ_WRITE_TOKEN=<token> yarn db:backfill-media
 *   DATABASE_URL=<owner> yarn db:backfill-media --dry-run   # report only
 *   DATABASE_URL=<owner> yarn db:backfill-media --verify    # gate: zero data: rows
 *
 * Covered surfaces (everything the app ever wrote media into):
 * talent_profiles.avatar_url + portfolio_images[], venue_profiles.avatar_url
 * + gallery_images[], messages.attachment_url, "user".image.
 *
 * Every value re-rides the P4 pipeline (decode → EXIF/GPS strip → resize →
 * webp) rather than being copied verbatim — pre-P4 rows were stored
 * UNPROCESSED, so this backfill is also their overdue sanitization pass.
 * Idempotent: blob URLs and empty values are skipped; re-running converges.
 *
 * `--verify` exits non-zero while any `data:` row remains (the S3 security
 * gate), and lists external https rows (they stop rendering under the pinned
 * img-src) as warnings without failing.
 *
 * Run with the OWNER connection: it predates/bypasses request context by
 * design (system maintenance, like migrations).
 */

import sql from '../src/app/api/utils/sql';
import { processImage, storeImage } from '../src/app/api/utils/media';

const dryRun = process.argv.includes('--dry-run');
const verifyOnly = process.argv.includes('--verify');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. See .env.example.');
  process.exit(2);
}
if (!verifyOnly && !dryRun && !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    'BLOB_READ_WRITE_TOKEN is not set — there is nowhere to move the images to.\n' +
      'Connect the Blob store first (DEV_TIMELINE §4.6 step B5), or use --dry-run/--verify.'
  );
  process.exit(2);
}

interface Surface {
  label: string;
  table: string;
  idColumn: string;
  column: string;
  /** json array columns hold multiple images; text columns hold one. */
  kind: 'text' | 'json-array';
  purpose: string;
  ownerColumn: string;
}

const SURFACES: Surface[] = [
  { label: 'talent avatars', table: 'talent_profiles', idColumn: 'id', column: 'avatar_url', kind: 'text', purpose: 'avatar', ownerColumn: 'user_id' },
  { label: 'talent portfolios', table: 'talent_profiles', idColumn: 'id', column: 'portfolio_images', kind: 'json-array', purpose: 'portfolio', ownerColumn: 'user_id' },
  { label: 'venue avatars', table: 'venue_profiles', idColumn: 'id', column: 'avatar_url', kind: 'text', purpose: 'avatar', ownerColumn: 'user_id' },
  { label: 'venue galleries', table: 'venue_profiles', idColumn: 'id', column: 'gallery_images', kind: 'json-array', purpose: 'gallery', ownerColumn: 'user_id' },
  { label: 'message attachments', table: 'messages', idColumn: 'id', column: 'attachment_url', kind: 'text', purpose: 'attachment', ownerColumn: 'sender_id' },
  { label: 'account avatars', table: '"user"', idColumn: 'id', column: 'image', kind: 'text', purpose: 'avatar', ownerColumn: 'id' },
];

const isDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:');
const isExternalHttps = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^https:\/\//.test(value) &&
  !/^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(value);

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string' && value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function migrateValue(value: string, purpose: string, ownerId: string): Promise<string | null> {
  try {
    const processed = await processImage(value);
    const stored = await storeImage(processed, purpose, ownerId);
    return stored.url;
  } catch (error) {
    // Undecodable legacy junk: report it, leave the row for a human.
    console.warn(`  ⚠ skipped undecodable value (${(error as Error).message})`);
    return null;
  }
}

async function main() {
  let inlineRemaining = 0;
  let migrated = 0;
  let externalHttps = 0;
  let undecodable = 0;

  for (const surface of SURFACES) {
    const rows = (await sql(
      `SELECT ${surface.idColumn} AS id, ${surface.column} AS value, ${surface.ownerColumn} AS owner
       FROM ${surface.table}
       WHERE ${surface.column} IS NOT NULL`,
      []
    )) as Array<{ id: string; value: unknown; owner: string }>;

    for (const row of rows) {
      if (surface.kind === 'text') {
        const value = row.value;
        if (isExternalHttps(value)) {
          externalHttps += 1;
          console.warn(`  ⚠ ${surface.label} ${row.id}: external https URL (CSP-blocked once pinned)`);
          continue;
        }
        if (!isDataUrl(value)) continue;
        inlineRemaining += 1;
        if (verifyOnly || dryRun) continue;
        const url = await migrateValue(value, surface.purpose, row.owner);
        if (url === null) {
          undecodable += 1;
          continue;
        }
        await sql(
          `UPDATE ${surface.table} SET ${surface.column} = $1 WHERE ${surface.idColumn} = $2`,
          [url, row.id]
        );
        migrated += 1;
        inlineRemaining -= 1;
      } else {
        const images = parseArray(row.value);
        const inlineIdx = images
          .map((image, index) => (isDataUrl(image) ? index : -1))
          .filter((index) => index >= 0);
        externalHttps += images.filter(isExternalHttps).length;
        if (inlineIdx.length === 0) continue;
        inlineRemaining += inlineIdx.length;
        if (verifyOnly || dryRun) continue;
        const next = [...images];
        let changed = false;
        for (const index of inlineIdx) {
          const url = await migrateValue(next[index], surface.purpose, row.owner);
          if (url === null) {
            undecodable += 1;
            continue;
          }
          next[index] = url;
          migrated += 1;
          inlineRemaining -= 1;
          changed = true;
        }
        if (changed) {
          await sql(
            `UPDATE ${surface.table} SET ${surface.column} = $1 WHERE ${surface.idColumn} = $2`,
            [JSON.stringify(next), row.id]
          );
        }
      }
    }
    console.log(`✓ scanned ${surface.label} (${rows.length} rows)`);
  }

  console.log(
    `\n${verifyOnly ? 'VERIFY' : dryRun ? 'DRY RUN' : 'BACKFILL'}: ` +
      `migrated=${migrated} inline-remaining=${inlineRemaining} ` +
      `external-https=${externalHttps} undecodable=${undecodable}`
  );

  if (verifyOnly || dryRun) {
    if (inlineRemaining > 0) {
      console.error(`✗ ${inlineRemaining} inline data: value(s) remain — S3 gate not met.`);
      process.exit(1);
    }
    console.log('✓ zero data: rows remain — S3 gate met.');
    return;
  }
  if (inlineRemaining > 0 || undecodable > 0) {
    console.error('✗ some values could not be migrated — inspect the warnings above and re-run.');
    process.exit(1);
  }
  console.log('✓ backfill complete — re-run with --verify to assert the gate.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
