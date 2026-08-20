/**
 * POST /api/rum (S18) — first-party Core Web Vitals ingest (Q5, G11-clean:
 * no third-party collector; the beacon never leaves this origin).
 *
 * Anonymous by design (vitals come from every visitor), which is why the
 * validation is strict and layered: zod strict schema (unknown keys
 * rejected), server-side path re-normalization (ids collapse to "[id]"),
 * a character allowlist on the final path, a 2 KB body cap, and an IP
 * rate limit. The insert runs under the SERVICE context — the 0022
 * policies accept no other writer.
 */

import { withRoute, ApiError } from '@/app/api/utils/route-kit';
import { parseBody } from '@/app/api/utils/validation';
import { RumBeaconSchema } from '@/app/api/utils/schemas';
import { captureRumEvent } from '@/app/api/utils/telemetry';
import { normalizeRumPath } from '@/lib/rum';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

// Generous on purpose: one NAT'd IP can front many real visitors, and every
// page load emits up to five metrics. Still a hard per-IP ceiling.
const rumLimiter = getRateLimiter('rum-ingest', { windowMs: 60_000, max: 240 });

export const POST = withRoute('rum.ingest', async (request) => {
	await enforceRateLimit(rumLimiter, clientKey(request));
	const beacon = await parseBody(request, RumBeaconSchema, { maxBytes: 2048 });

	const path = normalizeRumPath(beacon.path);
	if (!/^\/[a-zA-Z0-9/[\]\-_.]*$/.test(path)) {
		throw ApiError.badRequest('Malformed path');
	}

	await captureRumEvent({
		metric: beacon.metric,
		value: beacon.value,
		rating: beacon.rating,
		path,
	});
	// sendBeacon ignores responses; there is nothing to say.
	return new Response(null, { status: 204 });
});
