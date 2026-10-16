# Mod API reference (v1)

The single entry point is the global `window.UntisPlus`. This document is the contract; it is
mirrored by TypeScript types in `@untisplus/shared` (`packages/shared/src/mod.ts`).

> ⚠️ Mods are **trusted code** and run with full app privileges. There is no sandbox.

## `UntisPlus` (global)

```ts
interface UntisPlusGlobal {
  readonly apiVersion: number; // 1
  readonly appVersion: string; // e.g. "0.1.0"
  register(mod: UntisMod): void;
}
```

Call `register` once from a mod module. It is only valid during a mod load (the runtime is
waiting for it); calling it later logs a warning and is ignored.

### `UntisMod`

```ts
interface UntisMod {
  id: string;            // required, unique
  name?: string;
  version?: string;
  author?: string;
  description?: string;
  apiVersion?: number;   // the API version you target (default 1)
  setup(api: ModApi): unknown | Promise<unknown>;
}
```

`setup` may be async. `await`ed values are ignored.

## `ModApi` — the object passed to `setup`

### Identity

| Member | Type | Notes |
| --- | --- | --- |
| `api.apiVersion` | `number` | Runtime API version (1). |
| `api.appVersion` | string | Running app version. |
| `api.id` | string | Your mod's id (for storage/logging). |

### `api.themes`

```ts
themes: { register(theme: Theme): void };
```

Registers a theme, which appears in **Appearance**. Disposed on unload. See
[making-a-theme.md](making-a-theme.md) for the `Theme` shape.

### `api.css`

```ts
css: { add(css: string): () => void };
```

Injects a `<style>` element. Returns a disposer (also auto-disposed on unload).

### `api.nav`

```ts
nav: {
  add(item: {
    id: string;
    label: string;
    icon?: string;                 // built-in icon name
    placement?: 'nav' | 'more';    // default 'more'
    render: (el: HTMLElement) => void | (() => void);
  }): void;
}
```

Adds a page reachable at `#/x/<id>` plus a nav entry (`nav` = bottom bar, `more` = More hub).
`render` returns an optional cleanup run on unmount.

### `api.routes`

```ts
routes: { add(path: string, render: (el: HTMLElement) => void | (() => void)): void };
```

Adds a page at `#/x/<path>` **without** a nav entry. Useful for sub-pages and deep links.

### `api.lessons`

```ts
lessons: { transform(fn: (lessons: Lesson[]) => Lesson[]): void };
```

Registers a pure transform applied to every loaded timetable. Runs in registration order.

### `api.substitutions`

```ts
substitutions: { transform(fn: (items: SubstitutionItem[]) => SubstitutionItem[]): void };
```

Registers a pure transform for the substitutions view.

### `api.settings`

```ts
settings: { add(section: { id: string; title: string; render: (el: HTMLElement) => void | (() => void) }): void };
```

Adds a titled panel to the More/Settings screen.

### `api.i18n`

```ts
i18n: { add(lang: 'de' | 'en', strings: Record<string, unknown>): void };
```

Deep-merges translation strings into the app's resource bundles.

### `api.commands`

```ts
commands: { add(cmd: { id: string; title: string; run: () => void }): void };
```

Adds a runnable action, listed under **Commands** on the Mods screen.

### `api.store`

```ts
store: {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  remove(key: string): void;
};
```

Namespaced, persisted (`localStorage` key `up.mod.<id>.<key>`). Values are JSON-serialized.

### `api.on`

```ts
on(event: ModEventName, handler: (payload: unknown) => void): () => void;
type ModEventName = 'ready' | 'session' | 'data' | 'theme' | 'changes';
```

Returns a disposer.

| Event | Payload |
| --- | --- |
| `ready` | `{ id: string }` |
| `session` | session object, or `null` |
| `data` | `{ target, lessons: Lesson[] }` |
| `theme` | `string` (active theme id) |
| `changes` | `LessonChange[]` |

### `api.ui`

```ts
ui: { toast(message: string): void };
```

Shows a non-blocking toast.

### `api.log`

```ts
log(...args: unknown[]): void;
```

Console log prefixed with `[mod:<id>]`.

## Data types (subset)

```ts
type LessonStatus = 'REGULAR' | 'CANCELLED' | 'IRREGULAR' | 'FREE' | 'EXAM';

type SubstitutionKind =
  | 'CANCELLED' | 'ROOM_CHANGE' | 'TEACHER_CHANGE' | 'SUBJECT_CHANGE'
  | 'MOVED' | 'ADDED' | 'FREE' | 'OTHER';

interface Ref { id: number; name: string; longName?: string }

interface Lesson {
  id: number;
  date: string;        // "YYYY-MM-DD" (school-local)
  start: number;       // minutes since midnight
  end: number;         // minutes since midnight
  status: LessonStatus;
  subjects?: Ref[];
  teachers?: Ref[];
  rooms?: Ref[];
  klassen?: Ref[];
  info?: string;
  // …additional fields are preserved
}

interface SubstitutionItem { lesson: Lesson; kind: SubstitutionKind }
```

Theme types live in `@untisplus/shared` (`Theme`, `THEME_TOKENS`, `parseTheme`, `serializeTheme`,
`contrastRatio`, `wcagLevel`).

## Versioning

- `apiVersion` is **additive-only**. New methods may be added; existing ones won't break.
- If you target a higher version than the app implements, the app warns and still tries to load
  you.
- Check `UntisPlus.apiVersion` if you must branch.

## Guarantees

- The app keeps working if your mod throws; your contributions are rolled back and the error is
  shown on the Mods screen.
- Contributions are disposed automatically when a mod is disabled or reloaded.
- Unknown theme tokens are ignored, so themes can't corrupt the app.
