/**
 * S6 event capture — track() must never break the triggering request, must
 * carry the RLS context, and must keep PII out of payloads.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => {
  const fn = mocks.sql as unknown as Record<string, unknown>;
  fn.transaction = async (queries: Promise<unknown>[]) => Promise.all(queries);
  return { default: mocks.sql };
});

import { track } from '../events';

const ACTOR = { id: 'user-1', role: 'VENUE' };

function executed(): string[] {
  return mocks.sql.mock.calls.map(([first]) =>
    Array.isArray(first) ? (first as string[]).join('') : String(first)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockResolvedValue([]);
});

describe('track', () => {
  it('appends the event with kind, tenant, and gig dimensions', async () => {
    const ok = await track(ACTOR, 'gig.published', {
      venueId: 'vp-1',
      gigId: 'g-1',
      payload: { role: 'DJ' },
    });
    expect(ok).toBe(true);
    const insert = executed().find((text) => text.includes('INSERT INTO events'));
    expect(insert).toBeTruthy();
  });

  it('sets the RLS request context (insert runs inside the context transaction)', async () => {
    await track(ACTOR, 'gig.filled', { venueId: 'vp-1', gigId: 'g-1' });
    expect(executed().some((text) => text.includes('set_config'))).toBe(true);
  });

  it('NEVER throws when the insert fails — analytics cannot break the action', async () => {
    mocks.sql.mockRejectedValue(new Error('db down'));
    await expect(
      track(ACTOR, 'application.created', { venueId: 'vp-1' })
    ).resolves.toBe(false);
  });

  it('redacts PII-shaped payload keys as defense in depth', async () => {
    let payloadParam: string | undefined;
    mocks.sql.mockImplementation(async (first: unknown, ...rest: unknown[]) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      if (text.includes('INSERT INTO events')) {
        payloadParam = rest.find((value) => typeof value === 'string' && value.startsWith('{')) as
          | string
          | undefined;
      }
      return [];
    });
    await track(ACTOR, 'application.created', {
      venueId: 'vp-1',
      payload: { email: 'leak@example.com', role: 'DJ' },
    });
    expect(payloadParam).toBeTruthy();
    expect(payloadParam).not.toContain('leak@example.com');
    expect(payloadParam).toContain('DJ');
  });
});
