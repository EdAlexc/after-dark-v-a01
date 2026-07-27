/**
 * SecretBox — authenticated encryption for secrets at rest
 * (TENANT_GUARDRAIL §5 A02, §4 G8).
 *
 * AES-256-GCM with a random 12-byte IV per message. Wire format:
 *
 *   v1.<base64(iv | authTag | ciphertext)>
 *
 * The key comes from `AUTH_SECRET_ENCRYPTION_KEY` (any high-entropy string;
 * it is SHA-256-derived to 32 bytes). Rotation strategy and a real KMS are
 * post-alpha; the format version prefix leaves room for both.
 */

import crypto from 'crypto';

const VERSION_PREFIX = 'v1.';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class SecretBox {
  private readonly key: Buffer;

  constructor(keyMaterial: string | Buffer) {
    if (typeof keyMaterial === 'string') {
      if (keyMaterial.trim().length < 16) {
        throw new Error('SecretBox key material must be at least 16 characters');
      }
      this.key = crypto.createHash('sha256').update(keyMaterial).digest();
    } else {
      if (keyMaterial.length !== 32) {
        throw new Error('SecretBox binary key must be exactly 32 bytes');
      }
      this.key = keyMaterial;
    }
  }

  /** Builds a box from an env var; throws when it is missing/weak. */
  static fromEnv(name = 'AUTH_SECRET_ENCRYPTION_KEY'): SecretBox {
    const material = process.env[name];
    if (!material) {
      throw new Error(`${name} is not set — generate one with: openssl rand -base64 32`);
    }
    return new SecretBox(material);
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return VERSION_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
  }

  decrypt(payload: string): string {
    if (!SecretBox.isEncrypted(payload)) {
      throw new Error('Not a SecretBox payload');
    }
    const raw = Buffer.from(payload.slice(VERSION_PREFIX.length), 'base64');
    if (raw.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('SecretBox payload is truncated');
    }
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      // Wrong key or tampered ciphertext — GCM auth failed.
      throw new Error('SecretBox decryption failed');
    }
  }

  /** True when `value` looks like a SecretBox payload (vs legacy plaintext). */
  static isEncrypted(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.startsWith(VERSION_PREFIX);
  }
}
