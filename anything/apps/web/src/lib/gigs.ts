/**
 * Shared client-side types + pure helpers for gig data coming off the API
 * (P1). Neon returns NUMERIC as strings and timestamps as ISO strings —
 * everything here normalizes that once so pages don't re-roll it.
 */

export interface ApiGig {
  id: string;
  venue_id: string;
  title: string;
  role_needed: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  base_rate: string | number | null;
  tips_included: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'FILLED' | 'COMPLETED' | 'CANCELLED';
  created_at: string;
  // Joined venue card fields (public listing / detail).
  venue_name?: string | null;
  venue_neighborhood?: string | null;
  address?: string | null;
  venue_avatar_url?: string | null;
  venue_rating?: string | number | null;
}

export interface GigListResponse {
  gigs: ApiGig[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export const MARKETPLACE_FEE_PCT = 5;

/** Numeric rate in dollars, or null when unset/unparseable. */
export function gigRate(gig: Pick<ApiGig, 'base_rate'>): number | null {
  if (gig.base_rate === null || gig.base_rate === undefined) return null;
  const value = Number(gig.base_rate);
  return Number.isFinite(value) ? value : null;
}

/** "$180/hr" (+ " + tips" when tips_included). */
export function formatRate(gig: Pick<ApiGig, 'base_rate' | 'tips_included'>): string {
  const value = gigRate(gig);
  if (value === null) return 'Rate TBD';
  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
  return `$${rounded}/hr${gig.tips_included ? ' + tips' : ''}`;
}

/** "10:00 PM" in the viewer's locale, or null for undated gigs. */
export function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Sat, Jul 19" in the viewer's locale, or null for undated gigs. */
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "10:00 PM – 3:00 AM" (whatever ends exist). */
export function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined
): string | null {
  const from = formatTime(start);
  const to = formatTime(end);
  if (from && to) return `${from} – ${to}`;
  return from ?? to;
}

export type GigUrgency = 'HOT' | 'NEW' | null;

/**
 * Derived listing badge: HOT when the gig starts within the next 24h
 * (tonight-ish), NEW when it was posted in the last 48h. Pure so it's
 * testable with a fixed `now`.
 */
export function gigUrgency(
  gig: Pick<ApiGig, 'start_time' | 'created_at'>,
  now: Date = new Date()
): GigUrgency {
  if (gig.start_time) {
    const start = new Date(gig.start_time).getTime();
    const delta = start - now.getTime();
    if (delta > 0 && delta <= 24 * 3600 * 1000) return 'HOT';
  }
  if (gig.created_at) {
    const created = new Date(gig.created_at).getTime();
    if (now.getTime() - created <= 48 * 3600 * 1000) return 'NEW';
  }
  return null;
}

/** 5% marketplace fee math for the apply panel estimator (wireframe p4). */
export function feeBreakdown(hourlyRate: number, hours: number) {
  const gross = hourlyRate * hours;
  const fee = gross * (MARKETPLACE_FEE_PCT / 100);
  return { gross, fee, net: gross - fee };
}

/** Hours between start and end (fractional), or null when undated. */
export function gigHours(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms / 3600_000;
}
