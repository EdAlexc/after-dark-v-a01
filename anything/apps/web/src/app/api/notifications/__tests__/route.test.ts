/**
 * /api/notifications — GET pagination (S20 F5 ?page= + sentinel row) and the
 * POST mark-read scoping. Self-scoped by construction: every query is keyed
 * on the session user; there is no id parameter that could reach another
 * user's feed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), sql: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => {
  const fn = mocks.sql as unknown as Record<string, unknown>;
  // Neon's transaction API (used via withRlsContext, S2): array of
  // already-pending queries → array of results.
  fn.transaction = async (queries: Promise<unknown>[]) => Promise.all(queries);
  return { default: mocks.sql };
});

import { GET as listNotifications, POST as markRead } from '../route';

const USER_ID = 'user-1';
const SESSION = { user: { id: USER_ID, email: 'u@example.com', name: 'U' } };

function wire({
  rows = [] as Array<Record<string, unknown>>,
  unreadCount = 0,
} = {}) {
  mocks.sql.mockImplementation(async (first: unknown) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) return [{ role: 'TALENT' }];
    if (text.includes('COUNT(*)::int AS count')) return [{ count: unreadCount }];
    if (text.includes('FROM notifications')) return rows;
    return [];
  });
}

/** All recorded sql calls as (text, params) pairs. */
function calls(): Array<{ text: string; params: unknown[] }> {
  return mocks.sql.mock.calls.map((call) => {
    const [first, ...params] = call as [unknown, ...unknown[]];
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    return { text, params };
  });
}

function notificationRows(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    kind: 'application.update',
    payload: {},
    read_at: null,
    created_at: `2026-08-0${(i % 9) + 1}`,
  }));
}

function get(query = ''): Request {
  return new Request(`http://test.local/api/notifications${query}`);
}

function post(body: unknown): Request {
  return new Request('http://test.local/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(SESSION);
});

describe('GET /api/notifications (paged, S20)', () => {
  it('reads page 1 with the LIMIT 31 sentinel: 31 rows → 30 served + hasMore', async () => {
    wire({ rows: notificationRows(31), unreadCount: 5 });
    const res = await listNotifications(get(), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(30);
    expect(body.hasMore).toBe(true);
    expect(body.page).toBe(1);
    expect(body.unreadCount).toBe(5);

    const listCall = calls().find(
      (call) => call.text.includes('FROM notifications') && call.text.includes('ORDER BY')
    );
    expect(listCall).toBeDefined();
    // Sentinel LIMIT (page size + 1), OFFSET 0, and the session-user scope
    // all ride as parameters.
    expect(listCall!.params).toEqual([USER_ID, 31, 0]);
  });

  it('walks to page 2 via OFFSET 30 and echoes the page back', async () => {
    wire({ rows: notificationRows(4) });
    const res = await listNotifications(get('?page=2'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.hasMore).toBe(false);

    const listCall = calls().find(
      (call) => call.text.includes('FROM notifications') && call.text.includes('ORDER BY')
    );
    expect(listCall!.params).toEqual([USER_ID, 31, 30]);
  });

  it('reports hasMore false and serves every row when the page is not full', async () => {
    wire({ rows: notificationRows(30), unreadCount: 0 });
    const res = await listNotifications(get(), {});
    const body = await res.json();
    expect(body.notifications).toHaveLength(30);
    expect(body.hasMore).toBe(false);

    wire({ rows: notificationRows(3) });
    const small = await (await listNotifications(get(), {})).json();
    expect(small.notifications).toHaveLength(3);
    expect(small.hasMore).toBe(false);
  });

  it('rejects out-of-range or non-numeric pages with 400, before the feed query', async () => {
    for (const page of ['0', 'x', '501']) {
      vi.clearAllMocks();
      mocks.getSession.mockResolvedValue(SESSION);
      wire();
      const res = await listNotifications(get(`?page=${page}`), {});
      expect(res.status).toBe(400);
      expect(calls().some((call) => call.text.includes('FROM notifications'))).toBe(false);
    }
  });
});

describe('POST /api/notifications (mark read)', () => {
  it('marks only the listed ids read, scoped to the session user and unread rows', async () => {
    wire();
    const res = await markRead(post({ ids: [7, 9] }), {});
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const update = calls().find((call) => call.text.includes('UPDATE notifications'));
    expect(update).toBeDefined();
    expect(update!.text).toContain('read_at IS NULL');
    expect(update!.text).toContain('user_id =');
    expect(update!.text).toContain('ANY');
    expect(update!.params).toContainEqual([7, 9]);
    expect(update!.params).toContain(USER_ID);
  });

  it('marks everything read on an empty body (still user- and unread-scoped)', async () => {
    wire();
    const res = await markRead(post({}), {});
    expect(res.status).toBe(200);

    const update = calls().find((call) => call.text.includes('UPDATE notifications'));
    expect(update).toBeDefined();
    expect(update!.text).toContain('read_at IS NULL');
    expect(update!.text).toContain('user_id =');
    expect(update!.text).not.toContain('ANY');
    expect(update!.params).toEqual([USER_ID]);
  });
});
