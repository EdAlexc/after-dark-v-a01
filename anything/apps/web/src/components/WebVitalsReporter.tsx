'use client';

/**
 * S18 (Q5) — first-party RUM: Core Web Vitals beaconed to /api/rum. G11
 * stance: same origin only, no third-party collector, no cookies read. The
 * payload carries a metric shape and a normalized route path — never an id
 * (the ingest route re-normalizes and validates again, defense in depth).
 * Production-only, like the service worker: dev vitals are HMR noise.
 */

import { useReportWebVitals } from 'next/web-vitals';
import { normalizeRumPath, rateVital, RUM_METRICS, type RumMetric } from '@/lib/rum';

export default function WebVitalsReporter() {
	useReportWebVitals((metric) => {
		if (process.env.NODE_ENV !== 'production') return;
		if (!(RUM_METRICS as readonly string[]).includes(metric.name)) return;
		const name = metric.name as RumMetric;
		const body = JSON.stringify({
			metric: name,
			value: metric.value,
			rating:
				(metric as { rating?: 'good' | 'needs-improvement' | 'poor' }).rating ??
				rateVital(name, metric.value),
			path: normalizeRumPath(window.location.pathname),
		});
		// sendBeacon survives page unload; keepalive fetch is the fallback.
		if (!navigator.sendBeacon?.('/api/rum', body)) {
			void fetch('/api/rum', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
				keepalive: true,
			}).catch(() => {
				// RUM is best-effort by definition.
			});
		}
	});
	return null;
}
