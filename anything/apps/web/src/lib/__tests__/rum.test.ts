/**
 * S18 — the shared RUM vocabulary: path normalization can never leak an id,
 * and the fallback rating matches the web.dev thresholds.
 */

import { describe, expect, it } from 'vitest';
import { normalizeRumPath, rateVital } from '../rum';

describe('normalizeRumPath', () => {
	it('collapses UUID segments to [id]', () => {
		expect(normalizeRumPath('/gigs/4b4b1c2e-8f6a-4f7e-9d2a-1234567890ab')).toBe('/gigs/[id]');
	});

	it('collapses long digit runs (sequential ids) to [id]', () => {
		expect(normalizeRumPath('/gigs/123456')).toBe('/gigs/[id]');
	});

	it('keeps short numeric-ish segments and normal routes intact', () => {
		expect(normalizeRumPath('/dashboard/talent/browse')).toBe('/dashboard/talent/browse');
		expect(normalizeRumPath('/legal/terms')).toBe('/legal/terms');
	});

	it('caps length and never returns empty', () => {
		expect(normalizeRumPath('')).toBe('/');
		expect(normalizeRumPath(`/${'a'.repeat(500)}`).length).toBeLessThanOrEqual(120);
	});
});

describe('rateVital', () => {
	it('applies the web.dev thresholds with boundaries counted as the better bucket', () => {
		expect(rateVital('LCP', 2500)).toBe('good');
		expect(rateVital('LCP', 2501)).toBe('needs-improvement');
		expect(rateVital('LCP', 4001)).toBe('poor');
		expect(rateVital('CLS', 0.05)).toBe('good');
		expect(rateVital('CLS', 0.2)).toBe('needs-improvement');
		expect(rateVital('CLS', 0.3)).toBe('poor');
		expect(rateVital('INP', 200)).toBe('good');
		expect(rateVital('INP', 600)).toBe('poor');
	});
});
