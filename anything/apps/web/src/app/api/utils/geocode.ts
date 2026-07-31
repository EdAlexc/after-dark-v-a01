/**
 * Server-side geocoding (S10) — Nominatim/OSM, keyless by design (the S10
 * brief: MapLibre + OSM tiles to avoid key management). The address is
 * user-influenced input, so every request goes through the A10 SSRF guard
 * (safe-fetch.ts): allowlisted host, public-address check, no redirects,
 * bounded time and size.
 *
 * Geocoding NEVER fails the caller: a gig without coordinates simply has no
 * pin. Nominatim's usage policy requires an identifying User-Agent and
 * modest volume — one lookup per gig publish is well inside it.
 */

import { safeFetch } from './safe-fetch';
import { logger } from './logger';

const log = logger.child('geocode');

export const GEOCODER_HOST = 'nominatim.openstreetmap.org';

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Parse Nominatim's JSON answer into a validated point (exported for tests). */
export function parseGeocodeResponse(body: string): GeoPoint | null {
  try {
    const rows = JSON.parse(body) as Array<{ lat?: string; lon?: string }>;
    const first = Array.isArray(rows) ? rows[0] : null;
    if (!first?.lat || !first?.lon) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/** Best-effort address → point; null on any failure. */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const query = address.trim();
  if (query.length < 5) return null;
  try {
    const url =
      `https://${GEOCODER_HOST}/search?format=json&limit=1&countrycodes=us` +
      `&q=${encodeURIComponent(query)}`;
    const body = await safeFetch(url, {
      allowedHosts: [GEOCODER_HOST],
      timeoutMs: 3_000,
      maxResponseBytes: 100_000,
      headers: {
        // Nominatim policy: identify the application.
        'User-Agent': 'AfterDark-Marketplace/alpha (gig geocoding)',
        Accept: 'application/json',
      },
    });
    return parseGeocodeResponse(body);
  } catch (error) {
    log.warn('geocode failed — gig will have no pin', { error });
    return null;
  }
}
