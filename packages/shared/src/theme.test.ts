import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  hexToHsv,
  hsvToHex,
  hsvToRgb,
  isValidThemeToken,
  parseColor,
  parseTheme,
  rgbToHsv,
  serializeTheme,
  slugifyId,
  themeCssVars,
  wcagLevel,
} from './theme.js';

describe('parseTheme', () => {
  it('parses a well-formed theme', () => {
    const theme = parseTheme({
      id: 'nord',
      name: 'Nord',
      mode: 'dark',
      author: 'me',
      tokens: { bg: '#2e3440', accent: '#88c0d0' },
    });
    expect(theme.id).toBe('nord');
    expect(theme.mode).toBe('dark');
    expect(theme.tokens).toEqual({ bg: '#2e3440', accent: '#88c0d0' });
    expect(theme.author).toBe('me');
  });

  it('drops unknown token keys instead of breaking', () => {
    const theme = parseTheme({
      name: 'X',
      tokens: { bg: '#fff', 'not-a-token': '#000', accent: 42 },
    });
    expect(theme.tokens).toEqual({ bg: '#fff' });
  });

  it('generates an id when missing', () => {
    const theme = parseTheme({ name: 'My Cool Theme', tokens: {} });
    expect(theme.id).toBe('custom-my-cool-theme');
    expect(theme.mode).toBe('dark');
  });

  it('accepts a JSON string', () => {
    const theme = parseTheme('{"name":"From file","mode":"light","tokens":{"bg":"#fff"}}');
    expect(theme.name).toBe('From file');
    expect(theme.mode).toBe('light');
  });

  it('rejects junk', () => {
    expect(() => parseTheme('not json')).toThrow();
    expect(() => parseTheme({ mode: 'dark' })).toThrow(/name/i);
    expect(() => parseTheme(42)).toThrow();
  });

  it('round-trips through serializeTheme', () => {
    const theme = parseTheme({ id: 'a', name: 'A', mode: 'light', tokens: { bg: '#fff' } });
    expect(parseTheme(serializeTheme(theme))).toEqual(theme);
  });
});

describe('themeCssVars', () => {
  it('prefixes names and ignores invalid keys', () => {
    expect(themeCssVars({ bg: '#fff', nope: 'x' })).toEqual({ '--bg': '#fff' });
  });
});

describe('isValidThemeToken + slugifyId', () => {
  it('knows its tokens', () => {
    expect(isValidThemeToken('accent')).toBe(true);
    expect(isValidThemeToken('nope')).toBe(false);
  });
  it('slugs names', () => {
    expect(slugifyId('  Rosé Pine!! ')).toBe('rose-pine');
    expect(slugifyId('')).toBe('theme');
  });
});

describe('parseColor', () => {
  it('parses hex in all lengths', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#000000')).toEqual([0, 0, 0]);
    expect(parseColor('#ff0000ff')).toEqual([255, 0, 0]);
  });
  it('parses rgb()/rgba() and percentages', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseColor('rgba(10,20,30,0.5)')).toEqual([10, 20, 30]);
    expect(parseColor('rgb(100%, 0%, 0%)')).toEqual([255, 0, 0]);
  });
  it('parses hsl()', () => {
    expect(parseColor('hsl(0, 100%, 50%)')).toEqual([255, 0, 0]);
    expect(parseColor('hsl(0, 0%, 100%)')).toEqual([255, 255, 255]);
  });
  it('returns null for unsupported values', () => {
    expect(parseColor('var(--x)')).toBeNull();
    expect(parseColor('rebeccapurple')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('computes black on white as 21', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
  });
  it('computes white on white as 1', () => {
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
  it('returns null when a colour cannot be parsed', () => {
    expect(contrastRatio('var(--x)', '#fff')).toBeNull();
  });
});

describe('wcagLevel', () => {
  it('classifies thresholds', () => {
    expect(wcagLevel(21)).toBe('AAA');
    expect(wcagLevel(5)).toBe('AA');
    expect(wcagLevel(3.5, true)).toBe('AA-large');
    expect(wcagLevel(2)).toBe('fail');
  });
});

describe('HSV color helpers', () => {
  it('converts pure colors between RGB and HSV', () => {
    // Red
    expect(rgbToHsv([255, 0, 0])).toEqual({ h: 0, s: 100, v: 100 });
    // Green
    expect(rgbToHsv([0, 255, 0])).toEqual({ h: 120, s: 100, v: 100 });
    // Blue
    expect(rgbToHsv([0, 0, 255])).toEqual({ h: 240, s: 100, v: 100 });
    // Black
    expect(rgbToHsv([0, 0, 0])).toEqual({ h: 0, s: 0, v: 0 });
    // White
    expect(rgbToHsv([255, 255, 255])).toEqual({ h: 0, s: 0, v: 100 });
  });

  it('converts HSV back to RGB accurately', () => {
    expect(hsvToRgb({ h: 0, s: 100, v: 100 })).toEqual([255, 0, 0]);
    expect(hsvToRgb({ h: 120, s: 100, v: 100 })).toEqual([0, 255, 0]);
    expect(hsvToRgb({ h: 240, s: 100, v: 100 })).toEqual([0, 0, 255]);
  });

  it('round-trips hex through HSV', () => {
    const redHsv = hexToHsv('#ff0000');
    expect(hsvToHex(redHsv)).toBe('#ff0000');

    const blueHsv = hexToHsv('#0000ff');
    expect(hsvToHex(blueHsv)).toBe('#0000ff');
  });
});
