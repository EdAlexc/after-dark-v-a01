import { authGuard } from '@/app/api/utils/auth-guard';
import { parseQuery } from '@/app/api/utils/validation';
import { GeocodePreviewQuerySchema } from '@/app/api/utils/schemas';
import { withRoute } from '@/app/api/utils/route-kit';
import { geocodeAddress } from '@/app/api/utils/geocode';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

/**
 * GET /api/geocode?address=… (S20 F6) — the create-gig step-2 live map
 * preview. Same server-side geocoder the publish path uses (Nominatim
 * through the A10 safe-fetch guard — the browser never talks to the
 * geocoder, and the SSRF allowlist stays the only egress). VENUE-gated and
 * deliberately tight-rate-limited: the client debounces (800 ms) and the
 * server caps at 15/min per user so wizard typing stays far inside
 * Nominatim's usage policy. Addresses shorter than the geocoder's own
 * 5-char floor answer { point: null } with no network call at all.
 *
 * Nothing is persisted here — publish still geocodes authoritatively
 * server-side; a preview pin is never trusted as the gig's coordinates.
 */
const previewLimiter = getRateLimiter('geocode-preview', { windowMs: 60 * 1000, max: 15 });

export const GET = withRoute('geocode.preview', async (request) => {
  const user = await authGuard.requireRole('VENUE');
  const { address } = parseQuery(request.url, GeocodePreviewQuerySchema);

  if (address.trim().length < 5) return Response.json({ point: null });

  await enforceRateLimit(previewLimiter, clientKey(request, user.id));
  const point = await geocodeAddress(address);
  return Response.json({ point });
});
