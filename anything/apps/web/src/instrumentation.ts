/**
 * Server/edge error tracking via Sentry (Backlog #19). No-ops without
 * SENTRY_DSN, so local/dev/CI never phone home. Every event passes the
 * PII scrubber before leaving the process (working agreement: never log PII).
 */

import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/sentry-scrub';

export function register() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    enabled: Boolean(process.env.SENTRY_DSN),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: (event) => scrubSentryEvent(event),
  });
}

export const onRequestError = Sentry.captureRequestError;
