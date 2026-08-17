/**
 * Transactional email spine (S13) — the house key-gated pattern: inert
 * without keys, loud in logs, and no flow ever breaks because a message
 * could not be sent.
 *
 * Provider: Resend's plain HTTPS API via fetch — a constant origin (not
 * user-influenced, so the A10 safe-fetch guard does not apply) and no SDK
 * dependency. Configure with RESEND_API_KEY + EMAIL_FROM (see .env.example).
 *
 * Privacy stance (G11): payloads carry NOTHING but the recipient address,
 * a subject, and the action link — no names, no profile data. The recipient
 * address is itself PII, so it is never logged (subjects are).
 */

import { logger } from './logger';

const log = logger.child('email');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends one transactional email. NEVER throws — resolves false (with a loud
 * log) when unconfigured or when the provider errors, so callers like
 * better-auth's uniform-response password-reset flow keep their contract.
 */
export async function sendEmail(mail: OutgoingEmail): Promise<boolean> {
  if (!emailConfigured()) {
    log.error('email not configured (RESEND_API_KEY/EMAIL_FROM unset) — message NOT sent', {
      subject: mail.subject,
    });
    return false;
  }
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.error('email send failed', { subject: mail.subject, status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    log.error('email send threw', { subject: mail.subject, error });
    return false;
  }
}

/** Password-reset message. Deliberately terse: a link and its lifetime, nothing else. */
export function passwordResetMessage(url: string): Omit<OutgoingEmail, 'to'> {
  return {
    subject: 'Reset your AfterDark password',
    text: [
      'Someone requested a password reset for the AfterDark account under this address.',
      '',
      `Reset your password (link expires in 1 hour, single use): ${url}`,
      '',
      "If this wasn't you, ignore this email — your password is unchanged.",
    ].join('\n'),
  };
}

/** Email-verification message for new signups. */
export function verifyEmailMessage(url: string): Omit<OutgoingEmail, 'to'> {
  return {
    subject: 'Verify your AfterDark email',
    text: [
      'Welcome to AfterDark. Confirm this address to activate your account.',
      '',
      `Verify your email (link expires in 1 hour): ${url}`,
      '',
      "If you didn't sign up, ignore this email and nothing happens.",
    ].join('\n'),
  };
}
