# Make a mod

This is the hands-on guide. By the end you'll have a mod that adds a page, styles the app, and
reacts to data. If you only want the method-by-method reference, jump to
[mod-api.md](mod-api.md).

## 1. The shape of a mod

A mod is an **ES module** that calls `window.UntisPlus.register(...)` exactly once:

```js
UntisPlus.register({
  id: 'com.example.my-first-mod', // unique, reverse-DNS style is a good habit
  name: 'My first mod',
  version: '1.0.0',
  author: 'your name',
  apiVersion: 1, // the Untis+ mod API version you target
  setup(api) {
    // make contributions here
  },
});
```

- `id` must be unique. It namespaces your storage and identifies the mod on the Mods screen.
- `setup(api)` is called once, after the app is ready.
- Return value is ignored (but the API returns disposers — see §7).

> There is also a convenience form: a module with a **default export** function is treated as
> `setup`. The `UntisPlus.register` form is preferred because it carries metadata.

### Icon names

Wherever an `icon` is accepted, use one of the built-in names:
`today`, `calendar`, `bell`, `more`, `refresh`, `search`, `close`, `check`, `sun`, `moon`,
`monitor`, `download`, `user`, `book`, `alert`, `plus`, `filter`, `grid`, `mail`, `clipboard`,
`gradCap`, `clock`, `mapPin`, `logout`, `puzzle`, `palette`, `link`, `share`, `trash`, `pencil`.

## 2. A page + a nav entry

`api.nav.add` registers a page and a place to reach it. The page lives at `#/x/<id>`.

```js
api.nav.add({
  id: 'com.example.my-first-mod.page',
  label: 'My page',
  icon: 'grid',
  placement: 'more', // 'more' (default) → More hub; 'nav' → bottom bar
  render(el) {
    el.innerHTML = '<h1 class="page-title">My page</h1><p class="muted">Hello!</p>';
  },
});
```

- `render(el)` receives a real DOM element. Fill it however you like (plain DOM, or mount a
  framework). Return a **cleanup** function if you started timers/listeners:

```js
render(el) {
  const id = setInterval(() => { el.textContent = new Date().toLocaleTimeString(); }, 1000);
  el.textContent = new Date().toLocaleTimeString();
  return () => clearInterval(id); // called when the page unmounts
}
```

If you want a page **without** a nav entry (e.g. linked from another page), use
`api.routes.add('path', render)` and link to `#/x/path`.

## 3. Styling: CSS and themes

Inject CSS with `api.css.add`. It returns a disposer and is automatically removed when the mod
unloads:

```js
const remove = api.css.add(`
  .appbar { box-shadow: 0 1px 0 var(--border); }
  .my-badge { color: var(--accent); font-weight: 700; }
`);
```

Prefer the app's CSS custom properties (`var(--accent)`, `var(--surface)`, …) so your styling
respects the user's theme. To ship a whole theme, use `api.themes.register` — see
[making-a-theme.md](making-a-theme.md).

## 4. Reshaping the data

Two **pure** transforms let you change what the timetable and substitutions screens show.
They receive the loaded data and return a new array:

```js
// Drop free periods everywhere lessons are shown.
api.lessons.transform((lessons) => lessons.filter((l) => l.status !== 'FREE'));

// Mark the first lesson of the day.
api.lessons.transform((lessons) => lessons.map((l, i) => (i === 0 ? { ...l, note: 'First!' } : l)));

// In the substitutions screen, drop items you don't care about.
api.substitutions.transform((items) => items.filter((i) => i.kind !== 'FREE'));
```

Transforms run on every render pass, in registration order, and are cheap to re-run. Keep them
pure — never mutate the input array in place.

### Lesson fields you can rely on

Each `Lesson` has (among others): `id`, `date` (`"YYYY-MM-DD"`), `start`/`end`
(minutes since midnight), `status` (`'REGULAR' | 'CANCELLED' | 'IRREGULAR' | 'FREE' | 'EXAM'`),
`subjects`, `teachers`, `rooms` (arrays of `{ id, name }`), `klassen`, `info`.

A substitution item is `{ lesson, kind }`, where `kind` is one of `'CANCELLED'`,
`'ROOM_CHANGE'`, `'TEACHER_CHANGE'`, `'SUBJECT_CHANGE'`, `'MOVED'`, `'ADDED'`, `'FREE'`,
`'OTHER'`.

## 5. Settings, commands, translations

```js
// A panel on the More/Settings screen.
api.settings.add({
  id: 'com.example.my-first-mod.settings',
  title: 'My settings',
  render(el) {
    el.innerHTML = '<label class="row"><input type="checkbox" id="x"> Do the thing</label>';
    const box = el.querySelector('#x');
    box.checked = api.store.get('enabled', false);
    box.addEventListener('change', () => api.store.set('enabled', box.checked));
  },
});

// A runnable action, listed under "Commands" on the Mods screen.
api.commands.add({
  id: 'com.example.my-first-mod.say-hi',
  title: 'Say hi',
  run: () => api.ui.toast('hi 👋'),
});

// Add/override translations (merged into the app's bundles).
api.i18n.add('de', { myFirstMod: { hello: 'Hallo aus meinem Mod!' } });
api.i18n.add('en', { myFirstMod: { hello: 'Hello from my mod!' } });
// Then in a renderer: translate by calling the global i18n through your own helper, or just
// render localized strings directly.
```

`api.store` is namespaced and persisted:

```js
api.store.set('count', 3);      // writes localStorage "up.mod.<id>.count"
api.store.get('count', 0);      // 3
api.store.remove('count');
```

## 6. Reacting to the app

`api.on(event, handler)` subscribes to app events and returns a disposer.
Available events:

| Event | Payload | Fires when |
| --- | --- | --- |
| `ready` | `{ id }` | A mod finished loading. |
| `session` | session object or `null` | Sign-in/sign-out/refresh. |
| `data` | `{ target, lessons }` | Timetable data is (re)loaded. |
| `theme` | `themeId` | The active theme changes. |
| `changes` | `LessonChange[]` | New cancellations/substitutions are detected. |

```js
api.on('changes', (changes) => {
  api.ui.toast(`${changes.length} new change(s)`);
});
```

## 7. Cleaning up

Everything that registers a contribution also gives you a way to undo it:

- `api.css.add` returns a disposer.
- `api.on` returns a disposer.
- `render` functions may return a disposer.

The runtime **also** tracks every contribution and disposes them automatically when the mod is
disabled or reloaded — so you usually don't need to keep the return values. Do it anyway if you
create things mid-flight (timers, observers) inside an event handler.

## 8. Logging & errors

- `api.log('message', value)` prefixes output with `[mod:<id>]`.
- If `setup` throws, Untis⁺ catches it, rolls back your contributions, and shows the message on
  the Mods screen. Nothing else breaks.

```js
setup(api) {
  api.log('starting up');
  throw new Error('this shows on the Mods screen');
}
```

## 9. Testing locally

1. Save your file as `my-mod.js`.
2. Open **More → Mods**.
3. **Add mod → From code**, paste it, name it, add it.
4. Iterate: after editing, press **Reload** on its row.

When you're happy, host the file and share it by URL. To publish it as a bundled example,
drop it in `apps/web/public/mods/` and add an entry to `EXAMPLE_MODS` in
`apps/web/src/mods.ts`.

## Full worked example

The bundled **Hello page** mod (`apps/web/public/mods/hello-page.js`) uses a nav page, a
settings section, a command, toast, stored state and an event listener in ~60 lines. Read it
next to this guide — it's the best reference.

Continue to the full [mod API reference](mod-api.md), or grab a snippet from
[recipes.md](recipes.md).
