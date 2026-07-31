/**
 * /api/stream (S9) — per-connection auth, SSE shape, and the keys-only
 * emission contract (via the pure changedKeys mapping).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), sql: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { GET as streamGet } from '../route';
import { EMPTY_FINGERPRINT, changedKeys } from '@/app/api/utils/stream-keys';

const SESSION = { user: { id: 'u1', email: 'u1@example.com', name: 'U' } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(SESSION);
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) return [{ role: 'TALENT' }];
    return [{ notif: '5', msg: 'm-9', shift: 't-2' }];
  });
});

describe('GET /api/stream', () => {
  it('401 before any stream exists when signed out', async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await streamGet(new Request('http://t.local/api/stream'), {});
    expect(res.status).toBe(401);
  });

  it('403 for a suspended account — same guard as every other route', async () => {
    mocks.sql.mockImplementation(async (first: unknown) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      if (text.includes('SELECT role, suspended_at')) {
        return [{ role: 'TALENT', suspended_at: 'now', suspended_reason: 'x' }];
      }
      return [];
    });
    const res = await streamGet(new Request('http://t.local/api/stream'), {});
    expect(res.status).toBe(403);
  });

  it('answers with an SSE content type and anti-buffering headers', async () => {
    const res = await streamGet(new Request('http://t.local/api/stream'), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toContain('no-cache');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
  });

  it('opens with a hello frame (STREAM_MAX_MS=0 closes right after)', async () => {
    const res = await streamGet(new Request('http://t.local/api/stream'), {});
    const text = await res.text(); // stream closes because of the test env
    expect(text).toContain('event: hello');
  });
});

describe('changedKeys — the keys-only emission contract', () => {
  it('emits nothing when nothing changed', () => {
    const fp = { notif: '1', msg: 'a', shift: 'b' };
    expect(changedKeys(fp, { ...fp })).toEqual([]);
  });

  it('maps each fingerprint field to its query keys', () => {
    expect(changedKeys(EMPTY_FINGERPRINT, { notif: '2', msg: '', shift: '' })).toEqual([
      ['notifications'],
    ]);
    expect(changedKeys(EMPTY_FINGERPRINT, { notif: '', msg: 'm', shift: '' })).toEqual([
      ['conversations'],
      ['messages'],
    ]);
    expect(changedKeys(EMPTY_FINGERPRINT, { notif: '', msg: '', shift: 's' })).toEqual([
      ['talent-shifts'],
      ['venue-shifts'],
      ['venue-gigs'],
    ]);
  });

  it('emits only key arrays — no values, no row data anywhere in the payload', () => {
    const keys = changedKeys(EMPTY_FINGERPRINT, { notif: '9', msg: 'x', shift: 'y' });
    for (const key of keys) {
      expect(Array.isArray(key)).toBe(true);
      for (const part of key) expect(typeof part).toBe('string');
    }
  });
});
