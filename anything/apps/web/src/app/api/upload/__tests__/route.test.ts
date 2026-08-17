import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/upload (P4) — S14. The single door for user media had no route suite
 * (§7.2 Q8): authN, schema rejection, MediaError→400 mapping, and the
 * success shape are pinned here (the pipeline itself is covered in
 * utils/__tests__/media.test.ts).
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sql: vi.fn(),
  processImage: vi.fn(),
  storeImage: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));
vi.mock('@/app/api/utils/media', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/app/api/utils/media')>();
  return {
    ...original,
    processImage: mocks.processImage,
    storeImage: mocks.storeImage,
  };
});

import { POST } from '../route';
import { MediaError } from '@/app/api/utils/media';
import { getRateLimiter } from '@/app/api/utils/rate-limit';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

function uploadRequest(body: unknown): Request {
  return new Request('http://test.local/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getRateLimiter('media-upload', { windowMs: 1, max: 1 }).reset();
  mocks.getSession.mockResolvedValue({ user: { id: 'u1', email: 'u@x.com' } });
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    return text.includes('SELECT role, suspended_at') ? [{ role: 'TALENT' }] : [];
  });
  mocks.processImage.mockResolvedValue({ dataUrl: 'data:image/webp;base64,AA==', width: 10, height: 10 });
  mocks.storeImage.mockResolvedValue({ url: 'https://blob.test/img.webp', storage: 'blob' });
});

describe('POST /api/upload', () => {
  it('401 for anonymous callers', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(uploadRequest({ dataUrl: PNG_DATA_URL, purpose: 'avatar' }), {})).status).toBe(401);
  });

  it('rejects a body without a data URL before touching the pipeline', async () => {
    const res = await POST(uploadRequest({ purpose: 'avatar' }), {});
    expect(res.status).toBe(400);
    expect(mocks.processImage).not.toHaveBeenCalled();
  });

  it('maps MediaError to a clean 400 (bad bytes are a caller problem, not a 500)', async () => {
    mocks.processImage.mockRejectedValue(new MediaError('Unsupported image type'));
    const res = await POST(uploadRequest({ dataUrl: PNG_DATA_URL, purpose: 'avatar' }), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unsupported image type');
  });

  it('201 with the processed URL + storage mode on success', async () => {
    const res = await POST(uploadRequest({ dataUrl: PNG_DATA_URL, purpose: 'avatar' }), {});
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ url: 'https://blob.test/img.webp', storage: 'blob', width: 10, height: 10 });
  });
});
