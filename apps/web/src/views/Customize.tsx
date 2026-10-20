import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AUSTRIAN_SUBJECT_PRESET,
  DEFAULT_CUSTOMIZATION,
  PASTEL_SUBJECT_PRESET,
  updateCustomization,
  useCustomization,
  type CancellationStyle,
  type SubstitutionStyle,
} from '../customization.js';
import { navigate, type Route } from '../router.js';
import { Dialog, Icon, Segmented } from '../components/primitives.js';
import { NAV_DEFS } from '../components/AppShell.js';
import { useApp } from '../store.js';
import { subjectColor } from '../lib.js';
import { HsvColorPicker } from '../components/HsvColorPicker.js';

const AVAILABLE_NAV_ROUTES: Route[] = [
  'today',
  'timetable',
  'subs',
  'rooms',
  'homework',
  'exams',
  'absences',
  'messages',
  'settings',
];

const ACCENT_PRESETS = [
  { name: 'Indigo', color: '#4f46e5' },
  { name: 'Smaragd', color: '#059669' },
  { name: 'Himmelblau', color: '#0284c7' },
  { name: 'Violett', color: '#7c3aed' },
  { name: 'Rubinrot', color: '#e11d48' },
  { name: 'Bernstein', color: '#d97706' },
  { name: 'Cyan Neon', color: '#06b6d4' },
  { name: 'Monochrom', color: '#52525b' },
];

const QUICK_COLORS = [
  '#dc2626', // Red
  '#2563eb', // Blue
  '#eab308', // Yellow
  '#16a34a', // Green
  '#ea580c', // Orange
  '#7c3aed', // Purple
  '#0891b2', // Cyan
  '#db2777', // Pink
  '#4b5563', // Grey
];

export function CustomizeView() {
  const { t } = useTranslation();
  const c = useCustomization();
  const { master } = useApp();

  const [newSubjCode, setNewSubjCode] = useState('');
  const [newSubjColor, setNewSubjColor] = useState('#2563eb');
  const [aliasCode, setAliasCode] = useState('');
  const [aliasName, setAliasName] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [hsvTarget, setHsvTarget] = useState<{ id: string; name: string; color: string } | null>(null);

  function handleHsvChange(newHex: string) {
    if (!hsvTarget) return;
    setHsvTarget({ ...hsvTarget, color: newHex });

    if (hsvTarget.id === 'ACCENT') {
      updateCustomization({ customAccent: newHex });
    } else if (hsvTarget.id === 'NEW_SUBJ') {
      setNewSubjColor(newHex);
    } else {
      handleSetSubjectColor(hsvTarget.id, newHex);
    }
  }

  function handleAddAlias() {
    const code = aliasCode.trim().toUpperCase();
    const name = aliasName.trim();
    if (!code || !name) return;
    updateCustomization({
      subjectAliases: {
        ...(c.subjectAliases || {}),
        [code]: name,
      },
    });
    setAliasCode('');
    setAliasName('');
  }

  function handleRemoveAlias(code: string) {
    const next = { ...(c.subjectAliases || {}) };
    delete next[code.toUpperCase()];
    updateCustomization({ subjectAliases: next });
  }

  function handleApplyAliasPresets() {
    updateCustomization({
      subjectAliases: {
        ...(c.subjectAliases || {}),
        BSP: 'Sport',
        BSPK: 'Sport (Knaben)',
        BSPM: 'Sport (Mädchen)',
        GWK: 'Geographie',
        GEO: 'Geographie',
        GS: 'Geschichte',
        GSP: 'Geschichte',
        BU: 'Biologie',
        BIO: 'Biologie',
        ME: 'Musik',
        BE: 'Kunst & Gestalten',
        INF: 'Informatik',
        RK: 'Religion (kath.)',
        EV: 'Religion (evang.)',
        PH: 'Physik',
        CH: 'Chemie',
      },
    });
  }

  // Derive known subjects list from master data + defaults
  const subjectList = useMemo(() => {
    const set = new Set<string>();
    // First, add all standard subjects
    Object.keys(AUSTRIAN_SUBJECT_PRESET).forEach((k) => set.add(k));
    // Add any existing customized subjects
    Object.keys(c.subjectColors || {}).forEach((k) => set.add(k));
    // Add subjects from master data if available
    if (master?.subjects) {
      master.subjects.forEach((s) => {
        if (s.name) set.add(s.name.toUpperCase());
      });
    }
    return Array.from(set).sort();
  }, [c.subjectColors, master?.subjects]);

  function toggleNavItem(r: Route) {
    let next: Route[];
    if (c.navItems.includes(r)) {
      if (c.navItems.length <= 2) return; // keep at least 2
      next = c.navItems.filter((item) => item !== r);
    } else {
      if (c.navItems.length >= 5) {
        next = [...c.navItems.slice(0, 4), r];
      } else {
        next = [...c.navItems, r];
      }
    }
    updateCustomization({ navItems: next });
  }

  function handleSetSubjectColor(subject: string, color: string) {
    const updated = {
      ...c.subjectColors,
      [subject.toUpperCase()]: color,
    };
    updateCustomization({ subjectColors: updated });
  }

  function handleAddCustomSubject() {
    const clean = newSubjCode.trim().toUpperCase();
    if (!clean) return;
    handleSetSubjectColor(clean, newSubjColor);
    setNewSubjCode('');
  }

  function handleCopyDotfile() {
    try {
      const json = JSON.stringify(c, null, 2);
      navigator.clipboard.writeText(json);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2500);
    } catch {
      // Ignore
    }
  }

  function handleImportDotfile() {
    try {
      if (!importText.trim()) return;
      const parsed = JSON.parse(importText.trim());
      updateCustomization(parsed);
      setImportStatus(t('customize.importSuccess'));
      setImportText('');
      setTimeout(() => setImportStatus(null), 3500);
    } catch {
      setImportStatus(t('customize.importError'));
      setTimeout(() => setImportStatus(null), 3500);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="row wrap" style={{ gap: 12, marginBottom: 14, alignItems: 'center' }}>
        <div>
          <h1 className="page-title">{t('customize.title')}</h1>
          <div className="muted small">{t('customize.subtitle')}</div>
        </div>
        <div className="spacer" />
        <button
          type="button"
          className="btn sm"
          onClick={() => navigate('theme-studio')}
          style={{ gap: 6 }}
        >
          <span>🎨</span>
          <span>{t('themeStudio.openStudio')}</span>
        </button>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => updateCustomization(DEFAULT_CUSTOMIZATION)}
        >
          <Icon name="refresh" size={14} />
          <span>{t('customize.reset')}</span>
        </button>
      </div>

      {/* Layout & Navigation Customization */}
      <div className="section" style={{ marginTop: 0 }}>
        <h2>🧭 Layout & Navigationsleiste</h2>
        <div className="card pad col" style={{ gap: 14 }}>
          <div className="small muted">
            Vollständig anpassbare Benutzeroberfläche: Verschiebe die Menüleiste, passe die Breite an oder wähle dein bevorzugtes Desktop- und Mobil-Layout.
          </div>

          {/* Navigation Position */}
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Position der Menüleiste</span>
            <Segmented
              label="Position der Menüleiste"
              value={c.navPosition ?? 'sidebar-left'}
              onChange={(v) => updateCustomization({ navPosition: v as any })}
              options={[
                { value: 'sidebar-left', label: 'Sidebar Links' },
                { value: 'sidebar-right', label: 'Sidebar Rechts' },
                { value: 'navbar-top', label: 'Navbar Oben' },
                { value: 'taskbar-bottom', label: 'Taskbar Unten' },
                { value: 'compact-floating', label: 'Floating Dock' },
              ]}
            />
          </div>

          {/* Navigation Size */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Breite & Größe der Navigation</span>
            <Segmented
              label="Größe der Navigation"
              value={c.navSize ?? 'normal'}
              onChange={(v) => updateCustomization({ navSize: v as any })}
              options={[
                { value: 'compact', label: 'Kompakt (Icons)' },
                { value: 'normal', label: 'Normal' },
                { value: 'expanded', label: 'Erweitert' },
              ]}
            />
          </div>

          {/* Logo Position */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Logo-Darstellung</span>
            <Segmented
              label="Logo-Darstellung"
              value={c.logoPosition ?? 'left'}
              onChange={(v) => updateCustomization({ logoPosition: v as any })}
              options={[
                { value: 'left', label: 'Links (bündig)' },
                { value: 'center', label: 'Zentriert' },
                { value: 'hidden', label: 'Ausblenden' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Begrüßung & Startbildschirm (Today View) */}
      <div className="section">
        <h2>👋 {t('customize.todayGreetingTitle')}</h2>
        <div className="card pad col" style={{ gap: 14 }}>
          {/* Greeting Style */}
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.todayGreetingMode')}</span>
            <Segmented
              label={t('customize.todayGreetingMode')}
              value={c.todayGreetingMode ?? 'standard'}
              onChange={(v) => updateCustomization({ todayGreetingMode: v as any })}
              options={[
                { value: 'standard', label: t('customize.todayGreetingStandard') },
                { value: 'time-based', label: t('customize.todayGreetingTimeBased') },
                { value: 'custom', label: t('customize.todayGreetingCustom') },
              ]}
            />
          </div>

          {c.todayGreetingMode === 'custom' && (
            <div className="col" style={{ gap: 4, paddingLeft: 4 }}>
              <span className="small muted">{t('customize.todayGreetingCustom')}:</span>
              <input
                type="text"
                className="input sm"
                value={c.todayCustomGreeting || ''}
                onChange={(e) => updateCustomization({ todayCustomGreeting: e.target.value })}
                placeholder={t('customize.todayGreetingPlaceholder')}
              />
            </div>
          )}

          {/* Countdown Toggle */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>⏱️ {t('customize.todayCountdownTitle')}</span>
              <span className="tiny muted">{t('customize.todayCountdownHint')}</span>
            </div>
            <input
              type="checkbox"
              checked={c.todayShowCountdown !== false}
              onChange={(e) => updateCustomization({ todayShowCountdown: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
          </div>

          {/* Quick Actions Toggle */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>⚡ {t('customize.todayQuickActionsTitle')}</span>
              <span className="tiny muted">{t('customize.todayQuickActionsHint')}</span>
            </div>
            <input
              type="checkbox"
              checked={c.todayQuickActions !== false}
              onChange={(e) => updateCustomization({ todayQuickActions: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>

      {/* Quick Accent Color Tuner */}
      <div className="section">
        <h2>{t('customize.accentColor')}</h2>
        <div className="card pad col" style={{ gap: 12 }}>
          <div className="small muted">{t('customize.accentHint')}</div>
          <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
            {ACCENT_PRESETS.map((p) => {
              const active = c.customAccent === p.color;
              return (
                <button
                  key={p.color}
                  type="button"
                  className={`color-swatch ${active ? 'active' : ''}`}
                  style={{ background: p.color }}
                  title={p.name}
                  onClick={() =>
                    updateCustomization({
                      customAccent: active ? null : p.color,
                    })
                  }
                >
                  {active && <Icon name="check" size={16} />}
                </button>
              );
            })}
            <div className="row wrap" style={{ gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
              <button
                type="button"
                className="btn sm ghost"
                style={{ fontSize: 12 }}
                onClick={() =>
                  setHsvTarget({
                    id: 'ACCENT',
                    name: t('customize.accentColor'),
                    color: c.customAccent || '#4f46e5',
                  })
                }
              >
                {t('customize.hsvOpen')}
              </button>
              <input
                type="color"
                value={c.customAccent ?? '#4f46e5'}
                onChange={(e) => updateCustomization({ customAccent: e.target.value })}
                style={{ width: 34, height: 34, padding: 0, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                title={t('customize.colorPicker')}
              />
              {c.customAccent && (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => updateCustomization({ customAccent: null })}
                >
                  {t('customize.defaultColor')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fächer-Anzeige & Aliase */}
      <div className="section">
        <h2>{t('customize.subjectDisplayTitle')}</h2>
        <div className="card pad col" style={{ gap: 14 }}>
          <div className="small muted">{t('customize.subjectDisplaySubtitle')}</div>

          {/* Mode: code | name | both */}
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.subjectDisplayMode')}</span>
            <Segmented
              label={t('customize.subjectDisplayMode')}
              value={c.subjectDisplayMode ?? 'code'}
              onChange={(v) => updateCustomization({ subjectDisplayMode: v as 'code' | 'name' | 'both' })}
              options={[
                { value: 'code', label: t('customize.subjectModeCode') },
                { value: 'name', label: t('customize.subjectModeName') },
                { value: 'both', label: t('customize.subjectModeBoth') },
              ]}
            />
          </div>

          {/* Custom Aliases */}
          <div className="col" style={{ gap: 8, marginTop: 6, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div className="row wrap" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="col" style={{ gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.subjectAliasesTitle')}</span>
                <span className="tiny muted">{t('customize.subjectAliasesHint')}</span>
              </div>
              <button
                type="button"
                className="btn sm ghost"
                onClick={handleApplyAliasPresets}
                style={{ fontSize: 12 }}
              >
                {t('customize.aliasPreset')}
              </button>
            </div>

            {/* Existing Aliases list */}
            {Object.keys(c.subjectAliases || {}).length === 0 ? (
              <div className="tiny muted" style={{ fontStyle: 'italic', padding: '6px 0' }}>
                {t('customize.aliasNone')}
              </div>
            ) : (
              <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                {Object.entries(c.subjectAliases || {}).map(([orig, alias]) => (
                  <div
                    key={orig}
                    className="row"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--card-radius, 6px)',
                      padding: '4px 8px',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{orig}</span>
                    <span className="muted">➔</span>
                    <span style={{ fontWeight: 600 }}>{alias}</span>
                    <button
                      type="button"
                      className="btn ghost icon"
                      style={{ width: 20, height: 20, padding: 0, marginLeft: 2 }}
                      onClick={() => handleRemoveAlias(orig)}
                      title={t('common.delete')}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new alias row */}
            <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input
                type="text"
                placeholder={t('customize.aliasOriginalCode')}
                value={aliasCode}
                onChange={(e) => setAliasCode(e.target.value)}
                style={{
                  maxWidth: 140,
                  padding: '6px 10px',
                  borderRadius: 'var(--card-radius, 6px)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontSize: 13,
                  textTransform: 'uppercase',
                }}
              />
              <input
                type="text"
                placeholder={t('customize.aliasCustomName')}
                value={aliasName}
                onChange={(e) => setAliasName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddAlias();
                }}
                style={{
                  maxWidth: 200,
                  padding: '6px 10px',
                  borderRadius: 'var(--card-radius, 6px)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                className="btn sm"
                disabled={!aliasCode.trim() || !aliasName.trim()}
                onClick={handleAddAlias}
              >
                <Icon name="plus" size={13} />
                <span>{t('customize.aliasAdd')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* StundenFarben: Customizable Subject Colors */}
      <div className="section">
        <h2>{t('customize.subjectColorsTitle')}</h2>
        <div className="card pad col" style={{ gap: 14 }}>
          <div className="small muted">{t('customize.subjectColorsSubtitle')}</div>

          {/* Preset Buttons */}
          <div className="row wrap" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn sm"
              onClick={() => updateCustomization({ subjectColors: { ...AUSTRIAN_SUBJECT_PRESET } })}
            >
              {t('customize.presetAustrian')}
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => updateCustomization({ subjectColors: { ...PASTEL_SUBJECT_PRESET } })}
            >
              {t('customize.presetPastel')}
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => updateCustomization({ subjectColors: {} })}
            >
              <Icon name="refresh" size={13} />
              <span>{t('customize.presetResetColors')}</span>
            </button>
          </div>

          {/* Add custom subject row */}
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginTop: 4 }}>
            <input
              type="text"
              placeholder={t('customize.addSubjectPlaceholder')}
              value={newSubjCode}
              onChange={(e) => setNewSubjCode(e.target.value)}
              style={{
                maxWidth: 160,
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            />
            <input
              type="color"
              value={newSubjColor}
              onChange={(e) => setNewSubjColor(e.target.value)}
              style={{ width: 36, height: 36, padding: 0, border: 'none', borderRadius: 8, cursor: 'pointer' }}
              title={t('customize.colorPicker')}
            />
            <button
              type="button"
              className="btn sm ghost"
              onClick={() =>
                setHsvTarget({
                  id: 'NEW_SUBJ',
                  name: newSubjCode.trim().toUpperCase() || t('customize.addSubject'),
                  color: newSubjColor,
                })
              }
              title={t('customize.hsvOpen')}
            >
              🎨 HSV
            </button>
            <button type="button" className="btn sm primary" onClick={handleAddCustomSubject}>
              <Icon name="plus" size={14} />
              <span>{t('customize.addSubject')}</span>
            </button>
          </div>

          {/* Subject Color Cards List */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 10,
              marginTop: 6,
              maxHeight: 420,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {subjectList.map((code) => {
              const currentColor = subjectColor(undefined, code);
              return (
                <div
                  key={code}
                  className="card"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {/* Subject badge preview (clickable to open HSV picker) */}
                  <button
                    type="button"
                    style={{
                      background: currentColor,
                      color: '#fff',
                      padding: '4px 8px',
                      borderRadius: 'var(--card-radius, 6px)',
                      fontWeight: 800,
                      fontSize: 12,
                      minWidth: 44,
                      textAlign: 'center',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      setHsvTarget({
                        id: code,
                        name: code,
                        color: currentColor.startsWith('#') ? currentColor : '#2563eb',
                      })
                    }
                    title={`${code}: ${t('customize.hsvOpen')}`}
                  >
                    {code}
                  </button>

                  {/* Native Color picker */}
                  <input
                    type="color"
                    value={currentColor.startsWith('#') ? currentColor : '#2563eb'}
                    onChange={(e) => handleSetSubjectColor(code, e.target.value)}
                    style={{ width: 28, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    title={t('customize.colorPicker')}
                  />

                  {/* HSV Color button */}
                  <button
                    type="button"
                    className="btn ghost icon sm"
                    style={{ width: 26, height: 26, padding: 0, fontSize: 13 }}
                    onClick={() =>
                      setHsvTarget({
                        id: code,
                        name: code,
                        color: currentColor.startsWith('#') ? currentColor : '#2563eb',
                      })
                    }
                    title={t('customize.hsvOpen')}
                  >
                    🎨
                  </button>

                  {/* Quick palette dots */}
                  <div className="row" style={{ gap: 4, flex: 1, flexWrap: 'wrap' }}>
                    {QUICK_COLORS.slice(0, 4).map((q) => (
                      <button
                        key={q}
                        type="button"
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 999,
                          background: q,
                          border: currentColor === q ? '2px solid var(--text)' : 'none',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        onClick={() => handleSetSubjectColor(code, q)}
                        title={q}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Timetable & Break Options */}
      <div className="section">
        <h2>{t('customize.ttTitle')}</h2>
        <div className="card pad col" style={{ gap: 14 }}>
          {/* Breaks in Timetable */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>☕ {t('customize.showBreaks')}</span>
              <span className="tiny muted">{t('customize.showBreaksHint')}</span>
            </div>
            <input
              type="checkbox"
              checked={c.showBreaks}
              onChange={(e) => updateCustomization({ showBreaks: e.target.checked })}
              style={{ width: 20, height: 20, cursor: 'pointer' }}
            />
          </div>

          {/* Pausen-Texte & Detail-Konfiguration */}
          {c.showBreaks && (
            <div
              className="col"
              style={{
                gap: 12,
                padding: 12,
                borderRadius: 'var(--card-radius, 8px)',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                ☕ {t('customize.breakTextsTitle')}
              </div>
              <div className="tiny muted">{t('customize.breakTextsSubtitle')}</div>

              {/* Text inputs for break labels */}
              <div className="row wrap" style={{ gap: 10 }}>
                <div className="col" style={{ flex: '1 1 140px', gap: 4 }}>
                  <label className="tiny muted">{t('customize.breakShortLabel')}</label>
                  <input
                    type="text"
                    value={c.breakShortLabel ?? 'Pause'}
                    placeholder="Pause"
                    onChange={(e) => updateCustomization({ breakShortLabel: e.target.value })}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--card-radius, 6px)',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: 13,
                    }}
                  />
                </div>

                <div className="col" style={{ flex: '1 1 140px', gap: 4 }}>
                  <label className="tiny muted">{t('customize.breakLongLabel')}</label>
                  <input
                    type="text"
                    value={c.breakLongLabel ?? 'Große Pause'}
                    placeholder="Große Pause"
                    onChange={(e) => updateCustomization({ breakLongLabel: e.target.value })}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--card-radius, 6px)',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: 13,
                    }}
                  />
                </div>

                <div className="col" style={{ flex: '1 1 140px', gap: 4 }}>
                  <label className="tiny muted">{t('customize.breakLunchLabel')}</label>
                  <input
                    type="text"
                    value={c.breakLunchLabel ?? 'Mittagspause'}
                    placeholder="Mittagspause"
                    onChange={(e) => updateCustomization({ breakLunchLabel: e.target.value })}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--card-radius, 6px)',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              {/* Threshold filter: breakMinMinutes */}
              <div className="col" style={{ gap: 6, marginTop: 4 }}>
                <span className="tiny muted" style={{ fontWeight: 600 }}>{t('customize.breakMinMinutes')}</span>
                <Segmented
                  label={t('customize.breakMinMinutes')}
                  value={String(c.breakMinMinutes ?? 5)}
                  onChange={(v) => updateCustomization({ breakMinMinutes: Number(v) })}
                  options={[
                    { value: '5', label: t('customize.breakMin5') },
                    { value: '10', label: t('customize.breakMin10') },
                    { value: '15', label: t('customize.breakMin15') },
                    { value: '25', label: t('customize.breakMin25') },
                  ]}
                />
              </div>

              {/* Break visual style: bar | minimal | card */}
              <div className="col" style={{ gap: 6, marginTop: 4 }}>
                <span className="tiny muted" style={{ fontWeight: 600 }}>{t('customize.breakStyle')}</span>
                <Segmented
                  label={t('customize.breakStyle')}
                  value={c.breakStyle ?? 'bar'}
                  onChange={(v) => updateCustomization({ breakStyle: v as 'bar' | 'minimal' | 'card' })}
                  options={[
                    { value: 'bar', label: t('customize.breakStyleBar') },
                    { value: 'minimal', label: t('customize.breakStyleMinimal') },
                    { value: 'card', label: t('customize.breakStyleCard') },
                  ]}
                />
              </div>

              {/* Show break duration checkbox */}
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <div className="col" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{t('customize.showBreakDuration')}</span>
                  <span className="tiny muted">{t('customize.showBreakDurationHint')}</span>
                </div>
                <input
                  type="checkbox"
                  checked={c.showBreakDuration ?? true}
                  onChange={(e) => updateCustomization({ showBreakDuration: e.target.checked })}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* Week Layout: Scroll vs Fit */}
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.weekLayout')}</span>
            <span className="tiny muted">{t('customize.weekLayoutHint')}</span>
            <Segmented
              label={t('customize.weekLayout')}
              value={c.weekLayout}
              onChange={(v) => updateCustomization({ weekLayout: v as 'scroll' | 'fit' })}
              options={[
                { value: 'scroll', label: t('customize.weekLayoutScroll') },
                { value: 'fit', label: t('customize.weekLayoutFit') },
              ]}
            />
          </div>

          {/* Period numbers toggle */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.showPeriodNumber')}</span>
              <span className="tiny muted">1., 2., 3. Stunde</span>
            </div>
            <input
              type="checkbox"
              checked={c.showPeriodNumber}
              onChange={(e) => updateCustomization({ showPeriodNumber: e.target.checked })}
              style={{ width: 20, height: 20, cursor: 'pointer' }}
            />
          </div>

          {/* Period times toggle */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.showPeriodTimes')}</span>
              <span className="tiny muted">07:50–08:40</span>
            </div>
            <input
              type="checkbox"
              checked={c.showPeriodTimes}
              onChange={(e) => updateCustomization({ showPeriodTimes: e.target.checked })}
              style={{ width: 20, height: 20, cursor: 'pointer' }}
            />
          </div>

          {/* Room names in week view */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.showRoomInWeek')}</span>
            </div>
            <input
              type="checkbox"
              checked={c.showRoomInWeek}
              onChange={(e) => updateCustomization({ showRoomInWeek: e.target.checked })}
              style={{ width: 20, height: 20, cursor: 'pointer' }}
            />
          </div>

          {/* Teacher initials in week view */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.showTeacherInWeek')}</span>
            </div>
            <input
              type="checkbox"
              checked={c.showTeacherInWeek}
              onChange={(e) => updateCustomization({ showTeacherInWeek: e.target.checked })}
              style={{ width: 20, height: 20, cursor: 'pointer' }}
            />
          </div>

          {/* Weekend Toggle */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.showWeekend')}</span>
              <span className="tiny muted">{t('customize.showWeekendHint')}</span>
            </div>
            <input
              type="checkbox"
              checked={c.showWeekend}
              onChange={(e) => updateCustomization({ showWeekend: e.target.checked })}
              style={{ width: 20, height: 20, cursor: 'pointer' }}
            />
          </div>

          {/* Free Periods Toggle */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.showFreePeriods')}</span>
              <span className="tiny muted">{t('customize.showFreePeriodsHint')}</span>
            </div>
            <input
              type="checkbox"
              checked={c.showFreePeriods}
              onChange={(e) => updateCustomization({ showFreePeriods: e.target.checked })}
              style={{ width: 20, height: 20, cursor: 'pointer' }}
            />
          </div>

          {/* Density */}
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.density')}</span>
            <Segmented
              label={t('customize.density')}
              value={c.timetableDensity}
              onChange={(v) => updateCustomization({ timetableDensity: v as 'compact' | 'normal' | 'spacious' })}
              options={[
                { value: 'compact', label: t('customize.densityCompact') },
                { value: 'normal', label: t('customize.densityNormal') },
                { value: 'spacious', label: t('customize.densitySpacious') },
              ]}
            />
          </div>

          {/* Gleichmäßige Stunden-Höhe (Raster-Skalierung) */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.periodHeightTitle')}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--accent)' }}>
                {c.periodHeight ?? 84} px
              </span>
            </div>
            <span className="tiny muted">
              {t('customize.periodHeightHint')}
            </span>
            <input
              type="range"
              min="60"
              max="140"
              step="2"
              value={c.periodHeight ?? 84}
              onChange={(e) => updateCustomization({ periodHeight: Number(e.target.value) })}
              style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
          </div>

          {/* Uhrzeiten-Format in Perioden-Spalte */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.periodTimeFormatTitle')}</span>
            <span className="tiny muted">
              {t('customize.periodTimeFormatHint')}
            </span>
            <Segmented
              label={t('customize.periodTimeFormatTitle')}
              value={c.periodTimeFormat ?? 'start-end'}
              onChange={(v) => updateCustomization({ periodTimeFormat: v as any })}
              options={[
                { value: 'start-end', label: t('customize.periodTimeStartEnd') },
                { value: 'start-only', label: t('customize.periodTimeStartOnly') },
              ]}
            />
          </div>

          {/* Leere Abendstunden trimmen */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.trimPeriodsTitle')}</span>
            <span className="tiny muted">
              {t('customize.trimPeriodsHint')}
            </span>
            <Segmented
              label={t('customize.trimPeriodsTitle')}
              value={c.trimEmptyPeriods !== false ? 'trim' : 'all'}
              onChange={(v) => updateCustomization({ trimEmptyPeriods: v === 'trim' })}
              options={[
                { value: 'trim', label: t('customize.trimPeriodsAuto') },
                { value: 'all', label: t('customize.trimPeriodsAll') },
              ]}
            />
          </div>

          {/* Ferien-Darstellung */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.holidayDisplayTitle')}</span>
            <span className="tiny muted">
              {t('customize.holidayDisplayHint')}
            </span>
            <Segmented
              label={t('customize.holidayDisplayTitle')}
              value={c.holidayDisplayStyle ?? 'both'}
              onChange={(v) => updateCustomization({ holidayDisplayStyle: v as any })}
              options={[
                { value: 'both', label: t('customize.holidayDisplayBoth') },
                { value: 'banner', label: t('customize.holidayDisplayBanner') },
                { value: 'card', label: t('customize.holidayDisplayCard') },
              ]}
            />
          </div>

          {/* Standard-Ansicht beim Öffnen */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.timetableStartupView')}</span>
            <Segmented
              label={t('customize.timetableStartupView')}
              value={c.timetableDefaultView ?? 'week'}
              onChange={(v) => updateCustomization({ timetableDefaultView: v as 'week' | 'day' })}
              options={[
                { value: 'week', label: t('timetable.week') },
                { value: 'day', label: t('timetable.day') },
              ]}
            />
          </div>

          {/* Schriftgröße im Stundenplan */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.timetableFontSize')}</span>
            <Segmented
              label={t('customize.timetableFontSize')}
              value={c.timetableCellFontSize ?? 'medium'}
              onChange={(v) => updateCustomization({ timetableCellFontSize: v as 'small' | 'medium' | 'large' })}
              options={[
                { value: 'small', label: t('customize.timetableFontSmall') },
                { value: 'medium', label: t('customize.timetableFontMedium') },
                { value: 'large', label: t('customize.timetableFontLarge') },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Ausfälle & Vertretungen (Sublierungen) */}
      <div className="section">
        <h2>⚠️ {t('customize.cancellationStyleTitle')} & {t('subs.title')}</h2>
        <div className="card pad col" style={{ gap: 16 }}>
          {/* Anordnung paralleler Stunden (Gruppen & Vertretungen) */}
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.parallelLayoutTitle')}</span>
            <span className="tiny muted">
              {t('customize.parallelLayoutHint')}
            </span>
            <Segmented
              label={t('customize.parallelLayoutTitle')}
              value={c.parallelLessonLayout ?? 'side-by-side'}
              onChange={(v) => updateCustomization({ parallelLessonLayout: v as 'side-by-side' | 'stacked' })}
              options={[
                { value: 'side-by-side', label: t('customize.parallelSideBySide') },
                { value: 'stacked', label: t('customize.parallelStacked') },
              ]}
            />
          </div>

          {/* Vertretungs-Filtermodus */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.substDisplayTitle')}</span>
            <span className="tiny muted">
              {t('customize.substDisplayHint')}
            </span>
            <Segmented
              label={t('customize.substDisplayTitle')}
              value={c.substDisplayMode ?? 'both'}
              onChange={(v) => updateCustomization({ substDisplayMode: v as any })}
              options={[
                { value: 'both', label: t('customize.substDisplayBoth') },
                { value: 'subst-only', label: t('customize.substDisplaySubstOnly') },
                { value: 'cancelled-only', label: t('customize.substDisplayCancelledOnly') },
              ]}
            />
          </div>

          {/* Ausfall-Darstellung */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.cancellationStyleTitle')}</span>
            <span className="tiny muted">{t('customize.cancellationStyleHint')}</span>
            <Segmented
              label={t('customize.cancellationStyleTitle')}
              value={c.cancellationStyle ?? 'strikethrough'}
              onChange={(v) => updateCustomization({ cancellationStyle: v as CancellationStyle })}
              options={[
                { value: 'strikethrough', label: t('customize.cancelStrikethrough') },
                { value: 'ghost', label: t('customize.cancelGhost') },
                { value: 'neon', label: t('customize.cancelNeon') },
                { value: 'redacted', label: t('customize.cancelRedacted') },
                { value: 'transparent', label: t('customize.cancelTransparent') },
                { value: 'hidden', label: t('customize.cancelHidden') },
              ]}
            />
          </div>

          {/* Vertretungs-Darstellung */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.substitutionStyleTitle')}</span>
            <span className="tiny muted">{t('customize.substitutionStyleHint')}</span>
            <Segmented
              label={t('customize.substitutionStyleTitle')}
              value={c.substitutionStyle ?? 'highlight'}
              onChange={(v) => updateCustomization({ substitutionStyle: v as SubstitutionStyle })}
              options={[
                { value: 'highlight', label: t('customize.substHighlight') },
                { value: 'neon', label: t('customize.substNeon') },
                { value: 'glass', label: t('customize.substGlass') },
                { value: 'replaced', label: t('customize.substReplaced') },
                { value: 'badge', label: t('customize.substBadge') },
              ]}
            />
          </div>

          {/* Anordnung bei Vertretung & Entfall (Split-Card Side-by-Side) */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.splitOrderTitle')}</span>
            <span className="tiny muted">
              {t('customize.splitOrderHint')}
            </span>
            <Segmented
              label={t('customize.splitOrderTitle')}
              value={c.splitSubstOrder ?? 'subst-first'}
              onChange={(v) => updateCustomization({ splitSubstOrder: v as 'subst-first' | 'cancelled-first' })}
              options={[
                { value: 'subst-first', label: t('customize.splitOrderSubstFirst') },
                { value: 'cancelled-first', label: t('customize.splitOrderCancelledFirst') },
              ]}
            />
          </div>

          {/* Standard-Filter für Vertretungen */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.subsFilterModeTitle')}</span>
            <Segmented
              label={t('customize.subsFilterModeTitle')}
              value={c.subsFilterMode ?? 'all'}
              onChange={(v) => updateCustomization({ subsFilterMode: v as 'all' | 'my-subjects' })}
              options={[
                { value: 'all', label: t('customize.subsFilterAll') },
                { value: 'my-subjects', label: t('customize.subsFilterMine') },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Stundenplan-Symbole & Badges */}
      <div className="section">
        <h2>{t('customize.badgesTitle')}</h2>
        <div className="card pad col" style={{ gap: 14 }}>
          <div className="small muted">
            {t('customize.badgesHint')}
          </div>

          {/* Toggle Badges */}
          <label className="row" style={{ gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={c.showLessonBadges !== false}
              onChange={(e) => updateCustomization({ showLessonBadges: e.target.checked })}
            />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.showBadgesToggle')}</span>
          </label>

          {c.showLessonBadges !== false && (
            <div className="col" style={{ gap: 12, paddingTop: 6 }}>
              {/* Info Icon */}
              <div className="col" style={{ gap: 4 }}>
                <span className="small" style={{ fontWeight: 600 }}>
                  {t('customize.iconInfoLabel')}
                </span>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    className="input sm"
                    style={{ width: 64, textAlign: 'center', fontSize: 16 }}
                    value={c.iconInfo || 'ℹ️'}
                    onChange={(e) => updateCustomization({ iconInfo: e.target.value })}
                  />
                  <div className="row" style={{ gap: 4 }}>
                    {['ℹ️', '📌', '💡', '💬', '🔔'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="btn sm ghost"
                        style={{ padding: '4px 8px' }}
                        onClick={() => updateCustomization({ iconInfo: emoji })}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Homework Icon */}
              <div className="col" style={{ gap: 4 }}>
                <span className="small" style={{ fontWeight: 600 }}>
                  {t('customize.iconHomeworkLabel')}
                </span>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    className="input sm"
                    style={{ width: 64, textAlign: 'center', fontSize: 16 }}
                    value={c.iconHomework || '📝'}
                    onChange={(e) => updateCustomization({ iconHomework: e.target.value })}
                  />
                  <div className="row" style={{ gap: 4 }}>
                    {['📝', '📋', '📚', '✏️', '📖'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="btn sm ghost"
                        style={{ padding: '4px 8px' }}
                        onClick={() => updateCustomization({ iconHomework: emoji })}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Exam Icon */}
              <div className="col" style={{ gap: 4 }}>
                <span className="small" style={{ fontWeight: 600 }}>
                  {t('customize.iconExamLabel')}
                </span>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    className="input sm"
                    style={{ width: 64, textAlign: 'center', fontSize: 16 }}
                    value={c.iconExam || '🎓'}
                    onChange={(e) => updateCustomization({ iconExam: e.target.value })}
                  />
                  <div className="row" style={{ gap: 4 }}>
                    {['🎓', '⚠️', '🚨', '🎯', '💯'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="btn sm ghost"
                        style={{ padding: '4px 8px' }}
                        onClick={() => updateCustomization({ iconExam: emoji })}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Prüfungs-Hervorhebung */}
              <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <span className="small" style={{ fontWeight: 600 }}>
                  {t('customize.examHighlightTitle')}
                </span>
                <span className="tiny muted">
                  {t('customize.examHighlightHint')}
                </span>
                <Segmented
                  label={t('customize.examHighlightTitle')}
                  value={c.examHighlight ?? 'pulse-glow'}
                  onChange={(v) => updateCustomization({ examHighlight: v as any })}
                  options={[
                    { value: 'pulse-glow', label: t('customize.examHighlightPulse') },
                    { value: 'border-bold', label: t('customize.examHighlightBorder') },
                    { value: 'card-accent', label: t('customize.examHighlightGradient') },
                    { value: 'none', label: t('customize.examHighlightNone') },
                  ]}
                />
              </div>

              {/* Notensystem für Schnittrechner */}
              <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <span className="small" style={{ fontWeight: 600 }}>
                  {t('customize.examGradeScaleTitle')}:
                </span>
                <Segmented
                  label={t('customize.examGradeScaleTitle')}
                  value={c.examGradeScale ?? 'austrian'}
                  onChange={(v) => updateCustomization({ examGradeScale: v as any })}
                  options={[
                    { value: 'austrian', label: t('customize.examScaleAustrian') },
                    { value: 'german', label: t('customize.examScaleGerman') },
                    { value: 'swiss', label: t('customize.examScaleSwiss') },
                    { value: 'points', label: t('customize.examScalePoints') },
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Experten-Studio & Custom CSS */}
      <div className="section">
        <h2>💻 {t('customize.cssStudioTitle')}</h2>
        <div className="card pad col" style={{ gap: 14 }}>
          <div className="small muted">{t('customize.cssStudioSubtitle')}</div>

          {/* Font Family Selection */}
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.customFont')}</span>
            <Segmented
              label={t('customize.customFont')}
              value={c.customFont ?? 'default'}
              onChange={(v) => updateCustomization({ customFont: v as 'default' | 'monospace' | 'inter' | 'serif' })}
              options={[
                { value: 'default', label: t('customize.fontDefault') },
                { value: 'monospace', label: t('customize.fontMono') },
                { value: 'inter', label: t('customize.fontInter') },
                { value: 'serif', label: t('customize.fontSerif') },
              ]}
            />
          </div>

          {/* Card Corner Radius */}
          <div className="col" style={{ gap: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.cardRadius')}</span>
              <span className="badge small">{c.cardRadius ?? 9}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              value={c.cardRadius ?? 9}
              onChange={(e) => updateCustomization({ cardRadius: Number(e.target.value) })}
              style={{ cursor: 'pointer' }}
            />
          </div>

          {/* Live Custom CSS Injection */}
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.customCss')}</span>
            <textarea
              rows={4}
              value={c.customCss}
              onChange={(e) => updateCustomization({ customCss: e.target.value })}
              placeholder={t('customize.customCssPlaceholder')}
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12.5,
                background: 'var(--surface-2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 10px',
              }}
            />
          </div>

          {/* Dotfile / Backup & Restore */}
          <div className="col" style={{ gap: 8, marginTop: 4 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <button type="button" className="btn sm" onClick={handleCopyDotfile}>
                <Icon name="copy" size={14} />
                <span>{copyFeedback ? t('customize.copiedSuccess') : t('customize.exportDotfile')}</span>
              </button>
            </div>

            <div className="row wrap" style={{ gap: 8 }}>
              <input
                type="text"
                placeholder={t('customize.importPrompt')}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontSize: 12,
                }}
              />
              <button type="button" className="btn sm ghost" onClick={handleImportDotfile}>
                <Icon name="check" size={14} />
                <span>{t('customize.importDotfile')}</span>
              </button>
            </div>
            {importStatus && <span className="small ok">{importStatus}</span>}
          </div>
        </div>
      </div>

      {/* Navigation Bar Customization */}
      <div className="section">
        <h2>{t('customize.navTitle')}</h2>
        <div className="card pad col" style={{ gap: 12 }}>
          <div className="small muted">{t('customize.navHint')}</div>

          {/* Quick Nav Presets */}
          <div className="row wrap" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() =>
                updateCustomization({
                  navItems: ['today', 'timetable', 'subs', 'settings'],
                })
              }
            >
              {t('customize.presetDefault')}
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() =>
                updateCustomization({
                  navItems: ['today', 'timetable', 'exams', 'homework'],
                })
              }
            >
              {t('customize.presetStudy')}
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() =>
                updateCustomization({
                  navItems: ['today', 'timetable', 'rooms', 'settings'],
                })
              }
            >
              {t('customize.presetRooms')}
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: 8,
              marginTop: 4,
            }}
          >
            {AVAILABLE_NAV_ROUTES.map((r) => {
              const def = NAV_DEFS[r] ?? NAV_DEFS.today;
              const isSelected = c.navItems.includes(r);
              const orderIndex = c.navItems.indexOf(r);

              return (
                <div
                  key={r}
                  className="card"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: isSelected ? 'var(--surface-3)' : 'var(--surface-2)',
                    borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                  onClick={() => toggleNavItem(r)}
                >
                  <Icon name={def.icon} size={18} />
                  <span style={{ fontWeight: isSelected ? 700 : 500, fontSize: 13, flex: 1 }}>
                    {t(def.key)}
                  </span>
                  {isSelected && (
                    <span className="badge ok" style={{ fontSize: 10, padding: '2px 6px' }}>
                      #{orderIndex + 1}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Startup & Privacy */}
      <div className="section">
        <h2>{t('customize.behaviorTitle')}</h2>
        <div className="card pad col" style={{ gap: 14 }}>
          {/* Landing Page */}
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.landingPage')}</span>
            <Segmented
              label={t('customize.landingPage')}
              value={c.landingPage}
              onChange={(v) => updateCustomization({ landingPage: v as Route })}
              options={[
                { value: 'today', label: t('nav.today') },
                { value: 'timetable', label: t('nav.timetable') },
                { value: 'subs', label: t('nav.substitutions') },
                { value: 'rooms', label: t('modules.rooms') },
                { value: 'exams', label: t('modules.exams') },
              ]}
            />
          </div>

          {/* UI Scaling */}
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.uiScale')}</span>
            <Segmented
              label={t('customize.uiScale')}
              value={String(c.uiScale)}
              onChange={(v) => updateCustomization({ uiScale: Number(v) })}
              options={[
                { value: '90', label: t('customize.scaleCompact') },
                { value: '100', label: t('customize.scaleStandard') },
                { value: '110', label: t('customize.scaleLarge') },
                { value: '120', label: t('customize.scaleXLarge') },
              ]}
            />
          </div>

          {/* Privacy Shield */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.privacyMode')}</span>
              <span className="tiny muted">{t('customize.privacyModeHint')}</span>
            </div>
            <input
              type="checkbox"
              checked={c.privacyMode}
              onChange={(e) => updateCustomization({ privacyMode: e.target.checked })}
              style={{ width: 20, height: 20, cursor: 'pointer' }}
            />
          </div>

          {/* Animations & Visual Motion */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.animationsLevelTitle')}</span>
            <Segmented
              label={t('customize.animationsLevelTitle')}
              value={c.animationsLevel ?? 'full'}
              onChange={(v) => updateCustomization({ animationsLevel: v as 'full' | 'subtle' | 'none' })}
              options={[
                { value: 'full', label: t('customize.animFull') },
                { value: 'subtle', label: t('customize.animSubtle') },
                { value: 'none', label: t('customize.animNone') },
              ]}
            />
          </div>

          {/* Default Room Category */}
          <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customize.roomsDefaultCategoryTitle')}</span>
            <Segmented
              label={t('customize.roomsDefaultCategoryTitle')}
              value={c.roomsDefaultCategory ?? 'all'}
              onChange={(v) => updateCustomization({ roomsDefaultCategory: v as any })}
              options={[
                { value: 'all', label: t('customize.roomsCatAll') },
                { value: 'computer', label: t('customize.roomsCatComputer') },
                { value: 'gym', label: t('customize.roomsCatGym') },
                { value: 'science', label: t('customize.roomsCatScience') },
                { value: 'special', label: t('customize.roomsCatSpecial') },
              ]}
            />
          </div>

          {/* Rooms only free toggle */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>🔍 {t('rooms.filterFreeOnly')}</span>
              <span className="tiny muted">{t('rooms.filterFreeOnlyHint')}</span>
            </div>
            <input
              type="checkbox"
              checked={c.roomsOnlyFreeDefault}
              onChange={(e) => updateCustomization({ roomsOnlyFreeDefault: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>

      {/* Modal Dialog for HSV Color Picker */}
      <Dialog
        open={Boolean(hsvTarget)}
        onClose={() => setHsvTarget(null)}
        title={hsvTarget ? `${t('customize.hsvTitle')} — ${hsvTarget.name}` : t('customize.hsvTitle')}
      >
        {hsvTarget && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
            <HsvColorPicker
              color={hsvTarget.color}
              label={hsvTarget.name}
              onChange={handleHsvChange}
              onClose={() => setHsvTarget(null)}
            />
          </div>
        )}
      </Dialog>
    </div>
  );
}
