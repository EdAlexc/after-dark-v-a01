/**
 * Media pipeline (P4, TENANT_GUARDRAIL §4.2 G11 + Backlog #10).
 *
 * Every user-supplied image passes through here before it is stored anywhere:
 *
 *  1. The data URL is parsed and its MIME allow-listed (magic-byte checked by
 *     sharp itself — a renamed .exe does not decode as an image).
 *  2. sharp re-encodes the pixels. Re-encoding is the EXIF strip: **no source
 *     metadata survives**, including GPS coordinates (location PII) — sharp
 *     omits metadata unless `.withMetadata()` is called, which we never do.
 *     `.rotate()` first bakes the EXIF orientation in so photos don't flip.
 *  3. Output is bounded (max edge, quality), which also caps stored bytes.
 *
 * Storage driver: Vercel Blob when BLOB_READ_WRITE_TOKEN is configured
 * (public, immutable, random-suffixed URLs); otherwise the processed image is
 * returned as a data URL — same shape the schema stored pre-P4, so the
 * fallback needs no schema change. Either way the bytes stored are the
 * *processed* ones, never the originals.
 *
 * S3 (Backlog #10 remainder): once Blob is keyed, the inline path is DEAD —
 * sanitizeMediaField re-homes even already-processed data URLs into Blob, the
 * CSP drops `data:`/broad `https:` from img-src (security-headers.js pins to
 * 'self' + blob: + the store's own host), and `yarn db:backfill-media` moves
 * the pre-existing rows. AV-scanning stance, documented not widened: images
 * are inert by construction — sharp re-encodes every pixel, so a payload
 * hiding in the container/metadata does not survive — and uploads stay
 * IMAGE-ONLY (no PDFs/documents anywhere, including message attachments)
 * until a real AV step exists.
 */

import { logger } from './logger';

const log = logger.child('media');

/** Raster formats we accept; everything else is rejected before decode. */
const ALLOWED_INPUT = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // pre-processing cap (5 MB)
export const MAX_EDGE_PX = 1600;

export interface ProcessedImage {
  bytes: Buffer;
  contentType: 'image/webp';
  width: number;
  height: number;
}

export class MediaError extends Error {}

/** Raised when the native image codec itself is unavailable (never a bad file). */
export class MediaUnavailableError extends MediaError {}

/**
 * sharp is loaded LAZILY — never at module scope.
 *
 * sharp is a native binding (libvips). When its platform binary fails to load,
 * a top-level `import sharp from 'sharp'` takes down EVERY route that imports
 * this file — and that crash happens at module init, before `withRoute` can
 * catch it, so it surfaces as an un-instrumented HTML 500 with no audit or
 * telemetry row.
 *
 * That is exactly what happened in production (2026-08-28): the traced Vercel
 * bundle shipped `@img/sharp-linux-x64` but not the `@img/sharp-libvips-*`
 * `.so` it dlopens, so `/api/settings`, `/api/talent/profile`,
 * `/api/venue/profile` and `/api/upload` all 500'd — including their
 * text-only GETs. Nobody could even LOAD a profile, let alone save one.
 *
 * Deferring the import keeps the blast radius to actual image work: text
 * fields save normally, and a broken codec degrades to one clear message.
 */
type SharpFactory = (typeof import('sharp'))['default'];
let sharpPromise: Promise<SharpFactory> | null = null;

export async function loadSharp(): Promise<SharpFactory> {
  // Hold the promise locally: the catch below clears the cached field, and
  // reading it again after that would narrow to null.
  const pending = (sharpPromise ??= import('sharp').then((mod) => mod.default));
  try {
    return await pending;
  } catch (error) {
    // Drop the rejected promise so a later request can retry (a cold start on
    // a healthy instance should not inherit this one's failure).
    sharpPromise = null;
    log.error('sharp failed to load — image processing unavailable', { error });
    throw new MediaUnavailableError(
      'Image processing is temporarily unavailable. Your other changes can still be saved — try again without a new photo.'
    );
  }
}

/** Parses a data URL into { mime, bytes }; throws MediaError on junk. */
export function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } {
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!match) throw new MediaError('Not a valid base64 data URL');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0) throw new MediaError('Empty file');
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new MediaError(`File too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`);
  }
  return { mime: match[1].toLowerCase(), bytes };
}

/**
 * Validate + strip + resize. The output is always webp (uniform, small, and
 * incapable of carrying the source's EXIF block).
 */
export async function processImage(dataUrl: string): Promise<ProcessedImage> {
  const { mime, bytes } = parseDataUrl(dataUrl);
  if (!ALLOWED_INPUT.has(mime)) {
    throw new MediaError(`Unsupported image type ${mime} (allowed: jpeg, png, webp, gif)`);
  }

  // Outside the try below: a codec that cannot load is an infrastructure
  // fault, and must not be reported as "your file is corrupt".
  const sharp = await loadSharp();

  let pipeline: Buffer;
  let meta: { width: number; height: number };
  try {
    const result = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate() // bake EXIF orientation in BEFORE the metadata is dropped
      .resize(MAX_EDGE_PX, MAX_EDGE_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    pipeline = result.data;
    meta = result.info;
  } catch (error) {
    // sharp rejects files whose magic bytes don't match a decodable image —
    // this is the real MIME enforcement, not the client-declared header.
    log.warn('image decode failed', { error });
    throw new MediaError('File is not a decodable image');
  }

  return { bytes: pipeline, contentType: 'image/webp', width: meta.width, height: meta.height };
}

/**
 * Stores processed bytes and returns a URL.
 * Blob driver when configured; data-URL fallback otherwise (documented in
 * DEV_TIMELINE — the fallback keeps dev/preview working with zero setup).
 */
export async function storeImage(
  image: ProcessedImage,
  purpose: string,
  ownerId: string
): Promise<{ url: string; storage: 'blob' | 'inline' }> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const key = `media/${purpose}/${ownerId}/${Date.now()}.webp`;
    const blob = await put(key, image.bytes, {
      access: 'public',
      contentType: image.contentType,
      addRandomSuffix: true,
    });
    return { url: blob.url, storage: 'blob' };
  }
  return {
    url: `data:${image.contentType};base64,${image.bytes.toString('base64')}`,
    storage: 'inline',
  };
}

/** True when the Blob driver is active (BLOB_READ_WRITE_TOKEN present). */
export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * The Blob store's public hostname, derived from the token
 * (`vercel_blob_rw_<storeId>_<secret>` → `<storeid>.public.blob.vercel-storage.com`).
 * Used to pin the CSP img-src to exactly our store (S3); null when the token
 * is absent or shaped unexpectedly (CSP then falls back to the
 * *.public.blob.vercel-storage.com wildcard — still no arbitrary https).
 */
export function blobHostname(token = process.env.BLOB_READ_WRITE_TOKEN): string | null {
  const match = /^vercel_blob_rw_([a-z0-9]+)_/i.exec(token ?? '');
  return match ? `${match[1].toLowerCase()}.public.blob.vercel-storage.com` : null;
}

/** True for values the pipeline has already produced (webp data URL or Blob URL). */
export function isProcessedMedia(value: string): boolean {
  return (
    value.startsWith('data:image/webp;base64,') ||
    /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(value)
  );
}

/**
 * Runs profile media fields through the pipeline at write time. Empty values
 * and plain https URLs (external portfolio links) pass through untouched;
 * raw base64 uploads get stripped/resized.
 *
 * Data-URL handling depends on the driver (S3): with Blob keyed, EVERY data
 * URL — even an already-processed webp a client echoes back from an earlier
 * save — is (re)processed and stored in Blob, so no new inline rows can ever
 * be written and the pinned CSP (no `data:` in img-src) stays truthful.
 * Without the token (dev fallback), processed values pass through as before.
 */
export async function sanitizeMediaField(
  value: string | undefined,
  purpose: string,
  ownerId: string
): Promise<string | undefined> {
  if (value === undefined || value === '' ) return value;
  if (!value.startsWith('data:')) return value; // https URL — nothing embedded to strip
  if (isProcessedMedia(value) && !blobConfigured()) return value;
  const processed = await processImage(value);
  const stored = await storeImage(processed, purpose, ownerId);
  return stored.url;
}
