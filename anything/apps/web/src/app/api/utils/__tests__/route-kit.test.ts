/**
 * route-kit (Q8) — the uniform handler plumbing every route rides:
 * ApiError factory statuses, pass-through of handler Responses, expected
 * failures mapped to their status + safe JSON body, unexpected failures
 * surfacing as an OPAQUE 500 (logged, never leaked), and the S18 timing
 * capture firing on every path. Telemetry + logger are stubbed hermetic.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  captureApiTiming: vi.fn(),
  loggerError: vi.fn(),
}));
vi.mock('@/app/api/utils/telemetry', () => ({
  captureApiTiming: mocks.captureApiTiming,
}));
vi.mock('@/app/api/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
    child: vi.fn(),
  },
}));

import { ApiError, jsonError, withRoute } from '../route-kit';

function request(method = 'GET'): Request {
  return new Request('http://test.local/api/anything', { method });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ApiError factories', () => {
  it.each([
    ['badRequest', ApiError.badRequest(), 400, 'Bad request'],
    ['unauthorized', ApiError.unauthorized(), 401, 'Unauthorized'],
    ['forbidden', ApiError.forbidden(), 403, 'Forbidden'],
    ['notFound', ApiError.notFound(), 404, 'Not found'],
    ['payloadTooLarge', ApiError.payloadTooLarge(), 413, 'Request body too large'],
    ['tooManyRequests', ApiError.tooManyRequests(30), 429, 'Too many requests'],
  ] as const)('%s carries its status and default message', (_name, err, status, message) => {
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(status);
    expect(err.message).toBe(message);
  });

  it('accepts custom messages', () => {
    expect(ApiError.notFound('Gig not found').message).toBe('Gig not found');
    expect(ApiError.forbidden('Your role does not allow this action').status).toBe(403);
  });

  it('tooManyRequests rounds retry-after up and never below 1 second', () => {
    expect(ApiError.tooManyRequests(7.2).retryAfterSeconds).toBe(8);
    expect(ApiError.tooManyRequests(0.2).retryAfterSeconds).toBe(1);
    expect(ApiError.tooManyRequests(0).retryAfterSeconds).toBe(1);
    expect(ApiError.tooManyRequests(60).retryAfterSeconds).toBe(60);
    // Only the 429 factory carries retry-after at all.
    expect(ApiError.badRequest().retryAfterSeconds).toBeUndefined();
  });
});

describe('jsonError', () => {
  it('shapes the uniform { error } body with status and optional headers', async () => {
    const res = jsonError(418, 'teapot', { 'Retry-After': '5' });
    expect(res.status).toBe(418);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(await res.json()).toEqual({ error: 'teapot' });
  });
});

describe('withRoute', () => {
  it('passes a handler Response through untouched', async () => {
    const inner = Response.json({ ok: true }, { status: 201, headers: { 'X-Custom': 'kept' } });
    const handler = withRoute('kit.pass', async () => inner);
    const res = await handler(request('POST'), {});
    expect(res).toBe(inner); // the very same object — no re-wrapping
    expect(res.status).toBe(201);
    expect(res.headers.get('X-Custom')).toBe('kept');
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it('maps a thrown ApiError to its status and JSON error body', async () => {
    const handler = withRoute('kit.notfound', async () => {
      throw ApiError.notFound('Gig not found');
    });
    const res = await handler(request(), {});
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Gig not found' });
    // Expected failures are not error-logged.
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it('adds Retry-After on 429s and omits it on other ApiErrors', async () => {
    const limited = withRoute('kit.limited', async () => {
      throw ApiError.tooManyRequests(12.4, 'Too many attempts — slow down');
    });
    const res = await limited(request('POST'), {});
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('13');
    expect(await res.json()).toEqual({ error: 'Too many attempts — slow down' });

    const forbidden = withRoute('kit.forbidden', async () => {
      throw ApiError.forbidden();
    });
    const res2 = await forbidden(request(), {});
    expect(res2.status).toBe(403);
    expect(res2.headers.get('Retry-After')).toBeNull();
  });

  it('maps an unexpected Error to an opaque 500 — internals never reach the client', async () => {
    const secret = 'connect failed: postgres://svc:hunter2@db.internal/afterdark';
    const handler = withRoute('kit.boom', async () => {
      throw new Error(secret);
    });
    const res = await handler(request('POST'), {});
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'Internal server error' });
    // Neither the message, the credential, nor a stack leaks.
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('connect failed');
    expect(text).not.toContain('stack');
    // …but the failure IS logged for operators, tagged with the route name.
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    expect(mocks.loggerError.mock.calls[0][0]).toBe('kit.boom failed');
  });

  it('treats a raw ZodError as unexpected — opaque 500, no issue details leaked', async () => {
    // route-kit does NOT special-case zod: parseBody/parseQuery convert
    // validation failures to ApiError(400) before they ever reach here
    // (covered in validation.test.ts). A zod error thrown raw is a bug and
    // must surface opaque.
    const handler = withRoute('kit.zod', async () => {
      z.strictObject({ role: z.literal('TALENT') }).parse({ role: 'ADMIN', extra: 1 });
      return Response.json({ ok: true });
    });
    const res = await handler(request(), {});
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'Internal server error' });
    expect(text).not.toContain('role');
    expect(text).not.toContain('invalid');
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
  });

  it('survives non-Error throws with the same opaque 500', async () => {
    const handler = withRoute('kit.string-throw', async () => {
      // eslint-disable-next-line no-throw-literal
      throw 'raw string with internals';
    });
    const res = await handler(request(), {});
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'Internal server error' });
    expect(text).not.toContain('internals');
  });

  it('captures one S18 timing per request with the route NAME and final status', async () => {
    const ok = withRoute('kit.timing-ok', async () => new Response(null, { status: 204 }));
    await ok(request('GET'), {});
    const denied = withRoute('kit.timing-denied', async () => {
      throw ApiError.unauthorized();
    });
    await denied(request('POST'), {});
    const crashed = withRoute('kit.timing-crashed', async () => {
      throw new Error('boom');
    });
    await crashed(request('DELETE'), {});

    expect(mocks.captureApiTiming).toHaveBeenCalledTimes(3);
    const [okCall, deniedCall, crashedCall] = mocks.captureApiTiming.mock.calls.map(
      (call) => call[0] as { route: string; method: string; status: number; durationMs: number }
    );
    expect(okCall).toMatchObject({ route: 'kit.timing-ok', method: 'GET', status: 204 });
    expect(deniedCall).toMatchObject({ route: 'kit.timing-denied', method: 'POST', status: 401 });
    expect(crashedCall).toMatchObject({ route: 'kit.timing-crashed', method: 'DELETE', status: 500 });
    for (const call of [okCall, deniedCall, crashedCall]) {
      expect(call.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(call.durationMs)).toBe(true);
    }
  });
});
