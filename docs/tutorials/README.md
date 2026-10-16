# Untis⁺ tutorials — themes & mods

Untis⁺ is built to be restyled and extended **without touching the app's source code**. This
folder contains short, practical guides. Start with the one that matches what you want to do.

## I just want to use it

| I want to… | Read |
| --- | --- |
| Pick a look, or make my own with no code | [install-a-theme.md](install-a-theme.md) |
| Add a behaviour-changing add-on someone shared | [install-a-mod.md](install-a-mod.md) |

## I want to build something

| I want to… | Read |
| --- | --- |
| Publish a theme (colors, radii, font) | [making-a-theme.md](making-a-theme.md) |
| Write my first mod | [making-a-mod.md](making-a-mod.md) |
| Look up every API method | [mod-api.md](mod-api.md) |
| Copy a ready-made snippet | [recipes.md](recipes.md) |

## The two concepts

### Themes are data

A theme is a small **JSON object** of design tokens (colors, corner radii, font). No code is
required. You can:

- choose one of the bundled themes,
- clone one and tweak the sliders in the built-in editor (it shows a live **WCAG contrast meter**),
- import/export a `.json` file, or share a theme as a **link**.

Themes can never break the app: unknown token keys are silently dropped, and a theme is only
applied after it validates.

### Mods are code

A mod is a small **JavaScript file** that talks to the app through a single global object,
`window.UntisPlus`. A mod can add pages, inject CSS, register themes, reshape the timetable,
add settings, add translations, and more.

> ⚠️ **Mods are trusted code.** There is deliberately no sandbox — a mod runs with the same
> privileges as the app itself and can read the data the app can read. Only install mods you
> trust, ideally ones where you can read the source.

If a mod throws while it loads, Untis⁺ catches the error, keeps running, and shows the problem
on the **Mods** screen so you can disable or remove it.

## Where these things live in the app

- **Appearance** — `#/appearance`. The theme gallery + editor.
- **Mods** — `#/mods`. Enable, disable, add, remove and troubleshoot mods.
- Both are also reachable from **More → Customize**.

## A 60-second taste of a mod

Create a file `my-mod.js` and add it from **More → Mods → Add mod → From code** (or host it
somewhere and use **From URL**):

```js
UntisPlus.register({
  id: 'com.example.hello',
  name: 'Hello mod',
  version: '1.0.0',
  author: 'you',
  apiVersion: 1,
  setup(api) {
    api.ui.toast('Hello from my first mod!');
    api.nav.add({
      id: 'com.example.hello.page',
      label: 'Hello',
      icon: 'grid',
      render(el) {
        el.innerHTML = '<h1 class="page-title">It works 🎉</h1>';
      },
    });
  },
});
```

That is the whole shape of a mod: **register**, then in `setup(api)` make contributions. See
[making-a-mod.md](making-a-mod.md) for the walkthrough.

## Keeping your own themes and mods safe

Everything you create is stored locally in the browser (`localStorage`), so it survives
reloads and works offline. Use **Export** on a theme to save it as a file you can keep or
share. Mods added by URL can be re-added any time by anyone who has the link.
