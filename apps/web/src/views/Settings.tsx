import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp, type NotifyPref } from '../store.js';
import { useInstallPrompt } from '../hooks.js';
import { navigate, type Route } from '../router.js';
import { notificationPermission, requestNotificationPermission } from '../notify.js';
import { getNavItems, getSettingsSections, listMods, useModsVersion } from '../mods.js';
import { getTheme, useThemes } from '../themes.js';
import { APP_VERSION } from '../version.js';
import { ModHost } from '../components/ModHost.js';
import { Icon, Segmented, Spinner } from '../components/primitives.js';
import { CalendarExportModal } from '../components/CalendarExportModal.js';
import { InstallModal } from '../components/InstallModal.js';
import { api } from '../api.js';
import { toast } from '../toast.js';
import type { SupportedLanguage } from '../i18n.js';

const LANGUAGES: { code: SupportedLanguage; label: string; flag: string }[] = [
  { code: 'de', label: 'Deutsch', flag: '🇦🇹' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'bs', label: 'Bosanski / Hrvatski / Srpski', flag: '🇧🇦' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
];

const MODULES: { route: Route; icon: string; key: string; hint: string }[] = [
  { route: 'rooms', icon: 'grid', key: 'modules.rooms', hint: 'rooms.subtitle' },
  { route: 'homework', icon: 'clipboard', key: 'modules.homework', hint: 'homework.subtitle' },
  { route: 'exams', icon: 'gradCap', key: 'modules.exams', hint: 'exams.subtitle' },
  { route: 'absences', icon: 'calendarX', key: 'modules.absences', hint: 'absences.subtitle' },
  { route: 'messages', icon: 'mail', key: 'modules.messages', hint: 'messages.subtitle' },
];

export function SettingsView() {
  const { t } = useTranslation();
  const {
    session,
    master,
    themeId,
    lang,
    setLang,
    role,
    notifyPref,
    setNotifyPref,
    refresh,
    logout,
  } = useApp();
  const { canInstall, promptInstall, installed } = useInstallPrompt();
  const [refreshing, setRefreshing] = useState(false);
  const [permission, setPermission] = useState(notificationPermission());
  const [calFeed, setCalFeed] = useState<{ url: string; webcalUrl: string } | null>(null);
  const [loadingCal, setLoadingCal] = useState(false);
  const [calModalOpen, setCalModalOpen] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingCal(true);
    api
      .calendarToken()
      .then((res) => {
        if (active) setCalFeed(res);
      })
      .catch(() => {
        // Handled gracefully in UI
      })
      .finally(() => {
        if (active) setLoadingCal(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function copyCalUrl() {
    if (!calFeed) return;
    try {
      await navigator.clipboard.writeText(calFeed.url);
      toast(t('calendar.copied'), 'success');
    } catch {
      toast(calFeed.url, 'info');
    }
  }

  useModsVersion();
  const themes = useThemes();
  const activeTheme = themeId === 'system' ? null : getTheme(themeId) ?? themes.find((x) => x.id === themeId);
  const themeName = activeTheme?.name ?? t('settings.themeSystem');
  const enabledMods = listMods().filter((m) => m.enabled).length;
  const morePages = getNavItems().filter((n) => n.placement === 'more');
  const modSettings = getSettingsSections();

  async function onChangeNotify(v: NotifyPref) {
    setNotifyPref(v);
    if (v === 'on') {
      await requestNotificationPermission();
      setPermission(notificationPermission());
    }
  }

  async function doRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 14 }}>
        {t('settings.title')}
      </h1>

      <div className="section" style={{ marginTop: 0 }}>
        <h2>{t('modules.title')}</h2>
        <div className="grid-2">
          {MODULES.map((m) => (
            <button key={m.route} className="module-tile" onClick={() => navigate(m.route)} type="button">
              <span className="mt-ico">
                <Icon name={m.icon} size={20} />
              </span>
              <span className="col" style={{ gap: 1, minWidth: 0, alignItems: 'flex-start' }}>
                <span className="mt-label">{t(m.key)}</span>
                <span className="mt-hint nowrap">{t(m.hint)}</span>
              </span>
              <div className="spacer" />
              <Icon name="chevronRight" size={18} />
            </button>
          ))}
          {morePages.map((page) => (
            <button
              key={page.id}
              className="module-tile"
              onClick={() => navigate('x', page.id)}
              type="button"
            >
              <span className="mt-ico">
                <Icon name={page.icon ?? 'grid'} size={20} />
              </span>
              <span className="col" style={{ gap: 1, minWidth: 0, alignItems: 'flex-start' }}>
                <span className="mt-label nowrap">{page.label}</span>
                <span className="mt-hint nowrap">{t('mods.fromMod')}</span>
              </span>
              <div className="spacer" />
              <Icon name="chevronRight" size={18} />
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>{t('settings.customize')}</h2>
        <div className="grid-2">
          <button className="module-tile" onClick={() => navigate('customize')} type="button">
            <span className="mt-ico">
              <Icon name="sliders" size={20} />
            </span>
            <span className="col" style={{ gap: 1, minWidth: 0, alignItems: 'flex-start' }}>
              <span className="mt-label">{t('customize.title')}</span>
              <span className="mt-hint nowrap">{t('customize.tileHint')}</span>
            </span>
            <div className="spacer" />
            <Icon name="chevronRight" size={18} />
          </button>
          <button className="module-tile" onClick={() => navigate('appearance')} type="button">
            <span className="mt-ico">
              <Icon name="palette" size={20} />
            </span>
            <span className="col" style={{ gap: 1, minWidth: 0, alignItems: 'flex-start' }}>
              <span className="mt-label">{t('appearance.title')}</span>
              <span className="mt-hint nowrap">{themeName}</span>
            </span>
            <div className="spacer" />
            <Icon name="chevronRight" size={18} />
          </button>
          <button className="module-tile" onClick={() => navigate('theme-studio')} type="button">
            <span className="mt-ico">
              <span>🎨</span>
            </span>
            <span className="col" style={{ gap: 1, minWidth: 0, alignItems: 'flex-start' }}>
              <span className="mt-label">{t('themeStudio.title')}</span>
              <span className="mt-hint nowrap">{t('themeStudio.tileHint')}</span>
            </span>
            <div className="spacer" />
            <Icon name="chevronRight" size={18} />
          </button>
          <button className="module-tile" onClick={() => navigate('mods')} type="button">
            <span className="mt-ico">
              <Icon name="puzzle" size={20} />
            </span>
            <span className="col" style={{ gap: 1, minWidth: 0, alignItems: 'flex-start' }}>
              <span className="mt-label">{t('mods.title')}</span>
              <span className="mt-hint nowrap">
                {enabledMods > 0 ? t('settings.modsOn', { count: enabledMods }) : t('settings.modsOff')}
              </span>
            </span>
            <div className="spacer" />
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      </div>

      <div className="section">
        <h2>{t('settings.account')}</h2>
        <div className="card pad col" style={{ gap: 12 }}>
          <div className="row">
            <Icon name="book" size={20} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }} className="nowrap">
                {session?.school.displayName ?? '—'}
              </div>
              <div className="small muted nowrap">{session?.school.server ?? '—'}</div>
            </div>
            <div className="spacer" />
            <span className="chip">{t(`settings.modeNames.${session?.mode ?? 'anonymous'}` as const)}</span>
          </div>
          <div className="row small muted">
            <Icon name="clock" size={15} />
            {t('common.synced')}: {new Date().toLocaleTimeString(lang === 'en' ? 'en-GB' : 'de-AT')}
          </div>
          <div className="row">
            <button className="btn" onClick={doRefresh} disabled={refreshing} style={{ flex: 1 }}>
              {refreshing ? <Spinner size={16} /> : <Icon name="refresh" size={16} />}
              {t('settings.refresh')}
            </button>
            <button className="btn danger" onClick={() => void logout()} style={{ flex: 1 }}>
              <Icon name="logout" size={16} />
              {t('settings.logout')}
            </button>
          </div>
        </div>
      </div>

      {/* Read-Only Account Role Card */}
      <div className="section">
        <h2>{t('settings.accountRoleTitle')}</h2>
        <div className="card pad col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 24 }}>{role === 'teacher' ? '👨‍🏫' : '🎒'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>
                {role === 'teacher' ? t('settings.roleTeacher') : t('settings.roleStudent')}
              </div>
              <div className="small muted">
                {session?.school.displayName ?? session?.school.loginName ?? '—'}
              </div>
            </div>
            <span className="badge ok">
              {role === 'teacher' ? 'WebUntis Lehrkraft' : 'WebUntis Schüler:in'}
            </span>
          </div>
          <div className="tiny muted" style={{ lineHeight: 1.5 }}>
            {t('settings.accountRoleLockedHint')}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="row spread" style={{ alignItems: 'baseline', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>{t('settings.language')}</h2>
          <span className="tiny muted">{LANGUAGES.find((l) => l.code === lang)?.label}</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: 8,
          }}
        >
          {LANGUAGES.map((item) => {
            const active = lang === item.code;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => setLang(item.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: active
                    ? 'var(--accent-soft, rgba(59, 130, 246, 0.12))'
                    : 'var(--surface)',
                  color: active ? 'var(--accent)' : 'var(--text)',
                  fontWeight: active ? 600 : 400,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{item.flag}</span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h2>{t('settings.notifications')}</h2>
        <div className="card pad col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10 }}>
            <Icon name="bell" size={20} />
            <div className="small muted" style={{ flex: 1 }}>
              {t('settings.notifyHint')}
            </div>
            <Segmented
              label={t('settings.notifications')}
              value={notifyPref}
              onChange={(v: NotifyPref) => {
                void onChangeNotify(v);
              }}
              options={[
                { value: 'off', label: t('settings.notifyOff') },
                { value: 'on', label: t('settings.notifyOn') },
              ]}
            />
          </div>
          {notifyPref === 'on' && permission === 'denied' && (
            <div className="tiny" style={{ color: 'var(--danger)' }}>
              {t('settings.notifyBlocked')}
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>{t('calendar.title')}</h2>
          <button
            type="button"
            className="btn sm primary"
            onClick={() => setCalModalOpen(true)}
            style={{ gap: 6 }}
          >
            <Icon name="calendar" size={15} />
            <span>{t('calendar.exportButton')}</span>
          </button>
        </div>
        <div className="card pad col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--accent)' }}>
              <Icon name="calendar" size={24} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{t('calendar.title')}</div>
              <div className="small muted" style={{ marginTop: 2 }}>
                {t('calendar.subtitle')}
              </div>
            </div>
          </div>

          <div
            className="small"
            style={{
              lineHeight: 1.5,
              background: 'var(--surface-2)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>💡 {t('calendar.instructions')}</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)' }}>
              <li>{t('calendar.appleHelp')}</li>
              <li>{t('calendar.googleHelp')}</li>
              <li>{t('calendar.outlookHelp')}</li>
            </ul>
          </div>

          {loadingCal ? (
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <Spinner size={16} />
              <span className="small muted">{t('calendar.loading')}</span>
            </div>
          ) : calFeed ? (
            <div className="col" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setCalModalOpen(true)}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Icon name="calendar" size={16} />
                  <span>{t('calendar.exportModalTitle')}</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={copyCalUrl}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Icon name="clipboard" size={16} />
                  <span>{t('calendar.copyUrl')}</span>
                </button>
              </div>
              <input
                className="input small"
                readOnly
                value={calFeed.url}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--surface-2)' }}
              />
            </div>
          ) : (
            <div className="small muted">{t('calendar.error')}</div>
          )}
        </div>
      </div>

      {modSettings.map((section) => (
        <div className="section" key={section.id}>
          <h2>{section.title}</h2>
          <div className="card pad">
            <ModHost render={section.render} />
          </div>
        </div>
      ))}

      <div className="section">
        <h2>📱 {t('install.mobileTitle')}</h2>
        <div className="card pad col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 12 }}>
            <span style={{ fontSize: 28 }}>📲</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 750, fontSize: 15 }}>
                Untis⁺ Smartphone App (PWA, Android APK, iOS)
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>
                {installed ? t('install.statusInstalled') : t('install.statusAvailable')}
              </div>
            </div>
            <button
              className="btn primary sm"
              type="button"
              onClick={() => setInstallModalOpen(true)}
              style={{ gap: 6, whiteSpace: 'nowrap' }}
            >
              <Icon name="download" size={15} />
              <span>{t('install.openHubBtn')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="section">
        <h2>{t('settings.about')}</h2>
        <div className="card pad col" style={{ gap: 8 }}>
          <div className="row small">
            <span className="muted">{t('settings.version')}</span>
            <div className="spacer" />
            <span>{APP_VERSION}</span>
          </div>
          <div className="row small">
            <span className="muted">{t('settings.school')}</span>
            <div className="spacer" />
            <span>{master ? `${master.klassen.length} ${t('today.class')}` : '—'}</span>
          </div>
          <div className="tiny muted" style={{ lineHeight: 1.5 }}>
            {t('settings.disclaimer')}
          </div>
        </div>
      </div>

      {/* Calendar Export Hub Modal */}
      <CalendarExportModal
        open={calModalOpen}
        onClose={() => setCalModalOpen(false)}
        initialScope="all"
      />

      {/* Smartphone & PWA Install Hub Modal */}
      {installModalOpen && <InstallModal onClose={() => setInstallModalOpen(false)} />}
    </div>
  );
}
