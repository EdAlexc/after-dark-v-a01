/**
 * P9 admin-route edge cases, beyond the generated authZ matrix:
 *  - the suspend guardrails (no self-suspend, no suspending ADMINs, reason
 *    required);
 *  - triage transitions (no-op on same status, CLOSED is terminal);
 *  - moderation reads of private messages leave an audit event;
 *  - CSV export shape + the export-is-audited requirement.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));

import { PATCH as patchUser } from '../users/[id]/route';
import { GET as getReport, PATCH as patchReport } from '../reports/[id]/route';
import { GET as getAuditLogs } from '../audit-logs/route';

const ADMIN_ID = 'admin-1';
const TARGET_ID = 'user-2';
const ADMIN_SESSION = { user: { id: ADMIN_ID, email: 'admin@example.com', name: 'Admin' } };

interface DbShape {
  targetRole?: string | null;
  targetSuspended?: string | null;
  report?: Record<string, unknown> | null;
  auditRows?: Array<Record<string, unknown>>;
}

function wireSql(shape: DbShape = {}) {
  mocks.sql.mockImplementation(async (first: unknown, ..._rest: unknown[]) => {
    const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
    if (text.includes('SELECT role, suspended_at')) {
      return [{ role: 'ADMIN', suspended_at: null, suspended_reason: null }];
    }
    if (text.includes('SELECT id, role, suspended_at FROM "user"')) {
      return shape.targetRole === undefined && shape.targetSuspended === undefined
        ? []
        : [
            {
              id: TARGET_ID,
              role: shape.targetRole ?? 'TALENT',
              suspended_at: shape.targetSuspended ?? null,
            },
          ];
    }
    if (text.includes('UPDATE "user"')) {
      return [{ id: TARGET_ID, suspended_at: 'now', suspended_reason: 'r' }];
    }
    if (text.includes('FROM reports WHERE id')) {
      return shape.report ? [shape.report] : [];
    }
    if (text.includes('UPDATE reports')) {
      return [{ ...(shape.report ?? {}), status: 'REVIEWING' }];
    }
    if (text.includes('FROM conversations c')) {
      return [{ id: 'c-1', kind: 'GIG', gig_id: null, gig_title: null }];
    }
    if (text.includes('FROM messages m')) {
      return [{ id: 'm-1', kind: 'TEXT', content: 'hello', created_at: 'now' }];
    }
    if (text.includes('FROM audit_logs')) return shape.auditRows ?? [];
    if (text.includes('INSERT INTO audit_logs')) return [];
    return [];
  });
}

function patchRequest(body: unknown): Request {
  return new Request('http://t.local/api/admin/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(ADMIN_SESSION);
  wireSql();
});

describe('PATCH /api/admin/users/[id] guardrails', () => {
  it('rejects self-suspension with 400 before touching the target', async () => {
    const res = await patchUser(
      patchRequest({ suspended: true, reason: 'x' }),
      ctx(ADMIN_ID)
    );
    expect(res.status).toBe(400);
  });

  it('refuses to suspend another ADMIN (403 — de-escalate out-of-band first)', async () => {
    wireSql({ targetRole: 'ADMIN' });
    const res = await patchUser(
      patchRequest({ suspended: true, reason: 'x' }),
      ctx(TARGET_ID)
    );
    expect(res.status).toBe(403);
  });

  it('requires a reason to suspend', async () => {
    wireSql({ targetRole: 'TALENT' });
    const res = await patchUser(patchRequest({ suspended: true }), ctx(TARGET_ID));
    expect(res.status).toBe(400);
  });

  it('suspends with reason and audits with the acting admin id', async () => {
    wireSql({ targetRole: 'TALENT' });
    const res = await patchUser(
      patchRequest({ suspended: true, reason: 'ToS violation' }),
      ctx(TARGET_ID)
    );
    expect(res.status).toBe(200);
    const audit = mocks.sql.mock.calls.find(([first]) => {
      const text = Array.isArray(first) ? (first as string[]).join('') : String(first);
      return text.includes('INSERT INTO audit_logs');
    });
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).toContain(ADMIN_ID);
    expect(JSON.stringify(audit)).toContain('admin.user.suspend');
  });
});

describe('PATCH /api/admin/reports/[id] triage', () => {
  const OPEN_REPORT = {
    id: 1,
    reporter_id: 'u-9',
    entity_type: 'gig',
    entity_id: 'g-1',
    reason: 'spam',
    severity: 'LOW',
    status: 'OPEN',
    created_at: 'now',
    reviewed_at: null,
    resolution_note: null,
  };

  it('transitions OPEN → REVIEWING and audits it', async () => {
    wireSql({ report: OPEN_REPORT });
    const res = await patchReport(patchRequest({ status: 'REVIEWING' }), ctx('1'));
    expect(res.status).toBe(200);
    expect(JSON.stringify(mocks.sql.mock.calls)).toContain('admin.report.transition');
  });

  it('re-sending the current status is a no-op 200 (no audit row)', async () => {
    wireSql({ report: { ...OPEN_REPORT, status: 'REVIEWING' } });
    const res = await patchReport(patchRequest({ status: 'REVIEWING' }), ctx('1'));
    expect(res.status).toBe(200);
    expect(JSON.stringify(mocks.sql.mock.calls)).not.toContain('admin.report.transition');
  });

  it('CLOSED is terminal (400)', async () => {
    wireSql({ report: { ...OPEN_REPORT, status: 'CLOSED' } });
    const res = await patchReport(patchRequest({ status: 'REVIEWING' }), ctx('1'));
    expect(res.status).toBe(400);
  });

  it('404s an unknown or non-numeric id before SQL', async () => {
    wireSql({ report: null });
    expect((await patchReport(patchRequest({ status: 'REVIEWING' }), ctx('999'))).status).toBe(
      404
    );
    expect((await patchReport(patchRequest({ status: 'REVIEWING' }), ctx('abc'))).status).toBe(
      404
    );
  });
});

describe('GET /api/admin/reports/[id] moderation reads', () => {
  it('reading a reported conversation logs a moderation event', async () => {
    wireSql({
      report: {
        id: 2,
        reporter_id: 'u-9',
        entity_type: 'conversation',
        entity_id: 'c-1',
        reason: 'harassment',
        severity: 'HIGH',
        status: 'OPEN',
        created_at: 'now',
        reviewed_at: null,
        resolution_note: null,
      },
    });
    const res = await getReport(new Request('http://t.local'), ctx('2'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: unknown[] };
    expect(body.messages.length).toBeGreaterThan(0);
    expect(JSON.stringify(mocks.sql.mock.calls)).toContain('admin.moderation.messages_read');
  });

  it('a non-conversation report reads no messages and logs nothing', async () => {
    wireSql({
      report: {
        id: 3,
        reporter_id: null,
        entity_type: 'gig',
        entity_id: 'g-1',
        reason: 'fake listing',
        severity: 'MEDIUM',
        status: 'OPEN',
        created_at: 'now',
        reviewed_at: null,
        resolution_note: null,
      },
    });
    const res = await getReport(new Request('http://t.local'), ctx('3'));
    expect(res.status).toBe(200);
    expect(JSON.stringify(mocks.sql.mock.calls)).not.toContain(
      'admin.moderation.messages_read'
    );
  });
});

describe('GET /api/admin/audit-logs export', () => {
  it('CSV export sets attachment headers, escapes quotes, and audits itself', async () => {
    wireSql({
      auditRows: [
        {
          id: 1,
          actor_id: 'u-1',
          action: 'gig.create',
          entity_type: 'gig',
          entity_id: 'g-1',
          metadata: { note: 'said "hi"' },
          created_at: '2026-07-30T00:00:00Z',
        },
      ],
    });
    const res = await getAuditLogs(
      new Request('http://t.local/api/admin/audit-logs?format=csv'),
      {}
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    const text = await res.text();
    expect(text.split('\n')[0]).toBe(
      'id,actor_id,action,entity_type,entity_id,metadata,created_at'
    );
    // Embedded quotes are doubled per RFC 4180 (metadata JSON adds its own
    // backslash layer first: "note" → ""note"").
    expect(text).toContain('""note""');
    expect(text.split('\n')).toHaveLength(2); // header + one row, nothing mangled
    expect(JSON.stringify(mocks.sql.mock.calls)).toContain('admin.audit.export');
  });

  it('JSON view paginates and does not audit', async () => {
    wireSql({ auditRows: [] });
    const res = await getAuditLogs(new Request('http://t.local/api/admin/audit-logs'), {});
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ logs: [], page: 1, hasMore: false });
    expect(JSON.stringify(mocks.sql.mock.calls)).not.toContain('admin.audit.export');
  });
});
