/**
 * Example mod: inject CSS + greet with a toast.
 *
 * Shows the two simplest powers a mod has: `css.add` (a style tag, disposed on unload) and
 * `ui.toast`. Keep the tone of injected CSS in mind — it applies to the whole app.
 */
UntisPlus.register({
  id: 'untisplus.sticker',
  name: 'Sticker',
  version: '1.0.0',
  author: 'Untis+ examples',
  apiVersion: 1,

  setup(api) {
    api.css.add(`
      .brand .logo::after {
        content: '★';
        position: absolute;
        margin: -14px 0 0 18px;
        font-size: 11px;
        color: #ffd93d;
        text-shadow: 0 1px 2px rgba(0,0,0,.4);
      }
      .brand .logo { position: relative; }
    `);

    api.ui.toast('Sticker mod loaded ★');
    api.log('injected sticker CSS');
  },
});
