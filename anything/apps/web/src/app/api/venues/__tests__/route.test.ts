/**
 * Public venue directory + detail (S19). Public surface like /api/talent:
 * no session required, public columns only, invalid input rejected before
 * SQL, absent/unpublished venues answer 404 without leaking existence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { GET as listVenues } from '../route';
import { GET as venueDetail } from '../[id]/route';
import { VENUE_PAGE_SIZE } from '@/app/api/utils/venue-query';

const VENUE_ID = '4b4b1c2e-8f6a-4f7e-9d2a-1234567890ab';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockResolvedValue([]);
});

describe('GET /api/venues (public directory)', () => {
  it('serves without a session (public surface)', async () => {
    const res = await listVenues(new Request('http://test.local/api/venues'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ venues: [], page: 1, hasMore: false });
  });

  it('parameterizes SQLi payloads instead of interpolating them', async () => {
    const payload = "x'; DROP TABLE venue_profiles; --";
    const res = await listVenues(
      new Request(`http://test.local/api/venues?q=${encodeURIComponent(payload)}`),
      {}
    );
    expect(res.status).toBe(200);
    const [text, values] = mocks.sql.mock.calls[0] as [string, unknown[]];
    expect(text).not.toContain(payload);
    expect(values).toContain(`%${payload.toLowerCase()}%`);
  });

  it('rejects invalid filters with 400 before touching the database', async () => {
    const res = await listVenues(new Request('http://test.local/api/venues?page=0'), {});
    expect(res.status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('reports hasMore by trimming the sentinel row', async () => {
    const rows = Array.from({ length: VENUE_PAGE_SIZE + 1 }, (_, i) => ({
      id: `v-${i}`,
      venue_name: `Venue ${i}`,
    }));
    mocks.sql.mockResolvedValue(rows);
    const res = await listVenues(new Request('http://test.local/api/venues'), {});
    const body = await res.json();
    expect(body.hasMore).toBe(true);
    expect(body.venues).toHaveLength(VENUE_PAGE_SIZE);
  });
});

describe('GET /api/venues/[id] (public detail)', () => {
  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  it('serves a listed venue without a session', async () => {
    mocks.sql.mockResolvedValue([
      { id: VENUE_ID, venue_name: 'Nebula NYC', gigs_hosted: 3, open_gigs: 1 },
    ]);
    const res = await venueDetail(
      new Request(`http://test.local/api/venues/${VENUE_ID}`),
      context(VENUE_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.venue.venue_name).toBe('Nebula NYC');
  });

  it('never selects the owner user id (public projection)', async () => {
    mocks.sql.mockResolvedValue([{ id: VENUE_ID, venue_name: 'Nebula NYC' }]);
    await venueDetail(
      new Request(`http://test.local/api/venues/${VENUE_ID}`),
      context(VENUE_ID)
    );
    const [first] = mocks.sql.mock.calls[0] as [unknown];
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    expect(text).not.toContain('user_id');
    expect(text).toContain(`venue_name IS NOT NULL`);
  });

  it('rejects a non-uuid id with 404, before SQL', async () => {
    const res = await venueDetail(
      new Request('http://test.local/api/venues/not-a-uuid'),
      context('not-a-uuid')
    );
    expect(res.status).toBe(404);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('answers 404 for an absent or unpublished venue', async () => {
    mocks.sql.mockResolvedValue([]);
    const res = await venueDetail(
      new Request(`http://test.local/api/venues/${VENUE_ID}`),
      context(VENUE_ID)
    );
    expect(res.status).toBe(404);
  });

  it('derives response_rate through the S20 definer aggregate, not a bare join', async () => {
    mocks.sql.mockResolvedValue([{ id: VENUE_ID, venue_name: 'Nebula NYC' }]);
    await venueDetail(
      new Request(`http://test.local/api/venues/${VENUE_ID}`),
      context(VENUE_ID)
    );
    const [first] = mocks.sql.mock.calls[0] as [unknown];
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    // Cutover-safe: conversations/messages are participant-private, so the
    // rate must come from the 0024 SECURITY DEFINER function.
    expect(text).toContain('app_venue_response_stats');
    expect(text).toContain('AS response_rate');
  });

  it('serves the computed response_rate through to the JSON', async () => {
    mocks.sql.mockResolvedValue([
      { id: VENUE_ID, venue_name: 'Nebula NYC', response_rate: 88 },
    ]);
    const res = await venueDetail(
      new Request(`http://test.local/api/venues/${VENUE_ID}`),
      context(VENUE_ID)
    );
    expect(res.status).toBe(200);
    expect((await res.json()).venue.response_rate).toBe(88);
  });
});
