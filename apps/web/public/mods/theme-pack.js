/**
 * Example mod: a theme pack.
 *
 * Adds three extra themes to the Appearance screen. Everything here talks to the app through the
 * global `UntisPlus` object — see docs/tutorials/making-a-mod.md for a full walkthrough.
 */
UntisPlus.register({
  id: 'untisplus.extra-themes',
  name: 'Extra themes',
  version: '1.0.0',
  author: 'Untis+ examples',
  apiVersion: 1,

  setup(api) {
    api.themes.register({
      id: 'midnight-blue',
      name: 'Midnight Blue',
      mode: 'dark',
      author: 'Extra themes mod',
      description: 'Deep navy with a bright sky accent.',
      tokens: {
        bg: '#0a1020',
        surface: '#111a30',
        'surface-2': '#16223f',
        'surface-3': '#1e2b4d',
        text: '#e7eeff',
        muted: '#93a4cb',
        border: '#233257',
        accent: '#5b9dff',
        'accent-ink': '#06121f',
        'accent-soft': '#16294a',
        ok: '#5ad19a',
        'ok-soft': '#123024',
        warn: '#f5c451',
        'warn-soft': '#3a2f16',
        danger: '#ff6b81',
        'danger-soft': '#3a1a22',
      },
    });

    api.themes.register({
      id: 'cyberpunk',
      name: 'Cyberpunk',
      mode: 'dark',
      author: 'Extra themes mod',
      description: 'Neon pink and cyan on near-black.',
      tokens: {
        bg: '#0b0416',
        surface: '#170b2b',
        'surface-2': '#1f1138',
        'surface-3': '#2b1849',
        text: '#f5e9ff',
        muted: '#b79ad6',
        border: '#3a2060',
        accent: '#ff3ea5',
        'accent-ink': '#14001f',
        'accent-soft': '#2c1140',
        ok: '#39ffa1',
        'ok-soft': '#0d2e22',
        warn: '#ffd93d',
        'warn-soft': '#332a0d',
        danger: '#ff5d5d',
        'danger-soft': '#331616',
      },
    });

    api.themes.register({
      id: 'paper',
      name: 'Paper',
      mode: 'light',
      author: 'Extra themes mod',
      description: 'A soft, warm reading theme.',
      tokens: {
        bg: '#f7f4ee',
        surface: '#fffdf9',
        'surface-2': '#efeadf',
        'surface-3': '#e4ddcf',
        text: '#2b2620',
        muted: '#6b6459',
        border: '#e0d9cb',
        accent: '#b4552d',
        'accent-ink': '#ffffff',
        'accent-soft': '#f6e7df',
        ok: '#3f7a4a',
        'ok-soft': '#e4efe4',
        warn: '#9a6a00',
        'warn-soft': '#f7ecd2',
        danger: '#b23b3b',
        'danger-soft': '#f7e3e3',
      },
    });

    api.log('registered 3 extra themes');
  },
});
