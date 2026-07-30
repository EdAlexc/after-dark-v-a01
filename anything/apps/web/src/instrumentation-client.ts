/**
 * Browser error tracking via Sentry (Backlog #19). No-ops without
 * NEXT_PUBLIC_SENTRY_DSN. Same PII scrubbing policy as the server side.
 * When enabling, also verify the DSN origin lands in connect-src
 * (security-headers.js appends it automatically from this env var).
 */

import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend: (event) => scrubSentryEvent(event),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
