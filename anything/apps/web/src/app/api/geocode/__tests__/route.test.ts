/**
 * GET /api/geocode (S20 F6) — the create-gig wizard's live map preview.
 * AuthZ (VENUE-only) rides the generated matrix suite; this file covers the
 * short-address fast path (no geocoder call, no rate-limit spend) and the
 * pass-through of the geocoder's answer, null included.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sql: vi.fn(),
  geocodeAddress: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));
vi.mock('@/app/api/utils/geocode', () => ({ geocodeAddress: mocks.geocodeAddress }));

import { GET as geocodePreview } from '../route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';

const SESSION = { user: { id: 'venue-user', email: 'v@example.com', name: 'V' } };

function get(address?: string): Request {
  const url = new URL('http://test.local/api/geocode');
  if (address !== undefined) url.searchParams.set('address', address);
  return new Request(url, { headers: { 'x-forwarded-for': '198.51.100.9' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(SESSION);
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) return [{ role: 'VENUE' }];
    return [];
  });
  mocks.geocodeAddress.mockResolvedValue({ lat: 40.7128, lng: -74.006 });
  getRateLimiter('geocode-preview', { windowMs: 1, max: 1000 }).reset();
});

describe('GET /api/geocode', () => {
  it('geocodes a real address for a venue and returns the point', async () => {
    const res = await geocodePreview(get('225 Bowery, New York, NY'), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ point: { lat: 40.7128, lng: -74.006 } });
    expect(mocks.geocodeAddress).toHaveBeenCalledTimes(1);
    expect(mocks.geocodeAddress).toHaveBeenCalledWith('225 Bowery, New York, NY');
  });

  it('answers { point: null } below the 5-char floor without calling the geocoder', async () => {
    for (const address of ['abc', '  ab  ', '']) {
      const res = await geocodePreview(get(address), {});
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ point: null });
    }
    // A missing address (optional, defaults to '') takes the same fast path.
    const missing = await geocodePreview(get(), {});
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ point: null });
    expect(mocks.geocodeAddress).not.toHaveBeenCalled();
  });

  it('rides a geocoder miss through as { point: null }', async () => {
    mocks.geocodeAddress.mockResolvedValue(null);
    const res = await geocodePreview(get('somewhere that resolves to nothing'), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ point: null });
    expect(mocks.geocodeAddress).toHaveBeenCalledTimes(1);
  });

  it('never spends rate-limit allowance on the short-address fast path', async () => {
    // Far more short calls than the limiter's 15/min budget: all must pass.
    for (let i = 0; i < 40; i += 1) {
      const res = await geocodePreview(get('ab'), {});
      expect(res.status).toBe(200);
    }
    expect(mocks.geocodeAddress).not.toHaveBeenCalled();
    // The allowance is untouched: a real lookup still goes through afterwards.
    const real = await geocodePreview(get('225 Bowery, New York, NY'), {});
    expect(real.status).toBe(200);
    expect(await real.json()).toEqual({ point: { lat: 40.7128, lng: -74.006 } });
  });
});
