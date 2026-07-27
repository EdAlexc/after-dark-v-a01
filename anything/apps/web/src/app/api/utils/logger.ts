/**
 * Structured JSON logger with PII redaction (TENANT_GUARDRAIL §5 A09, §4 G-series).
 *
 * Working agreement (CLAUDE.md §11): never log PII. Every metadata object
 * passes through `redactPii` before serialization, so keys that look like
 * credentials or personal data are masked even when a call site forgets.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogSink = (level: LogLevel, line: string) => void;

/** Keys whose values must never appear in logs. Matched case-insensitively. */
const PII_KEY_PATTERN =
  /(password|secret|token|authorization|cookie|session|email|phone|otp|totp|recovery|address|ssn|iban|card)/i;

const MAX_DEPTH = 8;
const REDACTED = '[REDACTED]';

/**
 * Deep-copies `value` masking any property whose key matches
 * {@link PII_KEY_PATTERN}. Handles arrays, nested objects, `Error` instances,
 * circular references, and depth bombs without throwing.
 */
export function redactPii(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactPii(item, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = PII_KEY_PATTERN.test(key) ? REDACTED : redactPii(val, depth + 1, seen);
  }
  return out;
}

const defaultSink: LogSink = (level, line) => {
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
};

export class Logger {
  constructor(
    private readonly context: string,
    private readonly sink: LogSink = defaultSink
  ) {}

  /** Namespaced sub-logger, e.g. `logger.child('gigs')` → context `api.gigs`. */
  child(subContext: string): Logger {
    return new Logger(`${this.context}.${subContext}`, this.sink);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.emit('info', message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.emit('warn', message, meta);
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.emit('error', message, meta);
  }

  private emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      context: this.context,
      message,
    };
    if (meta !== undefined) record.meta = redactPii(meta);
    let line: string;
    try {
      line = JSON.stringify(record);
    } catch {
      line = JSON.stringify({ ts: record.ts, level, context: this.context, message });
    }
    this.sink(level, line);
  }
}

/** Shared default instance for API code. */
export const logger = new Logger('api');
