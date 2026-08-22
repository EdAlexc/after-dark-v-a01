/**
 * POST /api/conversations — the S19 venue-anchored inquiry path. The authZ
 * outcomes per actor ride the generated matrix suite; this file covers the
 * venue_id resolver semantics: PARTY private-party inquiries resolve the
 * counterpart server-side (user ids never ride the client), gig anchors
 * stay closed to PARTY, and venue↔venue threads stay impossible.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { POST as createConversation } from '../route';
import { getRateLimiter } from '@/app/api/utils/rate-limit';

const VENUE_PROFILE_ID = '4b4b1c2e-8f6a-4f7e-9d2a-1234567890ab';
const GIG_ID = '9c1d2e3f-4a5b-4c6d-8e7f-0123456789ab';
const SELF_ID = 'user-self';
const VENUE_OWNER_ID = 'user-venue-owner';

type Wire = {
  callerRole: 'TALENT' | 'VENUE' | 'PARTY';
  venueOwnerRows?: Array<{ user_id: string }>;
  counterpartRole?: string;
};

function wire({ callerRole, venueOwnerRows, counterpartRole = 'VENUE' }: Wire) {
  mocks.getSession.mockResolvedValue({
    user: { id: SELF_ID, email: 'self@example.com', name: 'Self' },
  });
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) return [{ role: callerRole }];
    if (text.includes('FROM gigs g')) return [{ user_id: VENUE_OWNER_ID }];
    if (text.includes('FROM venue_profiles')) {
      return venueOwnerRows ?? [{ user_id: VENUE_OWNER_ID }];
    }
    if (text.includes('SELECT id, role FROM "user"')) {
      return [{ id: VENUE_OWNER_ID, role: counterpartRole }];
    }
    if (text.includes('INSERT INTO conversations')) {
      return [{ id: 'conv-1', gig_id: null, kind: 'x', created_at: 'now' }];
    }
    if (text.includes('FROM conversations')) return [];
    return [];
  });
  (mocks.sql as unknown as { transaction: unknown }).transaction = async (
    queries: Promise<unknown>[]
  ) => Promise.all(queries);
}

function post(body: Record<string, unknown>): Request {
  return new Request('http://test.local/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.20' },
    body: JSON.stringify(body),
  });
}

/** The recorded INSERT INTO conversations call, as (text, params). */
function conversationInsert(): { text: string; params: unknown[] } | null {
  for (const call of mocks.sql.mock.calls) {
    const [first, ...params] = call as [unknown, ...unknown[]];
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('INSERT INTO conversations')) return { text, params };
  }
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  getRateLimiter('conversations-create', { windowMs: 60 * 60 * 1000, max: 30 }).reset();
});

describe('POST /api/conversations with a venue anchor (S19)', () => {
  it('PARTY + venue_id opens a PARTY_INQUIRY with the server-resolved venue user', async () => {
    wire({ callerRole: 'PARTY' });
    const res = await createConversation(post({ venue_id: VENUE_PROFILE_ID }), {});
    expect(res.status).toBe(201);
    const insert = conversationInsert();
    expect(insert).not.toBeNull();
    expect(insert!.params).toContain('PARTY_INQUIRY');
    expect(insert!.params).toContain(VENUE_OWNER_ID);
  });

  it('TALENT + venue_id opens a plain (GIG-kind) thread with the venue', async () => {
    wire({ callerRole: 'TALENT' });
    const res = await createConversation(post({ venue_id: VENUE_PROFILE_ID }), {});
    expect(res.status).toBe(201);
    expect(conversationInsert()!.params).toContain('GIG');
  });

  it('404s an unknown or unlisted venue without leaking anything else', async () => {
    wire({ callerRole: 'PARTY', venueOwnerRows: [] });
    const res = await createConversation(post({ venue_id: VENUE_PROFILE_ID }), {});
    expect(res.status).toBe(404);
    expect(conversationInsert()).toBeNull();
  });

  it('refuses a PARTY inquiry tied to a gig (read-only persona, §6.3)', async () => {
    wire({ callerRole: 'PARTY' });
    const res = await createConversation(
      post({ venue_id: VENUE_PROFILE_ID, gig_id: GIG_ID }),
      {}
    );
    expect(res.status).toBe(403);
    expect(conversationInsert()).toBeNull();
  });

  it('refuses venue↔venue threads (exactly one side must be the venue)', async () => {
    wire({ callerRole: 'VENUE', counterpartRole: 'VENUE' });
    const res = await createConversation(post({ venue_id: VENUE_PROFILE_ID }), {});
    expect(res.status).toBe(400);
    expect(conversationInsert()).toBeNull();
  });

  it('rejects a malformed venue_id at the schema layer', async () => {
    wire({ callerRole: 'PARTY' });
    const res = await createConversation(post({ venue_id: 'not-a-uuid' }), {});
    expect(res.status).toBe(400);
    expect(conversationInsert()).toBeNull();
  });
});
