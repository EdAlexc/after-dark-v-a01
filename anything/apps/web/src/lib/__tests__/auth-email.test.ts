import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * S13 better-auth email handlers. The load-bearing contract: every handler
 * audits, sends through the key-gated spine, and NEVER throws — a throw in
 * sendResetPassword would 500 /request-password-reset and break its
 * uniform (no-enumeration) response.
 */

const mocks = vi.hoisted(() => ({
  record: vi.fn(async () => undefined),
  sendEmail: vi.fn(async () => true),
}));

vi.mock('@/app/api/utils/audit', () => ({ auditLogger: { record: mocks.record } }));
vi.mock('@/app/api/utils/email', () => ({
  emailConfigured: () => false,
  sendEmail: mocks.sendEmail,
  passwordResetMessage: (url: string) => ({ subject: 'reset', text: url }),
  verifyEmailMessage: (url: string) => ({ subject: 'verify', text: url }),
}));

import { auditPasswordReset, sendResetPasswordEmail, sendVerificationEmailTo } from '../auth-email';

const USER = { id: 'u1', email: 'user@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.record.mockResolvedValue(undefined);
  mocks.sendEmail.mockResolvedValue(true);
});

describe('sendResetPasswordEmail', () => {
  it('audits the request and sends the link to the account address', async () => {
    await sendResetPasswordEmail({ user: USER, url: 'https://app.test/r?token=t' });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'u1', action: 'auth.password.reset_requested' })
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com', text: 'https://app.test/r?token=t' })
    );
  });
});

describe('auditPasswordReset', () => {
  it('records the completion as a security event', async () => {
    await auditPasswordReset({ user: USER });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'u1', action: 'auth.password.reset_completed' })
    );
  });
});

describe('sendVerificationEmailTo', () => {
  it('audits the send and delivers the verification link', async () => {
    await sendVerificationEmailTo({ user: USER, url: 'https://app.test/v?token=t' });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'u1', action: 'auth.email.verification_sent' })
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com', text: 'https://app.test/v?token=t' })
    );
  });
});
