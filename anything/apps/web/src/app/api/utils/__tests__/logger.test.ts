import { describe, expect, it } from 'vitest';
import { Logger, redactPii, type LogLevel } from '../logger';

describe('redactPii', () => {
  it('masks credential-ish and PII keys at any depth', () => {
    const input = {
      password: 'hunter2',
      nested: {
        totp_secret: 'ABC',
        recovery_email: 'a@b.c',
        profile: { phone: '+1 555', ok: 'visible' },
      },
      authorization: 'Bearer xyz',
    };
    const out = redactPii(input) as Record<string, any>;
    expect(out.password).toBe('[REDACTED]');
    expect(out.nested.totp_secret).toBe('[REDACTED]');
    expect(out.nested.recovery_email).toBe('[REDACTED]');
    expect(out.nested.profile.phone).toBe('[REDACTED]');
    expect(out.nested.profile.ok).toBe('visible');
    expect(out.authorization).toBe('[REDACTED]');
  });

  it('matches key names case-insensitively and as substrings', () => {
    const out = redactPii({ userEmail: 'x@y.z', API_TOKEN: 't', SessionId: 's' }) as any;
    expect(out.userEmail).toBe('[REDACTED]');
    expect(out.API_TOKEN).toBe('[REDACTED]');
    expect(out.SessionId).toBe('[REDACTED]');
  });

  it('handles arrays, preserving order', () => {
    const out = redactPii([{ password: 'a' }, 'plain', 7]) as any[];
    expect(out[0].password).toBe('[REDACTED]');
    expect(out[1]).toBe('plain');
    expect(out[2]).toBe(7);
  });

  it('survives circular references', () => {
    const obj: any = { name: 'loop' };
    obj.self = obj;
    const out = redactPii(obj) as any;
    expect(out.self).toBe('[CIRCULAR]');
  });

  it('caps runaway depth', () => {
    let deep: any = { value: 'bottom' };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    const json = JSON.stringify(redactPii(deep));
    expect(json).toContain('[MAX_DEPTH]');
  });

  it('serializes Error objects without stack/PII baggage', () => {
    const out = redactPii({ error: new TypeError('boom') }) as any;
    expect(out.error).toEqual({ name: 'TypeError', message: 'boom' });
  });

  it('truncates very long strings', () => {
    const out = redactPii('x'.repeat(5000)) as string;
    expect(out.length).toBeLessThan(2100);
    expect(out.endsWith('…')).toBe(true);
  });

  it('passes primitives and nullish through', () => {
    expect(redactPii(null)).toBeNull();
    expect(redactPii(undefined)).toBeUndefined();
    expect(redactPii(42)).toBe(42);
    expect(redactPii(true)).toBe(true);
  });
});

describe('Logger', () => {
  function capture() {
    const lines: Array<{ level: LogLevel; parsed: any }> = [];
    const logger = new Logger('test', (level, line) => lines.push({ level, parsed: JSON.parse(line) }));
    return { logger, lines };
  }

  it('emits structured JSON with ts/level/context/message', () => {
    const { logger, lines } = capture();
    logger.info('hello', { requestId: 'r1' });
    expect(lines).toHaveLength(1);
    expect(lines[0].level).toBe('info');
    expect(lines[0].parsed).toMatchObject({
      level: 'info',
      context: 'test',
      message: 'hello',
      meta: { requestId: 'r1' },
    });
    expect(Date.parse(lines[0].parsed.ts)).not.toBeNaN();
  });

  it('redacts meta before serializing', () => {
    const { logger, lines } = capture();
    logger.error('login failed', { email: 'a@b.c', attempt: 3 });
    expect(lines[0].parsed.meta.email).toBe('[REDACTED]');
    expect(lines[0].parsed.meta.attempt).toBe(3);
  });

  it('child() namespaces the context', () => {
    const { logger, lines } = capture();
    logger.child('gigs').warn('slow query');
    expect(lines[0].parsed.context).toBe('test.gigs');
  });

  it('never throws on unserializable meta', () => {
    const { logger, lines } = capture();
    expect(() => logger.info('bigint', { value: BigInt(1) as unknown as number })).not.toThrow();
    expect(lines[0].parsed.message).toBe('bigint');
  });
});
