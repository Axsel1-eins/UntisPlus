# Recipes

Copy-paste starting points. Each is a complete `UntisPlus.register({...})` module — add it from
**More → Mods → Add mod → From code** (or host it and use **From URL**).

## Add a simple page

```js
UntisPlus.register({
  id: 'com.example.about',
  name: 'About page',
  apiVersion: 1,
  setup(api) {
    api.nav.add({
      id: 'com.example.about.page',
      label: 'About',
      icon: 'book',
      render(el) {
        el.innerHTML = `
          <h1 class="page-title">About</h1>
          <p class="muted">Added by a mod, no app changes required.</p>`;
      },
    });
  },
});
```

## Hide free periods everywhere

```js
UntisPlus.register({
  id: 'com.example.compact',
  name: 'Compact',
  apiVersion: 1,
  setup(api) {
    api.lessons.transform((lessons) => lessons.filter((l) => l.status !== 'FREE'));
  },
});
```

## Highlight cancelled lessons in the app

```js
UntisPlus.register({
  id: 'com.example.highlight-cancelled',
  name: 'Highlight cancelled',
  apiVersion: 1,
  setup(api) {
    api.css.add(`
      .lesson.is-cancelled { outline: 2px solid var(--danger); border-radius: var(--radius); }
    `);
  },
});
```

(Use the class names present in your version; inspect the DOM, or target broadly with
attribute selectors.)

## Toast every time data reloads

```js
UntisPlus.register({
  id: 'com.example.reload-toast',
  name: 'Reload notifier',
  apiVersion: 1,
  setup(api) {
    api.on('data', (p) => {
      const n = p && p.lessons ? p.lessons.length : 0;
      api.log('loaded', n, 'lessons');
    });
  },
});
```

## A settings toggle that persists

```js
UntisPlus.register({
  id: 'com.example.pref',
  name: 'My preference',
  apiVersion: 1,
  setup(api) {
    api.settings.add({
      id: 'com.example.pref.settings',
      title: 'My preference',
      render(el) {
        const on = api.store.get('on', true);
        el.innerHTML = `
          <label class="row" style="gap:8px">
            <input type="checkbox" ${on ? 'checked' : ''}>
            <span>Enable the thing</span>
          </label>`;
        const box = el.querySelector('input');
        box.addEventListener('change', () => {
          api.store.set('on', box.checked);
          api.ui.toast(box.checked ? 'On' : 'Off');
        });
      },
    });
  },
});
```

## Ship a theme pack

```js
UntisPlus.register({
  id: 'com.example.themes',
  name: 'Theme pack',
  apiVersion: 1,
  setup(api) {
    const make = (id, name, mode, tokens) => api.themes.register({ id, name, mode, tokens });

    make('com.example.themes.slate', 'Slate', 'dark', {
      bg: '#1b1e24', surface: '#232830', text: '#e8ebf0', muted: '#9aa4b2',
      accent: '#7aa2f7', 'accent-ink': '#10131a', border: '#333b47',
    });

    make('com.example.themes.sand', 'Sand', 'light', {
      bg: '#f6f1e7', surface: '#ffffff', text: '#3a3325', muted: '#7d735d',
      accent: '#b07d3a', 'accent-ink': '#ffffff', border: '#e3d9c6',
    });
  },
});
```

## Add German + English strings

```js
UntisPlus.register({
  id: 'com.example.i18n',
  name: 'Localized',
  apiVersion: 1,
  setup(api) {
    api.i18n.add('en', { myMod: { hello: 'Hello!' } });
    api.i18n.add('de', { myMod: { hello: 'Hallo!' } });
  },
});
```

## Count visits with persistent storage

```js
UntisPlus.register({
  id: 'com.example.counter',
  name: 'Visit counter',
  apiVersion: 1,
  setup(api) {
    const n = api.store.get('opens', 0) + 1;
    api.store.set('count', n);
    api.nav.add({
      id: 'com.example.i18n.count',
      label: `Visits: ${n}`,
      icon: 'clock',
      render(el) {
        el.innerHTML = `<h1 class="page-title">You opened the app ${n} time(s).</h1>`;
      },
    });
  },
});
```

## Only show substitutions you care about

```js
UntisPlus.register({
  id: 'com.example.relevant-subs',
  name: 'Relevant substitutions',
  apiVersion: 1,
  setup(api) {
    api.substitutions.transform((items) =>
      items.filter((i) => ['CANCELLED', 'ROOM_CHANGE', 'TEACHER_CHANGE', 'MOVED'].includes(i.kind)),
    );
  },
});
```

## Poll the API and warn about changes yourself

```js
UntisPlus.register({
  id: 'com.example.poll',
  name: 'Custom poller',
  apiVersion: 1,
  setup(api) {
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/timetable', { credentials: 'include' });
        if (!res.ok) return;
        api.log('polled');
      } catch (err) {
        api.log('poll failed', err);
      }
    }, 60_000);

    // Stop when the mod is unloaded.
    api.on('ready', () => {}); // no-op, keeps the shape clear
    api.settings.add({
      id: 'com.example.i18n2',
      title: 'Poller',
      render(el) {
        el.innerHTML = '<p class="muted">Polling every 60s.</p>';
        return () => clearInterval(id);
      },
    });
  },
});
```

> Note: anything you create inside `setup` (timers, observers) won't be auto-disposed unless you
> tie it to a contribution's cleanup. Keep the disposer and clear it when the mod unloads, or
> attach the timer inside a `render` function so its cleanup runs naturally.

## Where to go next

- Full API: [mod-api.md](mod-api.md)
- Theming: [making-a-theme.md](making-a-theme.md)
- Worked example in the repo: `apps/web/public/mods/hello-page.js`
