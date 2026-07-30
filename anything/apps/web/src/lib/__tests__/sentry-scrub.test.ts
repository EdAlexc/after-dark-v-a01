import { describe, expect, it } from 'vitest';
import { scrubSentryEvent } from '../sentry-scrub';

describe('scrubSentryEvent (Backlog #19 — no PII leaves the app)', () => {
  it('reduces user identity to the id only', () => {
    const event = scrubSentryEvent({
      user: { id: 'u-1', email: 'dj@example.com', ip_address: '10.0.0.1', username: 'dj' },
    });
    expect(event.user).toEqual({ id: 'u-1' });
  });

  it('drops the user entirely when there is no id', () => {
    const event = scrubSentryEvent({ user: { email: 'dj@example.com' } });
    expect(event.user).toBeUndefined();
  });

  it('drops cookies/headers wholesale and pattern-redacts the rest of the request', () => {
    const event = scrubSentryEvent({
      request: {
        url: 'https://app.example/api/gigs',
        cookies: { 'better-auth.session_token': 'tok' },
        headers: { authorization: 'Bearer tok' },
        data: { password: 'hunter2', title: 'DJ set' },
      },
    });
    const request = event.request as Record<string, unknown>;
    expect(request.cookies).toBeUndefined();
    expect(request.headers).toBeUndefined();
    expect((request.data as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((request.data as Record<string, unknown>).title).toBe('DJ set');
  });

  it('redacts extra, contexts, tags, and breadcrumbs', () => {
    const event = scrubSentryEvent({
      extra: { totp_secret: 'ABC', gigId: 'g-1' },
      contexts: { app: { session_token: 'x' } },
      tags: { email: 'a@b.c', route: 'gigs.list' },
      breadcrumbs: [{ message: 'click', data: { phone: '555-1234' } }],
    });
    expect((event.extra as Record<string, unknown>).totp_secret).toBe('[REDACTED]');
    expect((event.extra as Record<string, unknown>).gigId).toBe('g-1');
    expect(JSON.stringify(event.contexts)).not.toContain('"x"');
    expect((event.tags as Record<string, unknown>).email).toBe('[REDACTED]');
    expect((event.tags as Record<string, unknown>).route).toBe('gigs.list');
    expect(JSON.stringify(event.breadcrumbs)).not.toContain('555-1234');
  });

  it('tolerates minimal/empty events', () => {
    expect(scrubSentryEvent({})).toEqual({});
    const passthrough = { message: 'boom' };
    expect(scrubSentryEvent(passthrough)).toEqual({ message: 'boom' });
  });
});
