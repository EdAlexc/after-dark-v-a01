import { afterEach, describe, expect, it, vi } from 'vitest';

const put = vi.hoisted(() => vi.fn());
vi.mock('@vercel/blob', () => ({ put }));

import {
  blobConfigured,
  blobHostname,
  isProcessedMedia,
  parseDataUrl,
  processImage,
  sanitizeMediaField,
} from '../media';

/** 1×1 transparent PNG — a real decodable image for the pipeline. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

afterEach(() => {
  vi.unstubAllEnvs();
  put.mockReset();
});

describe('blobHostname (S3 CSP pin)', () => {
  it('derives the store host from the token, lowercased', () => {
    expect(blobHostname('vercel_blob_rw_Abc123XYZ_tail')).toBe(
      'abc123xyz.public.blob.vercel-storage.com'
    );
  });

  it('returns null for absent or unrecognizable tokens', () => {
    expect(blobHostname(undefined)).toBeNull();
    expect(blobHostname('')).toBeNull();
    expect(blobHostname('some-other-token')).toBeNull();
  });
});

describe('sanitizeMediaField inline-path removal (S3)', () => {
  it('without the token, an already-processed webp data URL passes through (dev fallback)', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    expect(blobConfigured()).toBe(false);
    const processed = await processImage(TINY_PNG);
    const webpDataUrl = `data:image/webp;base64,${processed.bytes.toString('base64')}`;
    expect(isProcessedMedia(webpDataUrl)).toBe(true);
    await expect(sanitizeMediaField(webpDataUrl, 'avatar', 'u1')).resolves.toBe(webpDataUrl);
  });

  it('with the token, even a processed webp data URL is re-homed into Blob', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_store1_secret');
    put.mockResolvedValue({
      url: 'https://store1.public.blob.vercel-storage.com/media/avatar/u1/x.webp',
    });
    const processed = await processImage(TINY_PNG);
    const webpDataUrl = `data:image/webp;base64,${processed.bytes.toString('base64')}`;

    const result = await sanitizeMediaField(webpDataUrl, 'avatar', 'u1');
    expect(result).toBe('https://store1.public.blob.vercel-storage.com/media/avatar/u1/x.webp');
    expect(put).toHaveBeenCalledOnce();
  });

  it('never re-uploads a value already living in Blob', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_store1_secret');
    const blobUrl = 'https://store1.public.blob.vercel-storage.com/media/avatar/u1/x.webp';
    await expect(sanitizeMediaField(blobUrl, 'avatar', 'u1')).resolves.toBe(blobUrl);
    expect(put).not.toHaveBeenCalled();
  });

  it('leaves empty and https pass-through semantics unchanged', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_store1_secret');
    await expect(sanitizeMediaField(undefined, 'avatar', 'u1')).resolves.toBeUndefined();
    await expect(sanitizeMediaField('', 'avatar', 'u1')).resolves.toBe('');
    await expect(
      sanitizeMediaField('https://example.com/pic.jpg', 'avatar', 'u1')
    ).resolves.toBe('https://example.com/pic.jpg');
  });
});

describe('parseDataUrl guardrails (unchanged by S3 — regression pin)', () => {
  it('rejects junk and empty payloads', () => {
    expect(() => parseDataUrl('not-a-data-url')).toThrow();
    expect(() => parseDataUrl('data:image/png;base64,')).toThrow();
  });
});

// ─── Native-codec isolation (prod incident 2026-08-28) ────────────────────────
//
// sharp's platform binary failed to load on Vercel (`ERR_DLOPEN_FAILED:
// libvips-cpp.so`). Because sharp was imported at MODULE SCOPE, every route
// importing this file — /api/settings, /api/talent/profile,
// /api/venue/profile, /api/upload — crashed at init, so even their text-only
// GETs returned an HTML 500 with no telemetry row. Nobody could load or save
// a profile at all. These pin the isolation that keeps that contained.

describe('sharp is isolated from module load (prod 500 regression)', () => {
  it('never imports sharp at module scope — only inside the codec path', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'src/app/api/utils/media.ts'), 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
      .replace(/^\s*\/\/.*$/gm, ''); // strip line comments
    expect(code).not.toMatch(/^\s*import\s+.*\bfrom\s+['"]sharp['"]/m);
    expect(code).toMatch(/import\(['"]sharp['"]\)/); // the lazy load survives
  });

  it('reports a codec outage as MediaUnavailableError, still a MediaError', async () => {
    const { MediaError, MediaUnavailableError } = await import('../media');
    const outage = new MediaUnavailableError('codec down');
    // Subclassing matters: every existing `catch (e instanceof MediaError)`
    // keeps degrading gracefully instead of falling through to a raw 500.
    expect(outage).toBeInstanceOf(MediaError);
    expect(outage.message).toContain('codec down');
  });

  it('still processes a real image once the codec loads', async () => {
    const { loadSharp } = await import('../media');
    await expect(loadSharp()).resolves.toBeTypeOf('function');
    const processed = await processImage(TINY_PNG);
    expect(processed.contentType).toBe('image/webp');
  });
});
