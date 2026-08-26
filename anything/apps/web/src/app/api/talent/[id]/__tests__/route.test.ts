/**
 * Public talent detail (S20). Public surface like /api/venues/[id]: no
 * session required, public columns only, invalid input rejected before SQL,
 * absent/unlisted profiles answer 404 without leaking existence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { GET as talentDetail } from '../route';

const TALENT_ID = '4b4b1c2e-8f6a-4f7e-9d2a-1234567890ab';

const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockResolvedValue([]);
});

describe('GET /api/talent/[id] (public detail)', () => {
  it('serves a listed talent without a session', async () => {
    mocks.sql.mockResolvedValue([
      { id: TALENT_ID, stage_name: 'DJ Nova', primary_role: 'DJ', rating: '4.8' },
    ]);
    const res = await talentDetail(
      new Request(`http://test.local/api/talent/${TALENT_ID}`),
      context(TALENT_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.talent.stage_name).toBe('DJ Nova');
  });

  it('never selects the auth user id or email (public projection)', async () => {
    mocks.sql.mockResolvedValue([{ id: TALENT_ID, stage_name: 'DJ Nova' }]);
    await talentDetail(
      new Request(`http://test.local/api/talent/${TALENT_ID}`),
      context(TALENT_ID)
    );
    const [first] = mocks.sql.mock.calls[0] as [unknown];
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    expect(text).not.toContain('user_id');
    expect(text).not.toContain('email');
    expect(text).not.toContain('totp');
    // Only directory-listed profiles (the public-read predicate).
    expect(text).toContain('stage_name IS NOT NULL');
  });

  it('projects the public profile-editor surfaces: portfolio and socials', async () => {
    mocks.sql.mockResolvedValue([{ id: TALENT_ID, stage_name: 'DJ Nova' }]);
    await talentDetail(
      new Request(`http://test.local/api/talent/${TALENT_ID}`),
      context(TALENT_ID)
    );
    const [first] = mocks.sql.mock.calls[0] as [unknown];
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    expect(text).toContain('portfolio_images');
    expect(text).toContain('social_links');
  });

  it('rejects a non-uuid id with 404, before SQL', async () => {
    const res = await talentDetail(
      new Request('http://test.local/api/talent/not-a-uuid'),
      context('not-a-uuid')
    );
    expect(res.status).toBe(404);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('answers 404 for an absent or unlisted talent', async () => {
    mocks.sql.mockResolvedValue([]);
    const res = await talentDetail(
      new Request(`http://test.local/api/talent/${TALENT_ID}`),
      context(TALENT_ID)
    );
    expect(res.status).toBe(404);
  });
});
