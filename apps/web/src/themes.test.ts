import { describe, expect, it } from 'vitest';
import { serializeTheme, type Theme } from '@untisplus/shared';
import { decodeThemeParam } from './themes.js';

/**
 * Theme share-links are pure encode/decode around `serializeTheme`/`parseTheme`, so they can be
 * tested without a DOM. The encoder used by the app lives in `themes.ts` (`encodeThemeLink`) and
 * wraps this same base64url payload — mirrored here with `Buffer` to keep the test DOM-free.
 */
function encodeParam(theme: Theme): string {
  return Buffer.from(serializeTheme(theme), 'utf8').toString('base64url');
}

describe('theme share links', () => {
  it('round-trips a theme through the ?theme= param', () => {
    const theme: Theme = {
      id: 'nord',
      name: 'Nord',
      mode: 'dark',
      author: 'me',
      tokens: { bg: '#2e3440', accent: '#88c0d0', radius: '10px' },
    };

    const decoded = decodeThemeParam(encodeParam(theme));

    expect(decoded).not.toBeNull();
    expect(decoded).toMatchObject({ id: 'nord', name: 'Nord', mode: 'dark', author: 'me' });
    expect(decoded?.tokens).toEqual({ bg: '#2e3440', accent: '#88c0d0', radius: '10px' });
  });

  it('drops unknown tokens and keeps known ones', () => {
    const payload = Buffer.from(
      JSON.stringify({ name: 'X', tokens: { bg: '#fff', nope: '#000' } }),
      'utf8',
    ).toString('base64url');

    const decoded = decodeThemeParam(payload);

    expect(decoded?.name).toBe('X');
    expect(decoded?.tokens).toEqual({ bg: '#fff' });
  });

  it('returns null for garbage instead of throwing', () => {
    expect(decodeThemeParam('!!!not-base64!!!')).toBeNull();
    expect(decodeThemeParam(Buffer.from('{"nope":true}').toString('base64url'))).toBeNull();
  });
});
