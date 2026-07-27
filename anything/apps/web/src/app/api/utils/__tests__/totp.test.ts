import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  generateTotp,
  generateTotpSecret,
  verifyTotp,
} from '../totp';

/** RFC 6238 Appendix B secret: ASCII "12345678901234567890". */
const RFC_SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 128, 7]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it('decodes the RFC secret to its ASCII bytes', () => {
    expect(base32Decode(RFC_SECRET_B32).toString('utf8')).toBe('12345678901234567890');
  });

  it('ignores padding, case, and separator noise', () => {
    const canonical = base32Decode(RFC_SECRET_B32);
    expect(base32Decode(RFC_SECRET_B32.toLowerCase())).toEqual(canonical);
    expect(base32Decode(`${RFC_SECRET_B32}====`)).toEqual(canonical);
    expect(base32Decode(RFC_SECRET_B32.replace(/(.{4})/g, '$1 '))).toEqual(canonical);
  });

  it('returns empty buffer for fully invalid input', () => {
    expect(base32Decode('!!!!')).toEqual(Buffer.alloc(0));
  });
});

describe('generateTotp — RFC 6238 SHA-1 vectors (truncated to 6 digits)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('at T=%d produces %s', (atSeconds, expected) => {
    expect(generateTotp(RFC_SECRET_B32, { atSeconds })).toBe(expected);
  });

  it('throws when the secret decodes to nothing', () => {
    expect(() => generateTotp('!!!!')).toThrow(/zero bytes/);
  });
});

describe('verifyTotp', () => {
  const at = 1_700_000_000; // arbitrary fixed clock

  it('accepts the current-step token', () => {
    const token = generateTotp(RFC_SECRET_B32, { atSeconds: at });
    expect(verifyTotp(RFC_SECRET_B32, token, { atSeconds: at })).toBe(true);
  });

  it('accepts previous and next step within the ±1 window (clock drift)', () => {
    const prev = generateTotp(RFC_SECRET_B32, { atSeconds: at - 30 });
    const next = generateTotp(RFC_SECRET_B32, { atSeconds: at + 30 });
    expect(verifyTotp(RFC_SECRET_B32, prev, { atSeconds: at })).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, next, { atSeconds: at })).toBe(true);
  });

  it('rejects tokens two steps away', () => {
    const stale = generateTotp(RFC_SECRET_B32, { atSeconds: at - 60 });
    const future = generateTotp(RFC_SECRET_B32, { atSeconds: at + 60 });
    expect(verifyTotp(RFC_SECRET_B32, stale, { atSeconds: at })).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, future, { atSeconds: at })).toBe(false);
  });

  it.each([
    ['too short', '12345'],
    ['too long', '1234567'],
    ['non-numeric', '12a456'],
    ['empty', ''],
    ['whitespace', '      '],
    ['negative-looking', '-12345'],
  ])('rejects malformed token: %s', (_label, token) => {
    expect(verifyTotp(RFC_SECRET_B32, token, { atSeconds: at })).toBe(false);
  });

  it('rejects a valid-format token generated from a different secret', () => {
    const other = generateTotpSecret();
    const token = generateTotp(other, { atSeconds: at });
    // Astronomically unlikely to collide with the RFC secret's token.
    if (token !== generateTotp(RFC_SECRET_B32, { atSeconds: at })) {
      expect(verifyTotp(RFC_SECRET_B32, token, { atSeconds: at })).toBe(false);
    }
  });
});

describe('generateTotpSecret / buildOtpauthUrl', () => {
  it('produces a 32-char base32 secret (160 bits)', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret).length).toBe(20);
  });

  it('produces distinct secrets per call', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });

  it('builds a scannable otpauth URL with encoded label', () => {
    const url = buildOtpauthUrl('dj+night@example.com', 'ABC234');
    expect(url).toBe(
      'otpauth://totp/AfterDark%3Adj%2Bnight%40example.com?secret=ABC234&issuer=AfterDark'
    );
  });
});
