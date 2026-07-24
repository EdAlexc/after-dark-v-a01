import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecretBox } from '../crypto-box';

const KEY = 'test-key-material-with-plenty-of-entropy';

describe('SecretBox', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips plaintext', () => {
    const box = new SecretBox(KEY);
    const payload = box.encrypt('JBSWY3DPEHPK3PXP');
    expect(SecretBox.isEncrypted(payload)).toBe(true);
    expect(box.decrypt(payload)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('round-trips empty string and unicode', () => {
    const box = new SecretBox(KEY);
    expect(box.decrypt(box.encrypt(''))).toBe('');
    expect(box.decrypt(box.encrypt('пароль-🔐-秘密'))).toBe('пароль-🔐-秘密');
  });

  it('produces a fresh IV per encryption (no ciphertext reuse)', () => {
    const box = new SecretBox(KEY);
    expect(box.encrypt('same')).not.toBe(box.encrypt('same'));
  });

  it('fails to decrypt with a different key', () => {
    const a = new SecretBox(KEY);
    const b = new SecretBox('another-key-material-also-long-enough');
    const payload = a.encrypt('secret');
    expect(() => b.decrypt(payload)).toThrow(/decryption failed/);
  });

  it('detects tampering anywhere in the payload (GCM auth)', () => {
    const box = new SecretBox(KEY);
    const payload = box.encrypt('secret-value');
    const raw = Buffer.from(payload.slice(3), 'base64');
    for (const position of [0, 12, raw.length - 1]) {
      const tampered = Buffer.from(raw);
      tampered[position] ^= 0xff;
      expect(() => box.decrypt(`v1.${tampered.toString('base64')}`)).toThrow(/decryption failed/);
    }
  });

  it('rejects payloads without the version prefix (legacy plaintext)', () => {
    const box = new SecretBox(KEY);
    expect(() => box.decrypt('JBSWY3DPEHPK3PXP')).toThrow(/Not a SecretBox payload/);
    expect(SecretBox.isEncrypted('JBSWY3DPEHPK3PXP')).toBe(false);
    expect(SecretBox.isEncrypted(null)).toBe(false);
    expect(SecretBox.isEncrypted(undefined)).toBe(false);
  });

  it('rejects truncated payloads', () => {
    const box = new SecretBox(KEY);
    expect(() => box.decrypt('v1.AAAA')).toThrow(/truncated/);
  });

  it('rejects weak string keys and wrong-size binary keys', () => {
    expect(() => new SecretBox('short')).toThrow(/at least 16 characters/);
    expect(() => new SecretBox(Buffer.alloc(16))).toThrow(/exactly 32 bytes/);
    expect(new SecretBox(Buffer.alloc(32))).toBeInstanceOf(SecretBox);
  });

  it('fromEnv throws with a helpful message when unset, works when set', () => {
    vi.stubEnv('AUTH_SECRET_ENCRYPTION_KEY', '');
    expect(() => SecretBox.fromEnv()).toThrow(/openssl rand/);
    vi.stubEnv('AUTH_SECRET_ENCRYPTION_KEY', KEY);
    const box = SecretBox.fromEnv();
    expect(box.decrypt(box.encrypt('x'))).toBe('x');
  });
});
