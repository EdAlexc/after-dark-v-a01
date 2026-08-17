import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emailConfigured,
  passwordResetMessage,
  sendEmail,
  verifyEmailMessage,
} from '../email';

/**
 * S13 email spine — the key-gated transport. Contract under test: inert
 * without keys (loud, returns false, NO network call), never throws, and
 * payloads carry nothing but from/to/subject/text (G11).
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

describe('emailConfigured', () => {
  it('requires BOTH the API key and the sender identity', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('EMAIL_FROM', '');
    expect(emailConfigured()).toBe(false);
    vi.stubEnv('RESEND_API_KEY', 're_test');
    expect(emailConfigured()).toBe(false);
    vi.stubEnv('EMAIL_FROM', 'AfterDark <no-reply@afterdark.test>');
    expect(emailConfigured()).toBe(true);
  });
});

describe('sendEmail', () => {
  it('no-ops (false) with ZERO network calls when unconfigured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('EMAIL_FROM', '');
    const sent = await sendEmail({ to: 'user@example.com', subject: 's', text: 't' });
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs exactly from/to/subject/text to the Resend endpoint when keyed', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'AfterDark <no-reply@afterdark.test>');
    const sent = await sendEmail({ to: 'user@example.com', subject: 'Subject', text: 'Body' });
    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    // G11: nothing beyond the address rides to the provider — no names, no ids.
    expect(Object.keys(payload).sort()).toEqual(['from', 'subject', 'text', 'to']);
    expect(payload.to).toBe('user@example.com');
  });

  it('returns false (never throws) on a provider error status', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'AfterDark <no-reply@afterdark.test>');
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    await expect(
      sendEmail({ to: 'user@example.com', subject: 's', text: 't' })
    ).resolves.toBe(false);
  });

  it('returns false (never throws) when fetch itself rejects', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'AfterDark <no-reply@afterdark.test>');
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(
      sendEmail({ to: 'user@example.com', subject: 's', text: 't' })
    ).resolves.toBe(false);
  });
});

describe('message templates', () => {
  it('reset message carries the link, its lifetime, and nothing personal', () => {
    const message = passwordResetMessage('https://app.test/reset?token=abc');
    expect(message.text).toContain('https://app.test/reset?token=abc');
    expect(message.text).toMatch(/1 hour/);
    expect(message.text).toMatch(/single use/i);
  });

  it('verification message carries the link and nothing personal', () => {
    const message = verifyEmailMessage('https://app.test/verify?token=abc');
    expect(message.text).toContain('https://app.test/verify?token=abc');
    expect(message.subject).toMatch(/verify/i);
  });
});
