import { describe, expect, it } from 'vitest';
import { base32Decode, totp } from './totp.js';

describe('base32Decode', () => {
  it('decodes RFC 4648 test vectors', () => {
    expect(base32Decode('MZXW6===').toString('utf8')).toBe('foo');
    expect(base32Decode('MZXW6YTBOI======').toString('utf8')).toBe('foobar');
    expect(base32Decode('MY======').toString('utf8')).toBe('f');
  });

  it('tolerates whitespace and case', () => {
    expect(base32Decode('mzxw6===').toString('utf8')).toBe('foo');
    expect(base32Decode('MZ XW 6').toString('utf8')).toBe('foo');
  });
});

describe('totp', () => {
  // RFC 6238 Appendix B test vectors use a 20-byte ASCII secret "12345678901234567890",
  // which base32-encodes to GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ.
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('matches RFC 6238 vectors (SHA-1, 6 digits)', () => {
    expect(totp(secret, 59_000, 30, 6)).toBe('287082');
    expect(totp(secret, 1_111_111_109_000, 30, 6)).toBe('081804');
    expect(totp(secret, 1_111_111_111_000, 30, 6)).toBe('050471');
  });

  it('is stable within a 30s step and changes at the boundary', () => {
    expect(totp(secret, 1000, 30, 6)).toBe(totp(secret, 29_000, 30, 6));
    expect(totp(secret, 29_999, 30, 6)).not.toBe(totp(secret, 30_000, 30, 6));
  });

  it('always returns the requested number of digits', () => {
    for (const t of [0, 1, 59_000, 1_700_000_000_000]) {
      expect(totp(secret, t, 30, 6)).toMatch(/^\d{6}$/);
    }
  });
});
