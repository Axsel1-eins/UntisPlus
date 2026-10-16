/**
 * Mod (plugin) model for Untis⁺.
 *
 * A mod is a small ES module that runs in the page and talks to the app through {@link ModApi}
 * (exposed at runtime as `window.UntisPlus`). Mods are **client-side only** and run with full app
 * privileges — there is deliberately no sandbox. Everything here is types (no runtime), so the
 * contract can be shared with the tutorials and future tooling.
 */

import type { Lesson, SubstitutionKind } from './types.js';
import type { Theme } from './theme.js';

/** Bump when the mod API changes in a backwards-incompatible way. */
export const MOD_API_VERSION = 1;

export type ModSource = 'builtin' | 'url' | 'inline';
export type ModStatus = 'enabled' | 'disabled' | 'error' | 'loading';

/** A persisted description of an installed mod. */
export interface ModManifest {
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  /** Highest API version the mod was written against. */
  apiVersion?: number;
  source: ModSource;
  /** For `source: 'url'` (or a bundled example). */
  url?: string;
  /** For `source: 'inline'`. */
  code?: string;
  enabled: boolean;
  /** Shipped example mods are listed but off by default. */
  example?: boolean;
}

/** A "before/after" substitution derived from the timetable, as shown in the substitutions view. */
export interface SubstitutionItem {
  lesson: Lesson;
  kind: SubstitutionKind;
}

/** Signature for a page/section renderer: fill a real DOM element, optionally return a cleanup. */
export type ModRender = (el: HTMLElement) => void | (() => void);

export interface ModNavItem {
  id: string;
  label: string;
  /** Icon name from the built-in icon set (e.g. `grid`, `bell`). */
  icon?: string;
  /** `nav` puts it in the bottom bar; `more` puts it in the "More" hub. Defaults to `more`. */
  placement?: 'nav' | 'more';
  render: ModRender;
}

export interface ModSettingsSection {
  id: string;
  title: string;
  render: ModRender;
}

export interface ModCommand {
  id: string;
  title: string;
  run: () => void;
}

export type ModEventName = 'ready' | 'session' | 'data' | 'theme' | 'changes';
export type ModEventHandler = (payload: unknown) => void;

/** The object passed to a mod's `setup(api)`. */
export interface ModApi {
  /** The API version this runtime implements. */
  readonly apiVersion: number;
  /** The running app version. */
  readonly appVersion: string;
  /** The id of the mod that owns this API object. */
  readonly id: string;
  /** Register a theme; it appears in the theme picker. Disposed on unload. */
  themes: { register(theme: Theme): void };
  /** Inject a CSS string; returns a disposer. */
  css: { add(css: string): () => void };
  /** Add a page + navigation entry. */
  nav: { add(item: ModNavItem): void };
  /** Add a deep-linkable page at `#/x/<path>`. */
  routes: { add(path: string, render: ModRender): void };
  /** Transform the timetable lessons after they load (pure `Lesson[] -> Lesson[]`). */
  lessons: { transform(fn: (lessons: Lesson[]) => Lesson[]): void };
  /** Transform the substitution list shown in the substitutions view. */
  substitutions: { transform(fn: (items: SubstitutionItem[]) => SubstitutionItem[]): void };
  /** Add a section to the settings screen. */
  settings: { add(section: ModSettingsSection): void };
  /** Add or override translation strings. */
  i18n: { add(lang: 'de' | 'en', strings: Record<string, unknown>): void };
  /** Add a command (shown in the "Commands" list on the Mods screen). */
  commands: { add(cmd: ModCommand): void };
  /** Namespaced, persisted key/value storage. */
  store: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
    remove(key: string): void;
  };
  /** Subscribe to app lifecycle events. */
  on(event: ModEventName, handler: ModEventHandler): () => void;
  ui: {
    /** Show a transient toast. */
    toast(message: string): void;
  };
  log(...args: unknown[]): void;
}

/** The object a mod passes to `UntisPlus.register(...)`. */
export interface UntisMod {
  id: string;
  name?: string;
  version?: string;
  author?: string;
  description?: string;
  apiVersion?: number;
  setup(api: ModApi): void | Promise<void>;
}

/** The global `window.UntisPlus` surface available to mods while they load. */
export interface UntisPlusGlobal {
  readonly apiVersion: number;
  readonly appVersion: string;
  register(mod: UntisMod): void;
}
