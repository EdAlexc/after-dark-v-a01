/**
 * Client upload door (P4 wiring fix) — the invariants that make "can't save
 * my photo" impossible to reintroduce silently: type/size validated BEFORE
 * any network call, server messages surfaced verbatim, stored URL returned.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_UPLOAD_BYTES, UploadError, uploadImageFile } from '../upload-client';

function fileOf(bytes: number, type = 'image/jpeg'): File {
  return new File([new Uint8Array(bytes)], 'photo.jpg', { type });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadImageFile', () => {
  it('rejects non-image files before any network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(uploadImageFile(fileOf(10, 'application/pdf'), 'avatar')).rejects.toThrow(
      UploadError
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects files over the promised 5MB before any network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(uploadImageFile(fileOf(MAX_UPLOAD_BYTES + 1), 'avatar')).rejects.toThrow(
      /5MB/
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs the data URL to /api/upload and resolves the stored URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://blob.example/processed.webp' }), {
        status: 201,
      })
    );
    vi.stubGlobal('fetch', fetchSpy);
    const url = await uploadImageFile(fileOf(64), 'portfolio');
    expect(url).toBe('https://blob.example/processed.webp');
    const [target, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('/api/upload');
    const body = JSON.parse(String(init.body)) as { dataUrl: string; purpose: string };
    expect(body.purpose).toBe('portfolio');
    expect(body.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it("surfaces the server's error message verbatim", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'unsupported or corrupt image' }), { status: 400 })
      )
    );
    await expect(uploadImageFile(fileOf(64), 'avatar')).rejects.toThrow(
      'unsupported or corrupt image'
    );
  });
});
