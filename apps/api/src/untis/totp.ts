import { createHmac } from 'node:crypto';

/**
 * Minimal RFC 6238 TOTP (SHA-1, 6 digits, 30s step) — enough for WebUntis "app secret"
 * login. Implemented locally to avoid pulling in a dependency for ~30 lines of crypto.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decode a base32 string (padding tolerated) to a Buffer. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/**
 * Generate a TOTP code.
 * @param secret base32 shared secret
 * @param timeMs current time in ms (defaults to Date.now())
 * @param step seconds per code (default 30)
 * @param digits code length (default 6)
 */
export function totp(secret: string, timeMs: number = Date.now(), step = 30, digits = 6): string {
  const counter = Math.floor(timeMs / 1000 / step);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const key = base32Decode(secret);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * WebUntis' import-time logins use a fixed OTP rather than a real TOTP.
 * Anonymous sessions always use this value.
 */
export const ANONYMOUS_OTP = 100170;
