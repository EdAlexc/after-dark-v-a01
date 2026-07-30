import { describe, expect, it } from 'vitest';
import {
  feeBreakdown,
  formatRate,
  formatTimeRange,
  gigHours,
  gigRate,
  gigUrgency,
} from '../gigs';

describe('gigRate / formatRate', () => {
  it('parses Neon NUMERIC strings', () => {
    expect(gigRate({ base_rate: '450' })).toBe(450);
    expect(gigRate({ base_rate: '75.50' })).toBe(75.5);
    expect(gigRate({ base_rate: 200 })).toBe(200);
  });

  it('returns null for unset or garbage rates', () => {
    expect(gigRate({ base_rate: null })).toBeNull();
    expect(gigRate({ base_rate: 'not-a-number' })).toBeNull();
  });

  it('formats with tips suffix', () => {
    expect(formatRate({ base_rate: '180', tips_included: false })).toBe('$180/hr');
    expect(formatRate({ base_rate: '65', tips_included: true })).toBe('$65/hr + tips');
    expect(formatRate({ base_rate: null, tips_included: false })).toBe('Rate TBD');
    expect(formatRate({ base_rate: '75.5', tips_included: false })).toBe('$75.50/hr');
  });
});

describe('formatTimeRange / gigHours', () => {
  it('handles missing ends gracefully', () => {
    expect(formatTimeRange(null, null)).toBeNull();
    expect(formatTimeRange('2026-08-01T22:00:00Z', null)).not.toBeNull();
    expect(formatTimeRange('garbage', null)).toBeNull();
  });

  it('computes fractional shift hours and rejects inverted ranges', () => {
    expect(gigHours('2026-08-01T22:00:00Z', '2026-08-02T04:00:00Z')).toBe(6);
    expect(gigHours('2026-08-01T22:00:00Z', '2026-08-01T23:30:00Z')).toBe(1.5);
    expect(gigHours('2026-08-02T04:00:00Z', '2026-08-01T22:00:00Z')).toBeNull();
    expect(gigHours(null, '2026-08-01T22:00:00Z')).toBeNull();
  });
});

describe('gigUrgency', () => {
  const now = new Date('2026-07-30T18:00:00Z');

  it('flags gigs starting within 24h as HOT', () => {
    expect(
      gigUrgency({ start_time: '2026-07-30T23:00:00Z', created_at: '2026-07-01T00:00:00Z' }, now)
    ).toBe('HOT');
  });

  it('does not flag past or far-future gigs as HOT', () => {
    expect(
      gigUrgency({ start_time: '2026-07-30T17:00:00Z', created_at: '2026-07-01T00:00:00Z' }, now)
    ).toBeNull();
    expect(
      gigUrgency({ start_time: '2026-08-15T23:00:00Z', created_at: '2026-07-01T00:00:00Z' }, now)
    ).toBeNull();
  });

  it('flags recently posted gigs as NEW', () => {
    expect(
      gigUrgency({ start_time: '2026-08-15T23:00:00Z', created_at: '2026-07-29T12:00:00Z' }, now)
    ).toBe('NEW');
  });

  it('prefers HOT over NEW', () => {
    expect(
      gigUrgency({ start_time: '2026-07-30T23:00:00Z', created_at: '2026-07-30T12:00:00Z' }, now)
    ).toBe('HOT');
  });
});

describe('feeBreakdown (5% marketplace fee, wireframe p4)', () => {
  it('computes gross, fee, and net', () => {
    const { gross, fee, net } = feeBreakdown(100, 6);
    expect(gross).toBe(600);
    expect(fee).toBe(30);
    expect(net).toBe(570);
  });

  it('keeps net + fee = gross (no money leaks)', () => {
    for (const [rate, hours] of [
      [87.5, 3.25],
      [45, 8],
      [0, 5],
    ]) {
      const { gross, fee, net } = feeBreakdown(rate, hours);
      expect(net + fee).toBeCloseTo(gross, 10);
      expect(fee).toBeCloseTo(gross * 0.05, 10);
    }
  });
});
