import { describe, expect, it, vi } from 'vitest';

vi.mock('../sql', () => ({ default: vi.fn() }));

import { AuditLogger } from '../audit';
import { Logger } from '../logger';

type Recorded = { strings: TemplateStringsArray; values: unknown[] };

function fakeDeps(behavior: 'ok' | 'fail' = 'ok') {
  const calls: Recorded[] = [];
  const logLines: string[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (behavior === 'fail') throw new Error('connection refused');
    calls.push({ strings, values });
    return [];
  };
  const logger = new Logger('test.audit', (_level, line) => logLines.push(line));
  return { sql, logger, calls, logLines };
}

describe('AuditLogger', () => {
  it('records actor/action/entity and serialized metadata', async () => {
    const deps = fakeDeps();
    const audit = new AuditLogger({ sql: deps.sql, logger: deps.logger });
    const ok = await audit.record({
      actorId: 'u1',
      action: 'gig.create',
      entityType: 'gig',
      entityId: 'g9',
      metadata: { status: 'PUBLISHED' },
    });
    expect(ok).toBe(true);
    expect(deps.calls).toHaveLength(1);
    const [actorId, action, entityType, entityId, metadata] = deps.calls[0].values;
    expect(actorId).toBe('u1');
    expect(action).toBe('gig.create');
    expect(entityType).toBe('gig');
    expect(entityId).toBe('g9');
    expect(JSON.parse(metadata as string)).toEqual({ status: 'PUBLISHED' });
  });

  it('defaults entityId to null and metadata to {}', async () => {
    const deps = fakeDeps();
    const audit = new AuditLogger({ sql: deps.sql, logger: deps.logger });
    await audit.record({ actorId: 'u1', action: 'password.change', entityType: 'user' });
    const [, , , entityId, metadata] = deps.calls[0].values;
    expect(entityId).toBeNull();
    expect(JSON.parse(metadata as string)).toEqual({});
  });

  it('redacts PII keys inside metadata before persisting', async () => {
    const deps = fakeDeps();
    const audit = new AuditLogger({ sql: deps.sql, logger: deps.logger });
    await audit.record({
      actorId: 'u1',
      action: 'settings.update',
      entityType: 'user',
      metadata: { recovery_email: 'x@y.z', changed: ['phone'] },
    });
    const metadata = JSON.parse(deps.calls[0].values[4] as string);
    expect(metadata.recovery_email).toBe('[REDACTED]');
    expect(metadata.changed).toEqual(['phone']);
  });

  it('never throws when the insert fails — logs and returns false', async () => {
    const deps = fakeDeps('fail');
    const audit = new AuditLogger({ sql: deps.sql, logger: deps.logger });
    await expect(
      audit.record({ actorId: 'u1', action: 'role.set', entityType: 'user' })
    ).resolves.toBe(false);
    expect(deps.logLines.some((line) => line.includes('audit record failed'))).toBe(true);
  });
});
