/**
 * Uniform route-handler plumbing: typed API errors + a `withRoute` wrapper
 * every handler goes through.
 *
 * Guarantees (TENANT_GUARDRAIL §5 A05/A09):
 *  - expected failures map to their status with a safe public message;
 *  - unexpected failures are logged (redacted) and surface as an opaque 500 —
 *    internal error details never reach the client;
 *  - 429s carry a `Retry-After` header.
 */

import { logger } from './logger';

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  static badRequest(message = 'Bad request'): ApiError {
    return new ApiError(400, message);
  }
  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message);
  }
  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, message);
  }
  static notFound(message = 'Not found'): ApiError {
    return new ApiError(404, message);
  }
  static payloadTooLarge(message = 'Request body too large'): ApiError {
    return new ApiError(413, message);
  }
  static tooManyRequests(retryAfterSeconds: number, message = 'Too many requests'): ApiError {
    return new ApiError(429, message, Math.max(1, Math.ceil(retryAfterSeconds)));
  }
}

export function jsonError(status: number, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: message }, { status, headers });
}

type RouteContext = { params?: Promise<Record<string, string | string[]>> };
export type RouteHandler = (request: Request, context: RouteContext) => Promise<Response>;

/**
 * Wraps a route handler with uniform error handling.
 *
 *   export const POST = withRoute('gigs.create', async (request) => { … });
 */
export function withRoute(name: string, handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (err) {
      if (err instanceof ApiError) {
        const headers =
          err.retryAfterSeconds !== undefined
            ? { 'Retry-After': String(err.retryAfterSeconds) }
            : undefined;
        return jsonError(err.status, err.message, headers);
      }
      logger.error(`${name} failed`, { error: err });
      return jsonError(500, 'Internal server error');
    }
  };
}
