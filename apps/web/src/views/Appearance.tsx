import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  THEME_TOKENS,
  contrastRatio,
  parseColor,
  parseTheme,
  serializeTheme,
  slugifyId,
  wcagLevel,
  type Theme,
} from '@untisplus/shared';
import { useApp } from '../store.js';
import { useRouteInfo, navigate } from '../router.js';
import {
  allThemes,
  applyActiveTheme,
  applyThemeObject,
  computeTokensFor,
  customThemesList,
  decodeThemeParam,
  deleteCustomTheme,
  encodeThemeLink,
  getTheme,
  readComputedTokens,
  saveCustomTheme,
  systemPrefersDark,
  useThemes,
} from '../themes.js';
import { Dialog, Icon } from '../components/primitives.js';
import { toast } from '../toast.js';

/* -------------------------------- helpers -------------------------------- */

function uniqueId(base: string): string {
  const taken = new Set(allThemes().map((t) => t.id));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function toHexColor(value: string): string {
  const rgb = parseColor(value);
  if (!rgb) return '#000000';
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function downloadTheme(theme: Theme): void {
  const blob = new Blob([serializeTheme(theme)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${theme.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------ view ------------------------------------- */

export function AppearanceView() {
  const { t } = useTranslation();
  const { themeId, setThemeId } = useApp();
  const themes = useThemes();
  const { query } = useRouteInfo();
  const [draft, setDraft] = useState<Theme | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const importedRef = useRef(false);

  // Live-preview the draft; otherwise keep the active theme applied.
  useEffect(() => {
    if (draft) applyThemeObject(draft, draft.mode);
    else applyActiveTheme(themeId, systemPrefersDark());
  }, [draft, themeId]);

  // Restore the active theme when leaving this screen (the draft preview is DOM-global).
  useEffect(() => () => applyActiveTheme(themeId, systemPrefersDark()), [themeId]);

  // Handle a shared theme in the URL (#/appearance?theme=...).
  useEffect(() => {
    if (importedRef.current) return;
    const shared = query.get('theme');
    if (!shared) return;
    importedRef.current = true;
    const theme = decodeThemeParam(shared);
    if (theme) {
      setDraft({ ...theme, id: uniqueId(theme.id || `custom-${slugifyId(theme.name)}`) });
      toast(t('appearance.imported'));
    } else {
      toast(t('appearance.importError'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previews = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const th of themes) map.set(th.id, computeTokensFor(th.mode, th.tokens));
    return map;
  }, [themes]);

  function select(id: string): void {
    setDraft(null);
    setThemeId(id);
  }

  function newFromCurrent(): void {
    applyActiveTheme(themeId, systemPrefersDark());
    const mode: 'light' | 'dark' = getTheme(themeId)?.mode ?? (systemPrefersDark() ? 'dark' : 'light');
    setDraft({
      id: uniqueId(`custom-${slugifyId(t('appearance.newTheme'))}`),
      name: t('appearance.newTheme'),
      mode,
      tokens: readComputedTokens(),
    });
  }

  function edit(theme: Theme): void {
    setDraft({ ...theme, tokens: computeTokensFor(theme.mode, theme.tokens) });
  }

  function duplicate(theme: Theme): void {
    setDraft({
      id: uniqueId(`custom-${slugifyId(theme.name)}`),
      name: `${theme.name} copy`,
      mode: theme.mode,
      author: theme.author,
      description: theme.description,
      tokens: computeTokensFor(theme.mode, theme.tokens),
    });
  }

  function remove(theme: Theme): void {
    deleteCustomTheme(theme.id);
    if (themeId === theme.id) setThemeId('system');
    toast(t('appearance.deleted'));
  }

  function save(): void {
    if (!draft) return;
    const theme: Theme = { ...draft, id: draft.id || uniqueId(`custom-${slugifyId(draft.name)}`) };
    saveCustomTheme(theme);
    setDraft(null);
    setThemeId(theme.id);
    toast(t('appearance.saved'));
  }

  async function share(theme: Theme): Promise<void> {
    const link = encodeThemeLink(theme);
    try {
      await navigator.clipboard.writeText(link);
      toast(t('appearance.shareCopied'));
    } catch {
      window.prompt(t('appearance.sharePrompt'), link);
    }
  }

  function importText(text: string): boolean {
    try {
      const theme = parseTheme(text);
      saveCustomTheme(theme);
      setDraft(null);
      setThemeId(theme.id);
      setImportOpen(false);
      toast(t('appearance.imported'));
      return true;
    } catch {
      toast(t('appearance.importError'), 'error');
      return false;
    }
  }

  const custom = customThemesList();
  const systemActive = themeId === 'system';
  const baseLight = useMemo(() => computeTokensFor('light'), []);
  const baseDark = useMemo(() => computeTokensFor('dark'), []);

  return (
    <div>
      <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
        <h1 className="page-title">{t('appearance.title')}</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => navigate('theme-studio')} type="button" style={{ gap: 6 }}>
          <span>🎨</span>
          <span>{t('themeStudio.openStudio')}</span>
        </button>
        <button className="btn primary" onClick={newFromCurrent} type="button">
          <Icon name="plus" size={16} /> {t('appearance.newTheme')}
        </button>
        <button className="btn" onClick={() => setImportOpen(true)} type="button">
          <Icon name="upload" size={16} /> {t('appearance.import')}
        </button>
      </div>
      <p className="small muted" style={{ marginTop: 0, marginBottom: 14 }}>
        {t('appearance.intro')}
      </p>

      <div className="theme-grid">
        {/* System follows the OS. */}
        <button
          className="theme-card"
          aria-pressed={systemActive}
          onClick={() => select('system')}
          type="button"
        >
          <span className="tc-preview" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: 0 }}>
            <span style={{ display: 'grid', placeItems: 'center', background: baseLight.bg, color: baseLight.text }}>
              <Icon name="sun" size={20} />
            </span>
            <span style={{ display: 'grid', placeItems: 'center', background: baseDark.bg, color: baseDark.text }}>
              <Icon name="moon" size={20} />
            </span>
          </span>
          <span className="tc-meta">
            <span className="col" style={{ gap: 1, minWidth: 0 }}>
              <span className="tc-name nowrap">{t('settings.themeSystem')}</span>
              <span className="tc-sub nowrap">{t('appearance.systemSub')}</span>
            </span>
            <div className="spacer" />
            {systemActive && <Icon name="check" size={16} />}
          </span>
        </button>

        {themes.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            tokens={previews.get(theme.id) ?? {}}
            active={themeId === theme.id}
            onSelect={() => select(theme.id)}
          />
        ))}
      </div>

      {custom.length > 0 && (
        <div className="section">
          <h2>{t('appearance.myThemes')}</h2>
          <div className="col" style={{ gap: 8 }}>
            {custom.map((theme) => (
              <div key={theme.id} className="card pad row" style={{ gap: 10 }}>
                <Icon name="palette" size={18} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }} className="nowrap">
                    {theme.name}
                  </div>
                  <div className="tiny muted nowrap">{theme.id}</div>
                </div>
                <div className="spacer" />
                <button className="btn sm" onClick={() => select(theme.id)} type="button">
                  <Icon name="check" size={14} /> {t('appearance.apply')}
                </button>
                <button className="btn sm icon" onClick={() => edit(theme)} title={t('appearance.edit')} type="button">
                  <Icon name="pencil" size={15} />
                </button>
                <button className="btn sm icon" onClick={() => duplicate(theme)} title={t('appearance.duplicate')} type="button">
                  <Icon name="copy" size={15} />
                </button>
                <button className="btn sm icon" onClick={() => downloadTheme(theme)} title={t('appearance.export')} type="button">
                  <Icon name="download" size={15} />
                </button>
                <button className="btn sm" onClick={() => void share(theme)} type="button">
                  <Icon name="share" size={15} /> {t('appearance.share')}
                </button>
                <button
                  className="btn sm danger icon"
                  onClick={() => remove(theme)}
                  aria-label={t('appearance.delete')}
                  title={t('appearance.delete')}
                  type="button"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <h2>{t('appearance.builtinTitle')}</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          {t('appearance.builtinHint')}
        </p>
        <div className="col" style={{ gap: 8 }}>
          {themes
            .filter((theme) => theme.builtin)
            .map((theme) => (
              <div key={theme.id} className="row small" style={{ gap: 10 }}>
                <span
                  className="tc-dot"
                  style={{
                    display: 'inline-block',
                    width: 16,
                    height: 16,
                    borderRadius: 5,
                    background: (previews.get(theme.id) ?? {}).accent,
                  }}
                />
                <span style={{ fontWeight: 650 }}>{theme.name}</span>
                <span className="muted nowrap">{theme.description}</span>
                <div className="spacer" />
                <button className="btn ghost sm" onClick={() => duplicate(theme)} type="button">
                  <Icon name="copy" size={14} /> {t('appearance.duplicate')}
                </button>
              </div>
            ))}
        </div>
      </div>

      {draft && (
        <ThemeEditor
          draft={draft}
          onChange={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
          onExport={() => downloadTheme(draft)}
          onShare={() => void share(draft)}
        />
      )}

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={importText}
      />
    </div>
  );
}

/* ------------------------------ theme card ------------------------------- */

function ThemeCard({
  theme,
  tokens,
  active,
  onSelect,
}: {
  theme: Theme;
  tokens: Record<string, string>;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button className="theme-card" aria-pressed={active} onClick={onSelect} type="button">
      <span
        className="tc-preview"
        style={{ background: tokens.bg, color: tokens.text, borderBottom: `1px solid ${tokens.border}` }}
      >
        <span className="tc-bar" style={{ background: tokens.accent }} />
        <span className="tc-dots">
          <span className="tc-dot" style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }} />
          <span className="tc-dot" style={{ background: tokens['surface-2'] }} />
          <span className="tc-dot" style={{ background: tokens.ok }} />
          <span className="tc-dot" style={{ background: tokens.warn }} />
          <span className="tc-dot" style={{ background: tokens.danger }} />
        </span>
      </span>
      <span className="tc-meta">
        <span className="col" style={{ gap: 1, minWidth: 0, alignItems: 'flex-start' }}>
          <span className="tc-name nowrap">{theme.name}</span>
          <span className="tc-sub nowrap">
            {theme.builtin ? t('appearance.builtin') : theme.author || t('appearance.custom')}
          </span>
        </span>
        <div className="spacer" />
        {active && <Icon name="check" size={16} />}
      </span>
    </button>
  );
}

/* ------------------------------ editor ----------------------------------- */

function ThemeEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  onExport,
  onShare,
}: {
  draft: Theme;
  onChange: (t: Theme) => void;
  onSave: () => void;
  onCancel: () => void;
  onExport: () => void;
  onShare: () => void;
}) {
  const { t } = useTranslation();
  const groups: { id: 'colors' | 'shape' | 'type'; label: string }[] = [
    { id: 'colors', label: t('appearance.groupColors') },
    { id: 'shape', label: t('appearance.groupShape') },
    { id: 'type', label: t('appearance.groupType') },
  ];

  const setToken = (key: string, value: string): void =>
    onChange({ ...draft, tokens: { ...draft.tokens, [key]: value } });

  return (
    <Dialog open onClose={onCancel} title={t('appearance.editorTitle')}>
      <div className="col" style={{ gap: 12 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="field">{t('appearance.name')}</label>
            <input
              className="input"
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
            />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="field">{t('appearance.author')}</label>
            <input
              className="input"
              value={draft.author ?? ''}
              onChange={(e) => onChange({ ...draft, author: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="field">{t('appearance.mode')}</label>
          <div className="segmented" role="tablist">
            <button
              role="tab"
              aria-selected={draft.mode === 'light'}
              onClick={() => onChange({ ...draft, mode: 'light' })}
              type="button"
            >
              <Icon name="sun" size={15} /> {t('settings.themeLight')}
            </button>
            <button
              role="tab"
              aria-selected={draft.mode === 'dark'}
              onClick={() => onChange({ ...draft, mode: 'dark' })}
              type="button"
            >
              <Icon name="moon" size={15} /> {t('settings.themeDark')}
            </button>
          </div>
        </div>

        <div className="divider" />

        <ContrastMeter tokens={draft.tokens} />

        {groups.map((group) => (
          <div key={group.id}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
              {group.label}
            </div>
            <div className="editor-grid">
              {THEME_TOKENS.filter((tok) => tok.group === group.id).map((tok) => (
                <div className="token-row" key={tok.key}>
                  <span className="tr-label">{tok.label}</span>
                  {tok.kind === 'color' ? (
                    <>
                      <input
                        type="color"
                        value={toHexColor(draft.tokens[tok.key] ?? '#000000')}
                        onChange={(e) => setToken(tok.key, e.target.value)}
                        aria-label={tok.label}
                      />
                      <input
                        type="text"
                        value={draft.tokens[tok.key] ?? ''}
                        onChange={(e) => setToken(tok.key, e.target.value)}
                      />
                    </>
                  ) : (
                    <input
                      type="text"
                      style={{ flex: 1, width: 'auto' }}
                      value={draft.tokens[tok.key] ?? ''}
                      onChange={(e) => setToken(tok.key, e.target.value)}
                      aria-label={tok.label}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="row wrap" style={{ gap: 8, position: 'sticky', bottom: 0 }}>
          <button className="btn primary" onClick={onSave} type="button">
            <Icon name="check" size={16} /> {t('common.save')}
          </button>
          <button className="btn" onClick={onExport} type="button">
            <Icon name="download" size={16} /> {t('appearance.export')}
          </button>
          <button className="btn" onClick={onShare} type="button">
            <Icon name="link" size={16} /> {t('appearance.share')}
          </button>
          <div className="spacer" />
          <button className="btn ghost" onClick={onCancel} type="button">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function ContrastRow({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  const ratio = contrastRatio(fg, bg);
  if (ratio === null) return null;
  const level = wcagLevel(ratio);
  const ok = level !== 'fail';
  return (
    <div className="contrast-row">
      <span className="cr-sample" style={{ background: bg, color: fg }}>
        Aa
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <span className="cr-ratio">{ratio.toFixed(2)}:1</span>
      <span className={ok ? 'pill-ok' : 'pill-bad'}>{level === 'fail' ? 'AA ✗' : level}</span>
    </div>
  );
}

function ContrastMeter({ tokens }: { tokens: Record<string, string> }) {
  const { t } = useTranslation();
  return (
    <div className="col" style={{ gap: 6 }}>
      <label className="field" style={{ margin: 0 }}>
        {t('appearance.contrast')}
      </label>
      <ContrastRow label={t('appearance.contrastText')} fg={tokens.text ?? '#000'} bg={tokens.bg ?? '#fff'} />
      <ContrastRow
        label={t('appearance.contrastSurface')}
        fg={tokens.text ?? '#000'}
        bg={tokens.surface ?? '#fff'}
      />
      <ContrastRow
        label={t('appearance.contrastAccent')}
        fg={tokens['accent-ink'] ?? '#fff'}
        bg={tokens.accent ?? '#000'}
      />
    </div>
  );
}

/* ------------------------------ import ----------------------------------- */

function ImportDialog({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (text: string) => boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');

  useEffect(() => {
    if (!open) setText('');
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title={t('appearance.import')}>
      <div className="col" style={{ gap: 12 }}>
        <p className="small muted" style={{ margin: 0 }}>
          {t('appearance.importHint')}
        </p>
        <textarea
          className="code-input"
          placeholder='{ "name": "My theme", "mode": "dark", "tokens": { "accent": "#7c83ff" } }'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row wrap" style={{ gap: 8 }}>
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
            }}
          />
        </div>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose} type="button">
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={() => onImport(text)} type="button">
            <Icon name="upload" size={16} /> {t('appearance.import')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
