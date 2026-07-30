import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { GET } from '../route';
import { TALENT_PAGE_SIZE } from '@/app/api/utils/talent-query';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockResolvedValue([]);
});

describe('GET /api/talent (public directory)', () => {
  it('serves without a session (public surface)', async () => {
    const res = await GET(new Request('http://test.local/api/talent'), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ talent: [], page: 1, hasMore: false });
  });

  it('parameterizes SQLi payloads instead of interpolating them', async () => {
    const payload = "x'; DROP TABLE talent_profiles; --";
    const res = await GET(
      new Request(`http://test.local/api/talent?role=${encodeURIComponent(payload)}`),
      {}
    );
    expect(res.status).toBe(200);
    const [text, values] = mocks.sql.mock.calls[0] as [string, unknown[]];
    expect(text).not.toContain(payload);
    expect(values).toContain(`%${payload}%`);
  });

  it('rejects invalid filters with 400', async () => {
    const res = await GET(new Request('http://test.local/api/talent?minRate=300&maxRate=10'), {});
    expect(res.status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('reports hasMore by trimming the sentinel row', async () => {
    const rows = Array.from({ length: TALENT_PAGE_SIZE + 1 }, (_, i) => ({
      id: `t-${i}`,
      stage_name: `DJ ${i}`,
    }));
    mocks.sql.mockResolvedValue(rows);
    const res = await GET(new Request('http://test.local/api/talent'), {});
    const body = await res.json();
    expect(body.hasMore).toBe(true);
    expect(body.talent).toHaveLength(TALENT_PAGE_SIZE);
  });
});
