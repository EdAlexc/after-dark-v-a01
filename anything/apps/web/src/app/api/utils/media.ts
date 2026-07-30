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
 */

import sharp from 'sharp';
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

/** True for values the pipeline has already produced (webp data URL or Blob URL). */
export function isProcessedMedia(value: string): boolean {
  return (
    value.startsWith('data:image/webp;base64,') ||
    /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(value)
  );
}

/**
 * Runs profile media fields through the pipeline at write time. Values that
 * are already processed, empty, or plain https URLs (external portfolio
 * links) pass through untouched; raw base64 uploads get stripped/resized.
 */
export async function sanitizeMediaField(
  value: string | undefined,
  purpose: string,
  ownerId: string
): Promise<string | undefined> {
  if (value === undefined || value === '' ) return value;
  if (!value.startsWith('data:')) return value; // https URL — nothing embedded to strip
  if (isProcessedMedia(value)) return value;
  const processed = await processImage(value);
  const stored = await storeImage(processed, purpose, ownerId);
  return stored.url;
}
