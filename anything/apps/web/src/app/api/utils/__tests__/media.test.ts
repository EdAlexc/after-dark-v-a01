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
