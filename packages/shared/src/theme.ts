/**
 * Theme model for Untis⁺.
 *
 * A theme is just data: a set of CSS custom-property values plus a light/dark mode. Keeping the
 * model pure (no DOM, no React) means it can be validated on the server, unit-tested, and shared
 * between the app and its mods.
 */

export type ThemeMode = 'light' | 'dark';
export type ThemeTokenKind = 'color' | 'length' | 'font';
export type ThemeTokenGroup = 'colors' | 'shape' | 'type';

export interface ThemeTokenDef {
  /** CSS custom-property name without the leading `--`. */
  key: string;
  /** Human label, used by the theme editor. */
  label: string;
  group: ThemeTokenGroup;
  kind: ThemeTokenKind;
}

/** Every token a theme may override. */
export const THEME_TOKENS: readonly ThemeTokenDef[] = [
  { key: 'bg', label: 'Background', group: 'colors', kind: 'color' },
  { key: 'surface', label: 'Surface', group: 'colors', kind: 'color' },
  { key: 'surface-2', label: 'Surface (raised)', group: 'colors', kind: 'color' },
  { key: 'surface-3', label: 'Surface (deep)', group: 'colors', kind: 'color' },
  { key: 'text', label: 'Text', group: 'colors', kind: 'color' },
  { key: 'muted', label: 'Muted text', group: 'colors', kind: 'color' },
  { key: 'border', label: 'Border', group: 'colors', kind: 'color' },
  { key: 'accent', label: 'Accent', group: 'colors', kind: 'color' },
  { key: 'accent-ink', label: 'On accent', group: 'colors', kind: 'color' },
  { key: 'accent-soft', label: 'Accent (soft)', group: 'colors', kind: 'color' },
  { key: 'ok', label: 'Success', group: 'colors', kind: 'color' },
  { key: 'ok-soft', label: 'Success (soft)', group: 'colors', kind: 'color' },
  { key: 'warn', label: 'Warning', group: 'colors', kind: 'color' },
  { key: 'warn-soft', label: 'Warning (soft)', group: 'colors', kind: 'color' },
  { key: 'danger', label: 'Danger', group: 'colors', kind: 'color' },
  { key: 'danger-soft', label: 'Danger (soft)', group: 'colors', kind: 'color' },
  { key: 'radius', label: 'Corner radius', group: 'shape', kind: 'length' },
  { key: 'radius-sm', label: 'Small radius', group: 'shape', kind: 'length' },
  { key: 'radius-lg', label: 'Large radius', group: 'shape', kind: 'length' },
  { key: 'font', label: 'Font family', group: 'type', kind: 'font' },
] as const;

export const THEME_TOKEN_KEYS: readonly string[] = THEME_TOKENS.map((t) => t.key);

export function isValidThemeToken(key: string): boolean {
  return THEME_TOKEN_KEYS.includes(key);
}

/** A complete, self-contained look. `tokens` may be partial; the rest falls back to the base. */
export interface Theme {
  /** Stable, unique id, e.g. `nord` or `custom-my-theme`. */
  id: string;
  name: string;
  mode: ThemeMode;
  author?: string;
  description?: string;
  /** True for themes that ship with the app. */
  builtin?: boolean;
  /** CSS custom-property values, keyed **without** the leading `--`. */
  tokens: Record<string, string>;
  /** Optional raw CSS injected while this theme is active (for advanced themes). */
  css?: string;
}

export class ThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThemeError';
  }
}

/** Turn a human name into a slug suitable for an id. */
export function slugifyId(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return base || 'theme';
}

/** Map a theme's tokens to real CSS variable names (`accent` -> `--accent`). */
export function themeCssVars(tokens: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (isValidThemeToken(key) && typeof value === 'string' && value.trim()) {
      out[`--${key}`] = value.trim();
    }
  }
  return out;
}

/**
 * Validate and normalize untrusted theme input (file, URL, mod or localStorage). Unknown token
 * keys are dropped, so a typo can never break the app. Throws {@link ThemeError} when the input
 * is unusable.
 */
export function parseTheme(input: unknown): Theme {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new ThemeError('Theme is not valid JSON.');
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ThemeError('Theme must be a JSON object.');
  }
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name) throw new ThemeError('Theme is missing a name.');

  const idRaw = typeof o.id === 'string' ? o.id.trim() : '';
  const theme: Theme = {
    id: idRaw || `custom-${slugifyId(name)}`,
    name,
    mode: o.mode === 'light' ? 'light' : 'dark',
    tokens: {},
  };

  const tokensIn =
    o.tokens && typeof o.tokens === 'object' && !Array.isArray(o.tokens)
      ? (o.tokens as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(tokensIn)) {
    if (isValidThemeToken(key) && typeof value === 'string' && value.trim()) {
      theme.tokens[key] = value.trim();
    }
  }

  if (typeof o.author === 'string' && o.author.trim()) theme.author = o.author.trim();
  if (typeof o.description === 'string' && o.description.trim()) theme.description = o.description.trim();
  if (typeof o.css === 'string' && o.css.trim()) theme.css = o.css.trim();

  return theme;
}

/** Pretty-print a theme for export/download. */
export function serializeTheme(theme: Theme): string {
  const clean: Record<string, unknown> = { id: theme.id, name: theme.name, mode: theme.mode };
  if (theme.author) clean.author = theme.author;
  if (theme.description) clean.description = theme.description;
  clean.tokens = theme.tokens;
  if (theme.css) clean.css = theme.css;
  return JSON.stringify(clean, null, 2);
}

/* -------------------------------------------------------------------------- */
/*  Colour + contrast helpers (power the theme editor's accessibility meter)  */
/* -------------------------------------------------------------------------- */

export type Rgb = [number, number, number];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

/**
 * Parse a CSS colour into RGB. Supports `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()`
 * and `hsl()/hsla()`. Returns `null` for anything else (e.g. `var(--x)` or named colours).
 */
export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  if (s.startsWith('#')) {
    const hex = s.slice(1);
    const pair = (i: number) => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (/^[0-9a-f]{3}$/.test(hex) || /^[0-9a-f]{4}$/.test(hex)) {
      const d = (c: string) => parseInt(c + c, 16);
      return [d(hex[0]!), d(hex[1]!), d(hex[2]!)];
    }
    if (/^[0-9a-f]{6}$/.test(hex) || /^[0-9a-f]{8}$/.test(hex)) {
      return [pair(0), pair(1), pair(2)];
    }
    return null;
  }

  const rgbM = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgbM) {
    const parts = rgbM[1]!
      .split(/[,\s/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((p) => (p.endsWith('%') ? Math.round((parseFloat(p) / 100) * 255) : parseFloat(p)));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      return [
        clamp(Math.round(parts[0]!), 0, 255),
        clamp(Math.round(parts[1]!), 0, 255),
        clamp(Math.round(parts[2]!), 0, 255),
      ];
    }
    return null;
  }

  const hslM = s.match(/^hsla?\(([^)]+)\)$/);
  if (hslM) {
    const parts = hslM[1]!.split(/[,\s/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const hueDeg = parseFloat(parts[0]!);
      const sat = clamp(parseFloat(parts[1]!) / 100, 0, 1);
      const li = clamp(parseFloat(parts[2]!) / 100, 0, 1);
      if (![hueDeg, sat, li].every((n) => Number.isFinite(n))) return null;
      if (sat === 0) {
        const v = Math.round(li * 255);
        return [v, v, v];
      }
      const h = (((hueDeg % 360) + 360) % 360) / 360;
      const q = li < 0.5 ? li * (1 + sat) : li + sat - li * sat;
      const p = 2 * li - q;
      return [
        Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
        Math.round(hueToRgb(p, q, h) * 255),
        Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
      ];
    }
    return null;
  }

  return null;
}

/** WCAG relative luminance of a colour. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two CSS colours (1..21), or `null` if either can't be parsed. */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export type WcagLevel = 'AAA' | 'AA' | 'AA-large' | 'fail';

/** Classify a contrast ratio using WCAG 2.1 thresholds. */
export function wcagLevel(ratio: number, large = false): WcagLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (large && ratio >= 3) return 'AA-large';
  return 'fail';
}

/* -------------------------------------------------------------------------- */
/*  HSV (Hue, Saturation, Value) Color Helpers                                */
/* -------------------------------------------------------------------------- */

export interface Hsv {
  /** 0 to 360 */
  h: number;
  /** 0 to 100 */
  s: number;
  /** 0 to 100 */
  v: number;
}

export function rgbToHsv([r, g, b]: Rgb): Hsv {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const diff = max - min;

  let h = 0;
  if (diff === 0) {
    h = 0;
  } else if (max === rNorm) {
    h = (60 * ((gNorm - bNorm) / diff) + 360) % 360;
  } else if (max === gNorm) {
    h = (60 * ((bNorm - rNorm) / diff) + 120) % 360;
  } else {
    h = (60 * ((rNorm - gNorm) / diff) + 240) % 360;
  }

  const s = max === 0 ? 0 : (diff / max) * 100;
  const v = max * 100;

  return {
    h: Math.round(h),
    s: Math.round(s),
    v: Math.round(v),
  };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = Math.min(100, Math.max(0, s)) / 100;
  const vNorm = Math.min(100, Math.max(0, v)) / 100;

  const c = vNorm * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = vNorm - c;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hNorm < 60) {
    rPrime = c;
    gPrime = x;
    bPrime = 0;
  } else if (hNorm < 120) {
    rPrime = x;
    gPrime = c;
    bPrime = 0;
  } else if (hNorm < 180) {
    rPrime = 0;
    gPrime = c;
    bPrime = x;
  } else if (hNorm < 240) {
    rPrime = 0;
    gPrime = x;
    bPrime = c;
  } else if (hNorm < 300) {
    rPrime = x;
    gPrime = 0;
    bPrime = c;
  } else {
    rPrime = c;
    gPrime = 0;
    bPrime = x;
  }

  return [
    Math.round((rPrime + m) * 255),
    Math.round((gPrime + m) * 255),
    Math.round((bPrime + m) * 255),
  ];
}

export function hsvToHex(hsv: Hsv): string {
  const [r, g, b] = hsvToRgb(hsv);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToHsv(hex: string): Hsv {
  const rgb = parseColor(hex);
  if (!rgb) return { h: 0, s: 0, v: 100 };
  return rgbToHsv(rgb);
}
