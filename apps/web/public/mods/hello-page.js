/**
 * Example mod: a custom page.
 *
 * Adds a "Hello" entry to the More hub (a real, deep-linkable page at `#/x/untisplus.hello.page`),
 * a settings section, and a command. Demonstrates `nav.add`, `settings.add`, `commands.add`,
 * `ui.toast` and event handlers.
 */
UntisPlus.register({
  id: 'untisplus.hello',
  name: 'Hello page',
  version: '1.0.0',
  author: 'Untis+ examples',
  apiVersion: 1,

  setup(api) {
    const visits = api.store.get('visits', 0) + 1;
    api.store.set('visits', visits);

    api.nav.add({
      id: 'untisplus.hello.page',
      label: 'Hello',
      icon: 'grid',
      placement: 'more',
      render(el) {
        el.innerHTML = `
          <h1 class="page-title" style="margin-bottom:10px">Hello from a mod 👋</h1>
          <div class="card pad col" style="gap:10px;max-width:520px">
            <div class="small muted">
              This whole page was added by <strong>untisplus.hello</strong> without touching the
              app's source. It can read the app API, keep its own storage and react to events.
            </div>
            <div class="row">
              <button class="btn primary" data-action="hi">Say hi</button>
              <button class="btn" data-action="count">Open count: ${visits}</button>
            </div>
          </div>
        `;
        const onClick = (e) => {
          if (e.target?.dataset?.action === 'hi') api.ui.toast('Hi! 👋');
        };
        el.addEventListener('click', onClick);
        return () => el.removeEventListener('click', onClick);
      },
    });

    api.settings.add({
      id: 'about',
      title: 'Hello mod',
      render(el) {
        el.innerHTML = `<div class="small muted">You have opened the app ${visits} time(s) since installing this mod.</div>`;
      },
    });

    api.commands.add({
      id: 'say-hi',
      title: 'Hello: say hi',
      run: () => api.ui.toast('Hi from the Hello mod!'),
    });

    api.on('ready', () => api.log('ready event received'));
  },
});
