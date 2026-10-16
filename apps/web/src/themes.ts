import { useMemo, useSyncExternalStore } from 'react';
import {
  THEME_TOKEN_KEYS,
  isValidThemeToken,
  parseTheme,
  serializeTheme,
  themeCssVars,
  type Theme,
} from '@untisplus/shared';
import { BUILTIN_THEMES } from './themes/builtin.js';

/**
 * Theme registry + DOM application.
 *
 * Themes come from three places, in order: the built-ins, themes registered by enabled mods, and
 * the user's own saved themes. Exactly one is active at a time; it is applied as inline CSS
 * custom properties on `<html>` (which beat the `:root` / `[data-theme]` defaults in the
 * stylesheet). `system` is special: it follows the OS and applies the base light/dark theme.
 */

export const DEFAULT_THEME_ID = 'system';
export const SYSTEM_THEME_ID = 'system';

export const CUSTOM_KEY = 'up.custom_themes';
const LEGACY_CUSTOM_KEY = 'up.themes.custom';
const ACTIVE_KEY = 'up.themeId';
const LEGACY_KEY = 'up.theme';
const THEME_CSS_ID = 'up-theme-css';

/* ------------------------------- registry -------------------------------- */

let modThemes: Theme[] = [];
let customThemes: Theme[] = loadCustomThemes();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  for (const l of listeners) l();
}

export function subscribeThemes(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function themesVersion(): number {
  return version;
}

/** React hook: the full theme catalogue (built-in + mod + custom). */
export function useThemes(): Theme[] {
  const v = useSyncExternalStore(subscribeThemes, themesVersion, themesVersion);
  return useMemo(() => allThemes(), [v]);
}

export function allThemes(): Theme[] {
  return [...BUILTIN_THEMES, ...modThemes, ...customThemes];
}

export function builtinThemes(): Theme[] {
  return BUILTIN_THEMES;
}

export function customThemesList(): Theme[] {
  return customThemes;
}

export function getCustomThemes(): Theme[] {
  return customThemes;
}

export function getTheme(id: string): Theme | undefined {
  return allThemes().find((t) => t.id === id);
}

/** Called by the mod runtime when a mod registers a theme. Returns a disposer. */
export function registerModTheme(theme: Theme): () => void {
  const entry: Theme = { ...theme, builtin: false };
  modThemes = [...modThemes, entry];
  emit();
  return () => {
    modThemes = modThemes.filter((t) => t !== entry);
    emit();
  };
}

export function saveCustomTheme(theme: Theme): void {
  const entry: Theme = { ...theme, builtin: false };
  customThemes = [...customThemes.filter((t) => t.id !== entry.id), entry];
  persistCustomThemes();
  emit();
}

export function deleteCustomTheme(id: string): void {
  customThemes = customThemes.filter((t) => t.id !== id);
  persistCustomThemes();
  emit();
}

export function exportThemeAsJson(theme: Theme): string {
  return serializeTheme(theme);
}

export function importThemeFromJson(json: string): Theme {
  return parseTheme(json);
}

function loadCustomThemes(): Theme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY) ?? localStorage.getItem(LEGACY_CUSTOM_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    const out: Theme[] = [];
    for (const entry of arr) {
      try {
        out.push(parseTheme(entry));
      } catch {
        /* skip malformed saved theme */
      }
    }
    return out;
  } catch {
    return [];
  }
}

function persistCustomThemes(): void {
  try {
    const data = JSON.stringify(customThemes.map((t) => JSON.parse(serializeTheme(t))));
    localStorage.setItem(CUSTOM_KEY, data);
    localStorage.setItem(LEGACY_CUSTOM_KEY, data);
  } catch {
    /* ignore quota errors */
  }
}

/* ------------------------------ application ------------------------------ */

const appliedVars = new Set<string>();
const themeAppliedHandlers = new Set<(id: string) => void>();

export function onThemeApplied(fn: (id: string) => void): () => void {
  themeAppliedHandlers.add(fn);
  return () => themeAppliedHandlers.delete(fn);
}

function clearInlineVars(el: HTMLElement): void {
  for (const key of appliedVars) el.style.removeProperty(`--${key}`);
  appliedVars.clear();
}

function setRawCss(css: string): void {
  let style = document.getElementById(THEME_CSS_ID) as HTMLStyleElement | null;
  if (!css) {
    if (style) style.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = THEME_CSS_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

/** Apply an arbitrary theme object (used for live preview); `undefined` means the base mode. */
export function applyThemeObject(theme: Theme | undefined, mode: 'light' | 'dark'): void {
  const el = document.documentElement;
  clearInlineVars(el);
  el.dataset.theme = mode;
  if (theme) {
    for (const [name, value] of Object.entries(themeCssVars(theme.tokens))) {
      el.style.setProperty(name, value);
      appliedVars.add(name.slice(2));
    }
    setRawCss(theme.css ?? '');
  } else {
    setRawCss('');
  }
}

/** Apply the theme with the given id (or `system`). */
export function applyActiveTheme(themeId: string, prefersDark: boolean): void {
  const theme = themeId === SYSTEM_THEME_ID ? undefined : getTheme(themeId);
  const mode: 'light' | 'dark' = theme ? theme.mode : prefersDark ? 'dark' : 'light';
  applyThemeObject(theme, mode);
  for (const fn of themeAppliedHandlers) fn(themeId);
}

export function systemPrefersDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function initialThemeId(): string {
  try {
    const stored = localStorage.getItem(ACTIVE_KEY);
    if (stored) return stored;
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === 'light' || legacy === 'dark' || legacy === 'system') return legacy;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID;
}

export function persistActiveThemeId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Apply the stored theme as early as possible (before React renders) to avoid a flash. */
export function applyInitialTheme(): void {
  applyActiveTheme(initialThemeId(), systemPrefersDark());
}

/* ------------------------------- utilities ------------------------------- */

/** Read the *effective* value of every token from the live document (used to seed the editor). */
export function readComputedTokens(): Record<string, string> {
  const out: Record<string, string> = {};
  const cs = getComputedStyle(document.documentElement);
  for (const t of THEME_TOKEN_KEYS) {
    const value = cs.getPropertyValue(`--${t}`);
    if (value && value.trim()) out[t] = value.trim();
  }
  return out;
}

/**
 * Resolve what a set of token overrides would look like on top of a base mode, without disturbing
 * the current theme — by measuring a hidden probe element. Used for accurate theme-card previews
 * even when a theme only overrides a few tokens.
 */
export function computeTokensFor(
  mode: 'light' | 'dark',
  overrides: Record<string, string> = {},
): Record<string, string> {
  const probe = document.createElement('div');
  probe.setAttribute('data-theme', mode);
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden;';
  for (const [key, value] of Object.entries(overrides)) {
    if (isValidThemeToken(key)) probe.style.setProperty(`--${key}`, value);
  }
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out: Record<string, string> = {};
  for (const key of THEME_TOKEN_KEYS) {
    const value = cs.getPropertyValue(`--${key}`);
    if (value && value.trim()) out[key] = value.trim();
  }
  probe.remove();
  return out;
}

/* --------------------------- share-link helpers -------------------------- */

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
  const bin = atob(norm + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Build a shareable link that opens the Appearance screen with a theme pre-loaded. */
export function encodeThemeLink(theme: Theme): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/appearance?theme=${b64urlEncode(serializeTheme(theme))}`;
}

/** Decode the `?theme=` value of a share link. Returns `null` when invalid. */
export function decodeThemeParam(param: string): Theme | null {
  try {
    return parseTheme(b64urlDecode(param));
  } catch {
    return null;
  }
}
