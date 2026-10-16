import { useSyncExternalStore } from 'react';
import {
  MOD_API_VERSION,
  type Lesson,
  type ModApi,
  type ModCommand,
  type ModEventName,
  type ModEventHandler,
  type ModManifest,
  type ModNavItem,
  type ModRender,
  type ModSettingsSection,
  type ModStatus,
  type SubstitutionItem,
  type UntisMod,
  type UntisPlusGlobal,
} from '@untisplus/shared';
import i18n from './i18n.js';
import { registerModTheme } from './themes.js';
import { toast } from './toast.js';
import { APP_VERSION } from './version.js';

/**
 * Mod runtime.
 *
 * Installs `window.UntisPlus`, loads enabled mods (from `/mods/*.js`, from a URL, or from an
 * inline snippet), and exposes the contributions React needs (nav entries, pages, settings,
 * commands, data transforms). Mods are trusted code: they run in the page with full privileges.
 */

const INSTALLED_KEY = 'up.mods';
const ENABLED_KEY = 'up.mod.enabled';

/** Example mods that ship with the app (served from `public/mods`). Off by default. */
export const EXAMPLE_MODS: ModManifest[] = [
  {
    id: 'untisplus.extra-themes',
    name: 'Extra themes',
    version: '1.0.0',
    author: 'Untis⁺',
    description: 'Adds three extra themes to the appearance picker.',
    source: 'builtin',
    url: '/mods/theme-pack.js',
    enabled: false,
    example: true,
  },
  {
    id: 'untisplus.hello',
    name: 'Hello page',
    author: 'Untis⁺',
    version: '1.0.0',
    description: 'Adds a custom page to the "More" hub.',
    source: 'builtin',
    url: '/mods/hello-page.js',
    enabled: false,
    example: true,
  },
  {
    id: 'untisplus.compact',
    name: 'Compact lessons',
    version: '1.0.0',
    author: 'Untis+',
    description: 'Hides free periods from the timetable with a lessons transform.',
    apiVersion: 1,
    source: 'builtin',
    url: '/mods/compact-lessons.js',
    enabled: false,
    example: true,
  },
  {
    id: 'untisplus.sticker',
    name: 'Sticker',
    version: '1.0.0',
    author: 'Untis+',
    description: 'Injects a CSS badge and greets you with a toast.',
    source: 'builtin',
    url: '/mods/sticker.js',
    enabled: false,
    example: true,
  },
];

/* ------------------------------- state ----------------------------------- */

interface Transform<T> {
  modId: string;
  fn: (input: T) => T;
}
interface RouteEntry {
  path: string;
  modId: string;
  render: ModRender;
}
interface NavEntry extends ModNavItem {
  modId: string;
}
interface SettingsEntry extends ModSettingsSection {
  modId: string;
}
interface CommandEntry extends ModCommand {
  modId: string;
}

interface ModRecord {
  manifest: ModManifest;
  status: ModStatus;
  error?: string;
  disposers: (() => void)[];
}

const records = new Map<string, ModRecord>();
const eventHandlers = new Map<string, Map<ModEventName, Set<ModEventHandler>>>();

let navItems: NavEntry[] = [];
let routes: RouteEntry[] = [];
let settingsSections: SettingsEntry[] = [];
let commands: CommandEntry[] = [];
let lessonTransforms: Transform<Lesson[]>[] = [];
let substitutionTransforms: Transform<SubstitutionItem[]>[] = [];

let installed: ModManifest[] = loadInstalled();
let enabledMap: Record<string, boolean> = loadEnabled();

const listeners = new Set<() => void>();
let version = 0;
let initialized = false;

function emitChange(): void {
  version += 1;
  for (const l of listeners) l();
}

export function subscribeMods(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function modsVersion(): number {
  return version;
}

/** React hook: re-render whenever the mod list or its contributions change. */
export function useModsVersion(): number {
  return useSyncExternalStore(subscribeMods, modsVersion, modsVersion);
}

/* ------------------------------ persistence ------------------------------ */

function loadInstalled(): ModManifest[] {
  try {
    const raw = localStorage.getItem('up.mods');
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(isManifest).map((m) => ({ ...m, source: m.source === 'inline' ? 'inline' : 'url' }));
  } catch {
    return [];
  }
}

function persistInstalled(): void {
  try {
    localStorage.setItem('up.mods', JSON.stringify(installed));
  } catch {
    /* ignore quota errors */
  }
}

function isManifest(value: unknown): value is ModManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return typeof m.id === 'string' && typeof m.name === 'string';
}

function loadEnabled(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('up.mod.enabled');
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

function persistEnabled(): void {
  try {
    localStorage.setItem('up.mod.enabled', JSON.stringify(enabledMap));
  } catch {
    /* ignore */
  }
}

function setEnabledValue(id: string, enabled: boolean): void {
  enabledMap = { ...enabledMap, [id]: enabled };
  persistEnabled();
}

/* ---------------------------- public accessors --------------------------- */

export interface ModView extends ModManifest {
  status: ModStatus;
  error?: string;
}

export function listMods(): ModView[] {
  const all = [...EXAMPLE_MODS.map((m) => withEnabled(m)), ...installed.map((m) => withEnabled(m))];
  return all.map((m) => {
    const record = records.get(m.id);
    return { ...m, status: record?.status ?? (m.enabled ? 'loading' : 'disabled'), error: record?.error };
  });
}

function withEnabled(m: ModManifest): ModManifest {
  const override = enabledMap[m.id];
  return { ...m, enabled: override ?? m.enabled };
}

export function getNavItems(): NavEntry[] {
  return navItems;
}
export function getModRoutes(): RouteEntry[] {
  return routes;
}
export function getSettingsSections(): SettingsEntry[] {
  return settingsSections;
}
export function getCommands(): CommandEntry[] {
  return commands;
}

/* -------------------- data pipelines used by the app --------------------- */

export function applyLessonTransforms(lessons: Lesson[]): Lesson[] {
  let out = lessons;
  for (const t of lessonTransforms) {
    try {
      out = t.fn(out);
    } catch (err) {
      console.error(`[mod:${t.modId}] lessons.transform failed`, err);
    }
  }
  return out;
}

export function applySubstitutionTransforms(items: SubstitutionItem[]): SubstitutionItem[] {
  let out = items;
  for (const t of substitutionTransforms) {
    try {
      out = t.fn(out);
    } catch (err) {
      console.error(`[mod:${t.modId}] substitutions.transform failed`, err);
    }
  }
  return out;
}

/* -------------------------------- events --------------------------------- */

export function emitModEvent(name: ModEventName, payload?: unknown): void {
  for (const set of eventHandlers.values()) {
    const handlers = set.get(name);
    if (!handlers) continue;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[mod] ${name} handler failed`, err);
      }
    }
  }
}

/* ------------------------------- loading --------------------------------- */

let currentLoadGuard: { manifest: ModManifest; def?: UntisMod } | null = null;

/**
 * Load a same-origin module with a `<script>` tag.
 *
 * Vite refuses to `import()` files from `public/`, so the bundled example mods (served from
 * `/mods/*.js`) are loaded natively instead. A mod loaded this way must call
 * `window.UntisPlus.register(...)`; the loader waits for exactly that.
 */
function loadModuleScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = url;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load module: ${url}`));
    };
    document.head.appendChild(script);
  });
}

/** True for same-origin http(s) URLs (e.g. the bundled `/mods/*.js`), excluding `blob:` sources. */
function isSameOriginScript(url: string): boolean {
  if (url.startsWith('blob:')) return false;
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

function installGlobal(): void {
  const global: UntisPlusGlobal = {
    apiVersion: MOD_API_VERSION,
    appVersion: APP_VERSION,
    register(mod: UntisMod) {
      if (!currentLoadGuard) {
        console.warn('[mods] register() called outside of a mod load; ignoring.');
        return;
      }
      currentLoadGuard.def = mod;
    },
  };
  (window as unknown as { UntisPlus: UntisPlusGlobal }).UntisPlus = global;
}

async function loadMod(manifest: ModManifest): Promise<void> {
  unloadMod(manifest.id, /* silent */ true);
  const disposers: (() => void)[] = [];
  const record: ModManifest = manifest;
  records.set(manifest.id, { manifest: record, status: 'loading', disposers });
  emitChange();

  const url = resolveUrl(manifest, disposers);
  if (!url) {
    records.set(manifest.id, { manifest: record, status: 'error', error: 'No source', disposers });
    emitChange();
    return;
  }

  try {
    currentLoadGuard = { manifest };
    let defaultDef: UntisMod | undefined;
    if (isSameOriginScript(url)) {
      await loadModuleScript(url);
    } else {
      const mod = (await import(/* @vite-ignore */ url)) as {
        default?: ((api: ModApi) => unknown | Promise<unknown>) | UntisMod;
      };
      const exported = mod.default;
      defaultDef =
        typeof exported === 'function'
          ? { id: manifest.id, setup: exported as (api: ModApi) => void }
          : (exported as UntisMod | undefined);
    }
    const captured = currentLoadGuard.def;
    currentLoadGuard = null;

    const def: UntisMod | undefined = captured ?? defaultDef;

    if (!def || typeof def.setup !== 'function') {
      throw new Error('Mod did not call UntisPlus.register({ setup }) and exports no default.');
    }
    if ((def.apiVersion ?? 1) > MOD_API_VERSION) {
      console.warn(
        `[mods] "${manifest.id}" targets API v${def.apiVersion}, but this app implements v${MOD_API_VERSION}.`,
      );
    }

    const api = createApi(manifest, disposers);
    await def.setup(api);
    records.set(manifest.id, { manifest: record, status: 'enabled', disposers });
    emitModEvent('ready', { id: manifest.id });
  } catch (err) {
    currentLoadGuard = null;
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch {
        /* ignore */
      }
    }
    removeContributions(manifest.id);
    records.set(manifest.id, {
      manifest: record,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      disposers,
    });
  }
  emitChange();
}

function resolveUrl(manifest: ModManifest, disposers: (() => void)[]): string | undefined {
  if (manifest.source === 'inline') {
    if (!manifest.code) return undefined;
    const blob = new Blob([manifest.code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    disposers.push(() => URL.revokeObjectURL(url));
    return url;
  }
  if (!manifest.url) return undefined;
  // Cache-bust so re-enabling a mod re-runs its registration.
  const sep = manifest.url.includes('?') ? '&' : '?';
  return `${manifest.url}${sep}upv=${Date.now()}`;
}

function unloadMod(id: string, silent = false): void {
  const record = records.get(id);
  if (!record) return;
  for (const d of record.disposers.splice(0)) {
    try {
      d();
    } catch {
      /* ignore */
    }
  }
  eventHandlers.delete(id);
  removeContributions(id);
  records.delete(id);
  if (!silent) emitChange();
}

function removeContributions(id: string): void {
  navItems = navItems.filter((n) => n.modId !== id);
  routes = routes.filter((r) => r.modId !== id);
  settingsSections = settingsSections.filter((s) => s.modId !== id);
  commands = commands.filter((c) => c.modId !== id);
  lessonTransforms = lessonTransforms.filter((t) => t.modId !== id);
  substitutionTransforms = substitutionTransforms.filter((t) => t.modId !== id);
  emitChange();
}

/* -------------------------------- the API -------------------------------- */

function createApi(manifest: ModManifest, disposers: (() => void)[]): ModApi {
  const id = manifest.id;
  const push = (disposer: () => void) => disposers.push(disposer);

  return {
    apiVersion: MOD_API_VERSION,
    appVersion: APP_VERSION,
    id,

    themes: {
      register(theme) {
        push(registerModTheme(theme));
      },
    },

    css: {
      add(css) {
        const style = document.createElement('style');
        style.dataset.mod = id;
        style.textContent = css;
        document.head.appendChild(style);
        const dispose = () => style.remove();
        push(dispose);
        return dispose;
      },
    },

    nav: {
      add(item) {
        const entry: NavEntry = { ...item, id: item.id, modId: id };
        navItems = [...navItems, entry];
        emitChange();
        push(() => {
          navItems = navItems.filter((n) => n !== entry);
          emitChange();
        });
      },
    },

    routes: {
      add(path, render) {
        const entry: RouteEntry = { path, modId: id, render };
        routes = [...routes, entry];
        emitChange();
        push(() => {
          routes = routes.filter((r) => r !== entry);
          emitChange();
        });
      },
    },

    lessons: {
      transform(fn) {
        const entry: Transform<Lesson[]> = { modId: id, fn };
        lessonTransforms = [...lessonTransforms, entry];
        push(() => {
          lessonTransforms = lessonTransforms.filter((t) => t !== entry);
        });
      },
    },

    substitutions: {
      transform(fn) {
        const entry: Transform<SubstitutionItem[]> = { modId: id, fn };
        substitutionTransforms = [...substitutionTransforms, entry];
        push(() => {
          substitutionTransforms = substitutionTransforms.filter((t) => t !== entry);
        });
      },
    },

    settings: {
      add(section) {
        const entry: SettingsEntry = { ...section, modId: id };
        settingsSections = [...settingsSections, entry];
        emitChange();
        push(() => {
          settingsSections = settingsSections.filter((s) => s !== entry);
          emitChange();
        });
      },
    },

    i18n: {
      add(lang, strings) {
        i18n.addResourceBundle(lang, 'translation', strings, true, true);
      },
    },

    commands: {
      add(cmd) {
        const entry: CommandEntry = { ...cmd, modId: id };
        commands = [...commands, entry];
        emitChange();
        push(() => {
          commands = commands.filter((c) => c !== entry);
          emitChange();
        });
      },
    },

    store: {
      get<T>(key: string, fallback: T): T {
        try {
          const raw = localStorage.getItem(`up.mod.${id}.${key}`);
          return raw ? (JSON.parse(raw) as T) : fallback;
        } catch {
          return fallback;
        }
      },
      set(key: string, value: unknown): void {
        try {
          localStorage.setItem(`up.mod.${id}.${key}`, JSON.stringify(value));
        } catch {
          /* ignore */
        }
      },
      remove(key: string): void {
        try {
          localStorage.removeItem(`up.mod.${id}.${key}`);
        } catch {
          /* ignore */
        }
      },
    },

    on(event: ModEventName, handler: ModEventHandler): () => void {
      let set = eventHandlers.get(id);
      if (!set) {
        set = new Map();
        eventHandlers.set(id, set);
      }
      let handlers = set.get(event);
      if (!handlers) {
        handlers = new Set();
        set.set(event, handlers);
      }
      handlers.add(handler);
      const dispose = () => handlers?.delete(handler);
      push(dispose);
      return dispose;
    },

    ui: { toast },

    log(...args: unknown[]) {
      console.log(`[mod:${id}]`, ...args);
    },
  };
}

/* ------------------------ management (Mods screen) ----------------------- */

export async function initMods(): Promise<void> {
  if (initialized) return;
  initialized = true;
  installGlobal();
  const enabled = [...EXAMPLE_MODS.map(withEnabled), ...installed.map(withEnabled)].filter((m) => m.enabled);
  await Promise.all(enabled.map((m) => loadMod(m)));
}

export interface InstallInput {
  name: string;
  url?: string;
  code?: string;
  author?: string;
  version?: string;
  description?: string;
}

export async function installMod(input: InstallInput): Promise<void> {
  const source: ModManifest['source'] = input.code ? 'inline' : 'url';
  const id = `user.${(input.name || input.url || 'mod')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32)}`;
  const manifest: ModManifest = {
    id,
    name: input.name || id,
    source,
    enabled: true,
    url: input.url,
    code: input.code,
    author: input.author,
    version: input.version,
    description: input.description,
  };
  installed = [...installed.filter((m) => m.id !== id), manifest];
  persistInstalled();
  setEnabledValue(id, true);
  await loadMod(manifest);
}

export async function setModEnabled(id: string, enabled: boolean): Promise<void> {
  setEnabledValue(id, enabled);
  const manifest = [...EXAMPLE_MODS, ...installed].find((m) => m.id === id);
  if (!manifest) return;
  if (enabled) await loadMod(withEnabled(manifest));
  else unloadMod(id);
  emitChange();
}

export function removeMod(id: string): void {
  unloadMod(id);
  installed = installed.filter((m) => m.id !== id);
  persistInstalled();
  const { [id]: _removed, ...rest } = enabledMap;
  enabledMap = rest;
  persistEnabled();
  emitChange();
}

export async function reloadMod(id: string): Promise<void> {
  const manifest = [...EXAMPLE_MODS, ...installed].find((m) => m.id === id);
  if (manifest && withEnabled(manifest).enabled) await loadMod(withEnabled(manifest));
}
