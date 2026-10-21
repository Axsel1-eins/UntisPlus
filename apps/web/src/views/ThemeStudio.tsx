import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type Theme,
  parseColor,
  slugifyId,
} from '@untisplus/shared';
import { useApp } from '../store.js';
import { navigate } from '../router.js';
import {
  applyThemeObject,
  computeTokensFor,
  exportThemeAsJson,
  getTheme,
  importThemeFromJson,
  saveCustomTheme,
  systemPrefersDark,
  useThemes,
} from '../themes.js';
import { Dialog, Icon, Segmented } from '../components/primitives.js';
import { HsvColorPicker } from '../components/HsvColorPicker.js';
import { toast } from '../toast.js';

interface EditableTokens {
  bg: string;
  surface: string;
  'surface-2': string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  radius: number;
}

const DEFAULT_DARK_TOKENS: EditableTokens = {
  bg: '#121624',
  surface: '#1b2138',
  'surface-2': '#242b47',
  text: '#f1f5f9',
  muted: '#94a3b8',
  border: '#334155',
  accent: '#6366f1',
  radius: 10,
};

const DEFAULT_LIGHT_TOKENS: EditableTokens = {
  bg: '#f8fafc',
  surface: '#ffffff',
  'surface-2': '#f1f5f9',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  accent: '#4f46e5',
  radius: 10,
};

function toHex(val: string): string {
  if (!val) return '#000000';
  if (val.startsWith('#') && (val.length === 7 || val.length === 4)) {
    if (val.length === 4) {
      return `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}`;
    }
    return val;
  }
  const rgb = parseColor(val);
  if (!rgb) return '#000000';
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

export function ThemeStudioView() {
  const { t } = useTranslation();
  const { themeId, setThemeId } = useApp();
  const allAvailableThemes = useThemes();

  const [themeName, setThemeName] = useState(t('themeStudio.newThemeDefaultName'));
  const [themeAuthor, setThemeAuthor] = useState('');
  const [mode, setMode] = useState<'dark' | 'light'>(() =>
    themeId !== 'system' && getTheme(themeId)?.mode === 'light' ? 'light' : 'dark',
  );
  const [tokens, setTokens] = useState<EditableTokens>(() => {
    const cur = themeId !== 'system' ? getTheme(themeId) : undefined;
    const base = cur?.mode === 'light' ? DEFAULT_LIGHT_TOKENS : DEFAULT_DARK_TOKENS;
    if (!cur?.tokens) return { ...base };
    const rNum = parseInt(cur.tokens.radius ?? '10', 10);
    return {
      bg: cur.tokens.bg ? toHex(cur.tokens.bg) : base.bg,
      surface: cur.tokens.surface ? toHex(cur.tokens.surface) : base.surface,
      'surface-2': cur.tokens['surface-2'] ? toHex(cur.tokens['surface-2']) : base['surface-2'],
      text: cur.tokens.text ? toHex(cur.tokens.text) : base.text,
      muted: cur.tokens.muted ? toHex(cur.tokens.muted) : base.muted,
      border: cur.tokens.border ? toHex(cur.tokens.border) : base.border,
      accent: cur.tokens.accent ? toHex(cur.tokens.accent) : base.accent,
      radius: Number.isNaN(rNum) ? base.radius : rNum,
    };
  });
  const [fontFamily, setFontFamily] = useState<'default' | 'monospace' | 'inter' | 'serif'>('default');
  const [hsvTargetKey, setHsvTargetKey] = useState<keyof EditableTokens | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importRawJson, setImportRawJson] = useState('');

  // Assemble full theme draft
  const draftTheme = useMemo<Theme>(() => {
    const slug = slugifyId(themeName) || 'custom-theme';
    const fontCss =
      fontFamily === 'monospace'
        ? 'ui-monospace, "JetBrains Mono", Consolas, monospace'
        : fontFamily === 'inter'
          ? '"Inter", -apple-system, BlinkMacSystemFont, sans-serif'
          : fontFamily === 'serif'
            ? '"Charter", "Georgia", serif'
            : '';

    return {
      id: `custom-${slug}`,
      name: themeName || 'My Custom Theme',
      author: themeAuthor.trim() || undefined,
      mode,
      builtin: false,
      tokens: {
        bg: tokens.bg,
        surface: tokens.surface,
        'surface-2': tokens['surface-2'],
        'surface-3': tokens['surface-2'],
        text: tokens.text,
        muted: tokens.muted,
        border: tokens.border,
        accent: tokens.accent,
        'accent-ink': mode === 'dark' ? '#000000' : '#ffffff',
        'accent-soft': tokens['surface-2'],
        ok: '#10b981',
        'ok-soft': mode === 'dark' ? '#064e3b' : '#ecfdf5',
        warn: '#f59e0b',
        'warn-soft': mode === 'dark' ? '#78350f' : '#fffbeb',
        danger: '#ef4444',
        'danger-soft': mode === 'dark' ? '#7f1d1d' : '#fef2f2',
        radius: `${tokens.radius}px`,
        'radius-sm': `${Math.max(2, Math.round(tokens.radius * 0.6))}px`,
        'radius-lg': `${Math.round(tokens.radius * 1.5)}px`,
      },
      css: fontCss ? `:root { --font-sans: ${fontCss}; } body { font-family: ${fontCss}; }` : undefined,
    };
  }, [themeName, themeAuthor, mode, tokens, fontFamily]);

  // Live preview globally applied
  useEffect(() => {
    applyThemeObject(draftTheme, mode);
  }, [draftTheme, mode]);

  // Restore on unmount
  useEffect(() => {
    return () => {
      const cur = getTheme(themeId);
      applyThemeObject(cur, cur ? cur.mode : systemPrefersDark() ? 'dark' : 'light');
    };
  }, [themeId]);

  function handleTokenColor(key: keyof EditableTokens, value: string) {
    setTokens((prev) => ({ ...prev, [key]: value }));
  }

  function handleGeneratePalette() {
    const hex = tokens.accent;
    const rgb = parseColor(hex) || [99, 102, 241];
    const [r, g, b] = rgb;
    if (mode === 'dark') {
      const bgR = Math.max(8, Math.round(r * 0.08));
      const bgG = Math.max(8, Math.round(g * 0.08));
      const bgB = Math.max(14, Math.round(b * 0.08));
      const sR = Math.max(16, Math.round(r * 0.14));
      const sG = Math.max(16, Math.round(g * 0.14));
      const sB = Math.max(24, Math.round(b * 0.14));
      const s2R = Math.max(26, Math.round(r * 0.22));
      const s2G = Math.max(26, Math.round(g * 0.22));
      const s2B = Math.max(38, Math.round(b * 0.22));
      const bR = Math.max(45, Math.round(r * 0.32));
      const bG = Math.max(45, Math.round(g * 0.32));
      const bB = Math.max(60, Math.round(b * 0.32));
      setTokens((prev) => ({
        ...prev,
        bg: `#${bgR.toString(16).padStart(2, '0')}${bgG.toString(16).padStart(2, '0')}${bgB.toString(16).padStart(2, '0')}`,
        surface: `#${sR.toString(16).padStart(2, '0')}${sG.toString(16).padStart(2, '0')}${sB.toString(16).padStart(2, '0')}`,
        'surface-2': `#${s2R.toString(16).padStart(2, '0')}${s2G.toString(16).padStart(2, '0')}${s2B.toString(16).padStart(2, '0')}`,
        text: '#f8fafc',
        muted: '#94a3b8',
        border: `#${bR.toString(16).padStart(2, '0')}${bG.toString(16).padStart(2, '0')}${bB.toString(16).padStart(2, '0')}`,
      }));
    } else {
      setTokens((prev) => ({
        ...prev,
        bg: '#f8fafc',
        surface: '#ffffff',
        'surface-2': '#f1f5f9',
        text: '#0f172a',
        muted: '#64748b',
        border: '#e2e8f0',
      }));
    }
    toast(t('themeStudio.paletteGenerated'), 'success');
  }

  function handleCopyCss() {
    const css = Object.entries(draftTheme.tokens)
      .map(([k, v]) => `  --${k}: ${v};`)
      .join('\n');
    navigator.clipboard?.writeText(`:root {\n${css}\n}`);
    toast(t('themeStudio.cssCopied'), 'success');
  }

  function handleSave() {
    saveCustomTheme(draftTheme);
    setThemeId(draftTheme.id);
    toast(t('themeStudio.saved'), 'success');
  }

  function handleExport() {
    const jsonStr = exportThemeAsJson(draftTheme);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draftTheme.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(t('themeStudio.exported'), 'success');
  }

  function handleImportSubmit() {
    try {
      if (!importRawJson.trim()) return;
      const th = importThemeFromJson(importRawJson.trim());
      saveCustomTheme(th);
      setThemeId(th.id);
      setThemeName(th.name);
      if (th.author) setThemeAuthor(th.author);
      setMode(th.mode);
      if (th.tokens) {
        setTokens({
          bg: th.tokens.bg ? toHex(th.tokens.bg) : tokens.bg,
          surface: th.tokens.surface ? toHex(th.tokens.surface) : tokens.surface,
          'surface-2': th.tokens['surface-2'] ? toHex(th.tokens['surface-2']) : tokens['surface-2'],
          text: th.tokens.text ? toHex(th.tokens.text) : tokens.text,
          muted: th.tokens.muted ? toHex(th.tokens.muted) : tokens.muted,
          border: th.tokens.border ? toHex(th.tokens.border) : tokens.border,
          accent: th.tokens.accent ? toHex(th.tokens.accent) : tokens.accent,
          radius: th.tokens.radius ? parseInt(th.tokens.radius, 10) || 10 : 10,
        });
      }
      setImportModalOpen(false);
      setImportRawJson('');
      toast(t('themeStudio.imported'), 'success');
    } catch {
      toast(t('themeStudio.invalidJson'), 'error');
    }
  }

  function loadPreset(theme: Theme) {
    const computed = computeTokensFor(theme.mode, theme.tokens);
    setThemeName(`${theme.name} Custom`);
    setMode(theme.mode);
    setTokens({
      bg: toHex(computed.bg || '#1e1e2e'),
      surface: toHex(computed.surface || '#282a36'),
      'surface-2': toHex(computed['surface-2'] || '#3b4252'),
      text: toHex(computed.text || '#f8f8f2'),
      muted: toHex(computed.muted || '#94a3b8'),
      border: toHex(computed.border || '#44475a'),
      accent: toHex(computed.accent || '#6366f1'),
      radius: parseInt(computed.radius ?? '10', 10) || 10,
    });
    toast(t('themeStudio.templateLoaded', { name: theme.name }), 'info');
  }

  const COLOR_FIELDS: { key: keyof EditableTokens; labelKey: string; hintKey: string }[] = [
    { key: 'bg', labelKey: 'themeStudio.bg', hintKey: 'themeStudio.bgHint' },
    { key: 'surface', labelKey: 'themeStudio.surface', hintKey: 'themeStudio.surfaceHint' },
    { key: 'surface-2', labelKey: 'themeStudio.surface2', hintKey: 'themeStudio.surface2Hint' },
    { key: 'text', labelKey: 'themeStudio.text', hintKey: 'themeStudio.textHint' },
    { key: 'muted', labelKey: 'themeStudio.muted', hintKey: 'themeStudio.mutedHint' },
    { key: 'border', labelKey: 'themeStudio.border', hintKey: 'themeStudio.borderHint' },
    { key: 'accent', labelKey: 'themeStudio.accent', hintKey: 'themeStudio.accentHint' },
  ];

  return (
    <div>
      {/* Top Header */}
      <div className="row wrap" style={{ gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <button
          className="btn ghost icon"
          onClick={() => navigate('appearance')}
          aria-label={t('onboarding.back')}
          title={t('onboarding.back')}
          type="button"
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <div>
          <h1 className="page-title row" style={{ gap: 8, alignItems: 'center', margin: 0 }}>
            <span>🎨</span>
            <span>{t('themeStudio.title')}</span>
          </h1>
          <div className="small muted">{t('themeStudio.subtitle')}</div>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={handleCopyCss} type="button" title={t('themeStudio.copyCssTitle')}>
          <Icon name="copy" size={16} />
          <span>CSS</span>
        </button>
        <button className="btn" onClick={() => setImportModalOpen(true)} type="button">
          <Icon name="upload" size={16} />
          <span>{t('themeStudio.importJson')}</span>
        </button>
        <button className="btn" onClick={handleExport} type="button">
          <Icon name="download" size={16} />
          <span>{t('themeStudio.exportJson')}</span>
        </button>
        <button className="btn primary" onClick={handleSave} type="button">
          <Icon name="check" size={16} />
          <span>{t('themeStudio.saveAsNew')}</span>
        </button>
      </div>

      {/* Main Studio 2-Column Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Left Column: Color Pickers & Shape */}
        <div className="col" style={{ gap: 14 }}>
          {/* Metadata Card */}
          <div className="card pad col" style={{ gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>ℹ️ {t('themeStudio.metaTitle')}</span>
            <div className="row wrap" style={{ gap: 10 }}>
              <div style={{ flex: 2, minWidth: 160 }}>
                <label className="tiny muted">{t('themeStudio.themeName')}</label>
                <input
                  type="text"
                  className="input"
                  value={themeName}
                  onChange={(e) => setThemeName(e.target.value)}
                  placeholder={t('themeStudio.themeNamePlaceholder')}
                />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label className="tiny muted">{t('themeStudio.author')}</label>
                <input
                  type="text"
                  className="input"
                  value={themeAuthor}
                  onChange={(e) => setThemeAuthor(e.target.value)}
                  placeholder={t('themeStudio.authorPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="tiny muted">{t('themeStudio.baseMode')}</label>
              <Segmented
                label={t('themeStudio.baseMode')}
                value={mode}
                onChange={(v) => {
                  setMode(v as 'light' | 'dark');
                  if (v === 'light' && mode === 'dark') {
                    setTokens((prev) => ({ ...prev, bg: '#f8fafc', surface: '#ffffff', text: '#0f172a' }));
                  } else if (v === 'dark' && mode === 'light') {
                    setTokens((prev) => ({ ...prev, bg: '#121624', surface: '#1b2138', text: '#f1f5f9' }));
                  }
                }}
                options={[
                  { value: 'dark', label: `🌙 ${t('theme.dark')}` },
                  { value: 'light', label: `☀️ ${t('theme.light')}` },
                ]}
              />
            </div>
          </div>

          {/* Color Palette Tuner */}
          <div className="card pad col" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>🎨 {t('themeStudio.colors')}</span>
              <button
                type="button"
                className="btn sm ghost"
                onClick={handleGeneratePalette}
                style={{ fontSize: 12, gap: 4, color: 'var(--accent)', fontWeight: 700 }}
                title={t('themeStudio.autoPaletteHint')}
              >
                <span>✨</span>
                <span>{t('themeStudio.autoPalette')}</span>
              </button>
            </div>

            <div className="col" style={{ gap: 8 }}>
              {COLOR_FIELDS.map((f) => {
                const curVal = tokens[f.key] as string;
                return (
                  <div
                    key={f.key}
                    className="row"
                    style={{
                      background: 'var(--surface-2)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      alignItems: 'center',
                      gap: 10,
                      border: '1px solid var(--border)',
                    }}
                  >
                    {/* Visual Color Swatch */}
                    <input
                      type="color"
                      value={curVal}
                      onChange={(e) => handleTokenColor(f.key, e.target.value)}
                      style={{
                        width: 34,
                        height: 34,
                        padding: 0,
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                      title={t(f.hintKey)}
                    />

                    <div className="col" style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <span style={{ fontWeight: 650, fontSize: 13 }}>{t(f.labelKey)}</span>
                      <span className="tiny muted nowrap">{t(f.hintKey)}</span>
                    </div>

                    <input
                      type="text"
                      value={curVal}
                      onChange={(e) => handleTokenColor(f.key, e.target.value)}
                      style={{
                        width: 82,
                        padding: '4px 6px',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        textAlign: 'center',
                      }}
                    />

                    {/* HSV Picker Trigger */}
                    <button
                      type="button"
                      className="btn sm ghost icon"
                      onClick={() => setHsvTargetKey(f.key)}
                      title="HSV Color Wheel"
                    >
                      🌈
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Shape & Font */}
          <div className="card pad col" style={{ gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>📐 {t('themeStudio.shapeAndType')}</span>

            {/* Corner Radius Slider */}
            <div className="col" style={{ gap: 4 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small">{t('themeStudio.radius')}</span>
                <span className="badge small">{tokens.radius}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="24"
                value={tokens.radius}
                onChange={(e) => setTokens((prev) => ({ ...prev, radius: Number(e.target.value) }))}
                style={{ cursor: 'pointer' }}
              />
            </div>

            {/* Font Family Selection */}
            <div className="col" style={{ gap: 4 }}>
              <span className="small">{t('themeStudio.font')}</span>
              <Segmented
                label={t('themeStudio.font')}
                value={fontFamily}
                onChange={(v) => setFontFamily(v as 'default' | 'monospace' | 'inter' | 'serif')}
                options={[
                  { value: 'default', label: t('theme.system', 'System') },
                  { value: 'inter', label: 'Inter' },
                  { value: 'monospace', label: 'Mono' },
                  { value: 'serif', label: 'Serif' },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Preview */}
        <div className="col" style={{ gap: 14 }}>
          {/* Preset Starters */}
          <div className="card pad col" style={{ gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>⚡ {t('themeStudio.loadTemplate')}</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {allAvailableThemes.slice(0, 8).map((th) => (
                <button
                  key={th.id}
                  type="button"
                  className="btn sm ghost"
                  onClick={() => loadPreset(th)}
                  title={`Lade ${th.name} als Vorlage`}
                >
                  <span>{th.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="card pad col" style={{ gap: 14, position: 'sticky', top: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>👀 {t('themeStudio.preview')}</span>
              <span className="badge ok">{mode.toUpperCase()}</span>
            </div>

            {/* Simulated Timetable Lesson Card */}
            <div
              className="card"
              style={{
                padding: '12px 14px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: `${tokens.radius}px`,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    background: 'var(--accent)',
                    color: mode === 'dark' ? '#000000' : '#ffffff',
                    fontWeight: 800,
                    fontSize: 12,
                    padding: '3px 8px',
                    borderRadius: `${Math.max(3, Math.round(tokens.radius * 0.5))}px`,
                  }}
                >
                  M · Mathematik
                </span>
                <span className="badge ok">08:00 – 08:50</span>
                <div className="spacer" />
                <span className="small muted">R102</span>
              </div>

              <div style={{ fontWeight: 650, fontSize: 14 }}>Prof. Mag. Schmidt (SMI)</div>
              <div className="small muted">{t('themeStudio.previewTopic')}</div>

              <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                <span className="badge warn">🔄 {t('nav.substitutions')}</span>
                <span className="badge danger">⚠️ {t('themeStudio.previewHomeworkDue')}</span>
              </div>
            </div>

            {/* Buttons Preview */}
            <div className="row wrap" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn primary"
                style={{ borderRadius: `${tokens.radius}px` }}
              >
                <Icon name="calendar" size={16} />
                <span>{t('themeStudio.previewPrimaryBtn')}</span>
              </button>
              <button
                type="button"
                className="btn"
                style={{ borderRadius: `${tokens.radius}px` }}
              >
                <span>{t('themeStudio.previewSecondaryBtn')}</span>
              </button>
            </div>

            {/* Typography & Contrast check */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: `${tokens.radius}px`,
                padding: '10px 12px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                {themeName || 'Untis⁺ Custom Theme'}
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>
                Textfarbe & Muted-Farbe im direkten Vergleich auf dem Surface-Hintergrund.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* HSV Picker Modal Dialog */}
      <Dialog
        open={Boolean(hsvTargetKey)}
        onClose={() => setHsvTargetKey(null)}
        title={hsvTargetKey ? t('themeStudio.colorWheelTitle', { key: String(hsvTargetKey) }) : t('themeStudio.chooseColor')}
      >
        {hsvTargetKey && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
            <HsvColorPicker
              color={tokens[hsvTargetKey] as string}
              label={String(hsvTargetKey)}
              onChange={(newHex) => handleTokenColor(hsvTargetKey, newHex)}
              onClose={() => setHsvTargetKey(null)}
            />
          </div>
        )}
      </Dialog>

      {/* JSON Import Modal Dialog */}
      <Dialog
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title={t('themeStudio.importJson')}
      >
        <div className="col" style={{ gap: 12 }}>
          <p className="small muted" style={{ margin: 0 }}>
            {t('appearance.importHint')}
          </p>
          <textarea
            className="code-input"
            rows={8}
            placeholder='{ "name": "Mein Thema", "mode": "dark", "tokens": { "accent": "#fe8019" } }'
            value={importRawJson}
            onChange={(e) => setImportRawJson(e.target.value)}
          />
          <div className="row wrap" style={{ gap: 8 }}>
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setImportRawJson(await file.text());
              }}
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="spacer" />
            <button className="btn ghost" onClick={() => setImportModalOpen(false)} type="button">
              {t('common.cancel')}
            </button>
            <button className="btn primary" onClick={handleImportSubmit} type="button">
              <Icon name="upload" size={16} />
              <span>{t('themeStudio.importJson')}</span>
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
