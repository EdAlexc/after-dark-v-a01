/** S10 geocoder — guarded fetch, tolerant parsing, never fails the caller. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock('../safe-fetch', () => ({ safeFetch: mocks.safeFetch }));

import { GEOCODER_HOST, geocodeAddress, parseGeocodeResponse } from '../geocode';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.safeFetch.mockResolvedValue(JSON.stringify([{ lat: '40.7412', lon: '-73.9897' }]));
});

describe('parseGeocodeResponse', () => {
  it('parses a valid answer into a bounded point', () => {
    expect(parseGeocodeResponse('[{"lat":"40.74","lon":"-73.98"}]')).toEqual({
      lat: 40.74,
      lng: -73.98,
    });
  });

  it('rejects malformed JSON, empty results, and out-of-range coordinates', () => {
    expect(parseGeocodeResponse('not json')).toBeNull();
    expect(parseGeocodeResponse('[]')).toBeNull();
    expect(parseGeocodeResponse('[{"lat":"91","lon":"0"}]')).toBeNull();
    expect(parseGeocodeResponse('[{"lat":"0","lon":"181"}]')).toBeNull();
    expect(parseGeocodeResponse('[{"lat":"abc","lon":"1"}]')).toBeNull();
  });
});

describe('geocodeAddress', () => {
  it('goes through the SSRF guard with only the geocoder host allowlisted', async () => {
    await geocodeAddress('353 W 14th St, New York');
    const [url, options] = mocks.safeFetch.mock.calls[0];
    expect(String(url)).toContain(GEOCODER_HOST);
    expect(options.allowedHosts).toEqual([GEOCODER_HOST]);
    expect(options.timeoutMs).toBeLessThanOrEqual(5000);
  });

  it('URL-encodes the address — user input cannot smuggle params', async () => {
    await geocodeAddress('x & y ?limit=99#frag, NYC');
    const [url] = mocks.safeFetch.mock.calls[0];
    expect(String(url)).not.toContain('#frag');
    expect(String(url)).toContain(encodeURIComponent('x & y ?limit=99#frag, NYC'));
  });

  it('returns null (never throws) when the guard or upstream fails', async () => {
    mocks.safeFetch.mockRejectedValue(new Error('blocked'));
    await expect(geocodeAddress('353 W 14th St')).resolves.toBeNull();
  });

  it('skips lookups for junk-short addresses', async () => {
    await expect(geocodeAddress('  x ')).resolves.toBeNull();
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });
});
