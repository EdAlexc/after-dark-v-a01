/**
 * S18 — shared RUM vocabulary for the client reporter and the ingest route.
 * Lives in lib/ (not api/utils/) because the client component imports it too.
 */

export const RUM_METRICS = ['LCP', 'CLS', 'INP', 'FCP', 'TTFB'] as const;
export type RumMetric = (typeof RUM_METRICS)[number];
export type RumRating = 'good' | 'needs-improvement' | 'poor';

/** web-vitals "good"/"poor" thresholds (web.dev/vitals) — fallback when the
 *  browser payload carries no rating. */
const THRESHOLDS: Record<RumMetric, [good: number, poor: number]> = {
	LCP: [2500, 4000],
	CLS: [0.1, 0.25],
	INP: [200, 500],
	FCP: [1800, 3000],
	TTFB: [800, 1800],
};

export function rateVital(metric: RumMetric, value: number): RumRating {
	const [good, poor] = THRESHOLDS[metric];
	return value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor';
}

/**
 * Collapse volatile URL segments to route shapes so a beacon path can never
 * carry an identifier: UUIDs and long digit runs become "[id]". Applied on
 * BOTH sides (client before send, server before insert) — defense in depth.
 */
export function normalizeRumPath(pathname: string): string {
	const collapsed = pathname
		.split('/')
		.map((segment) =>
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
			/^\d{4,}$/.test(segment)
				? '[id]'
				: segment
		)
		.join('/');
	return (collapsed || '/').slice(0, 120);
}
