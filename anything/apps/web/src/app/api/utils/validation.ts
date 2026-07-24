/**
 * Request parsing + zod validation for route handlers (TENANT_GUARDRAIL §5 A03/A04).
 *
 * - Bodies are size-capped BEFORE JSON.parse (DoS guard).
 * - Unknown keys are stripped by zod object schemas (mass-assignment guard).
 * - Failures throw `ApiError.badRequest` with a compact, safe message.
 */

import type { z } from 'zod';
import { ApiError } from './route-kit';

/** Default cap for JSON bodies. Media-carrying routes pass a larger cap. */
export const DEFAULT_MAX_BODY_BYTES = 100_000;

function formatZodError(error: z.ZodError): string {
  const issues = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.join('.') || 'body';
    return `${path}: ${issue.message}`;
  });
  const suffix = error.issues.length > 3 ? ` (+${error.issues.length - 3} more)` : '';
  return `Invalid input — ${issues.join('; ')}${suffix}`;
}

/** Reads, size-checks, JSON-parses, and validates a request body. */
export async function parseBody<Schema extends z.ZodTypeAny>(
  request: Request,
  schema: Schema,
  options: { maxBytes?: number } = {}
): Promise<z.infer<Schema>> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;

  let text: string;
  try {
    text = await request.text();
  } catch {
    throw ApiError.badRequest('Unreadable request body');
  }

  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw ApiError.payloadTooLarge();
  }
  if (text.trim().length === 0) {
    throw ApiError.badRequest('Request body is required');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw ApiError.badRequest('Malformed JSON body');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw ApiError.badRequest(formatZodError(result.error));
  }
  return result.data;
}

/** Validates URL search params (single-valued) against a schema. */
export function parseQuery<Schema extends z.ZodTypeAny>(
  url: string | URL,
  schema: Schema
): z.infer<Schema> {
  const { searchParams } = typeof url === 'string' ? new URL(url) : url;
  const raw: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!(key in raw)) raw[key] = value; // first value wins; repeats ignored
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw ApiError.badRequest(formatZodError(result.error));
  }
  return result.data;
}
