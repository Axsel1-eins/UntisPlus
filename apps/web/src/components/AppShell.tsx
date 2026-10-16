import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../store.js';
import { navigate, useRouteInfo, type Route } from '../router.js';
import { useOnlineStatus } from '../hooks.js';
import { getNavItems, useModsVersion } from '../mods.js';
import { dismissToast, useToasts } from '../toast.js';
import { useCustomization, updateCustomization } from '../customization.js';
import { Icon } from './primitives.js';

export const NAV_DEFS: Record<Route, { icon: string; key: string }> = {
  today: { icon: 'home', key: 'nav.today' },
  timetable: { icon: 'calendar', key: 'nav.timetable' },
  subs: { icon: 'bell', key: 'nav.substitutions' },
  rooms: { icon: 'grid', key: 'modules.rooms' },
  homework: { icon: 'clipboard', key: 'modules.homework' },
  exams: { icon: 'gradCap', key: 'modules.exams' },
  absences: { icon: 'calendarX', key: 'modules.absences' },
  messages: { icon: 'mail', key: 'modules.messages' },
  settings: { icon: 'more', key: 'nav.settings' },
  appearance: { icon: 'palette', key: 'appearance.title' },
  customize: { icon: 'sliders', key: 'customize.title' },
  'theme-studio': { icon: 'palette', key: 'themeStudio.title' },
  mods: { icon: 'puzzle', key: 'mods.title' },
  x: { icon: 'grid', key: 'mods.fromMod' },
};

const DESKTOP_PRIMARY: Route[] = ['today', 'timetable', 'subs', 'exams', 'homework', 'rooms'];
const DESKTOP_SECONDARY: Route[] = ['customize', 'settings'];

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { route, param } = useRouteInfo();
  const { session, role, recentChanges, clearRecentChanges } = useApp();
  const customization = useCustomization();
  const { navItems, privacyMode } = customization;
  const online = useOnlineStatus();
  useModsVersion();
  const toasts = useToasts();

  const navPosition = customization.navPosition ?? 'sidebar-left';
  const navSize = customization.navSize ?? 'normal';
  const logoPosition = customization.logoPosition ?? 'left';

  // Mod contributions that asked for a slot in the main navigation.
  const modNav = getNavItems().filter((n) => n.placement === 'nav');
  const activeNav = navItems && navItems.length > 0 ? navItems : (['today', 'timetable', 'subs', 'settings'] as Route[]);

  const allPrimaryRoutes: Route[] = useMemo(() => {
    const list = [...DESKTOP_PRIMARY];
    for (const r of activeNav) {
      if (!list.includes(r) && !DESKTOP_SECONDARY.includes(r)) list.push(r);
    }
    return list;
  }, [activeNav]);

  const Brand = (
    <a
      href="#/today"
      className={`brand logo-pos-${logoPosition}`}
      aria-label={t('app.name')}
      onClick={(e) => {
        e.preventDefault();
        navigate('today');
      }}
    >
      <span className="logo">U</span>
      {navSize !== 'compact' && logoPosition !== 'hidden' && (
        <span>
          {t('app.name')}
          <sup>+</sup>
        </span>
      )}
    </a>
  );

  const isSidebar = navPosition === 'sidebar-left' || navPosition === 'sidebar-right';

  return (
    <div
      className={`app nav-pos-${navPosition} nav-size-${navSize} ${isSidebar ? 'with-sidebar' : ''}`.trim()}
    >
      <header className="appbar">
        {/* Render brand in top bar only if NOT a sidebar layout or explicitly requested */}
        {(!isSidebar || logoPosition === 'center') && Brand}

        <div className="spacer" />

        {/* Privacy shield quick toggle */}
        <button
          type="button"
          className={`chip ${privacyMode ? 'accent' : ''}`}
          style={{ cursor: 'pointer', border: 'none', background: privacyMode ? 'var(--accent)' : 'var(--surface-2)' }}
          title={privacyMode ? t('customize.privacyOn') : t('customize.privacyOff')}
          onClick={() => updateCustomization({ privacyMode: !privacyMode })}
        >
          <Icon name={privacyMode ? 'eyeOff' : 'eye'} size={15} />
        </button>

        {!online && (
          <span className="chip" title={t('error.network')}>
            <Icon name="wifiOff" size={15} />
          </span>
        )}
        <span className="chip accent" title={t('settings.role')}>
          <Icon name={role === 'teacher' ? 'user' : 'book'} size={14} />
          {role === 'teacher' ? t('settings.roleTeacher') : t('settings.roleStudent')}
        </span>
        {session && (
          <span className="chip nowrap" style={{ maxWidth: 160 }} title={session.school.displayName}>
            {session.school.displayName}
          </span>
        )}
      </header>

      <nav className={`nav nav-${navPosition} size-${navSize}`} aria-label="primary">
        {/* If in sidebar mode, place the brand at the top of the sidebar so it closes flush with the top! */}
        {isSidebar && logoPosition !== 'hidden' && (
          <div className="nav-header desktop-only">
            {Brand}
          </div>
        )}

        {allPrimaryRoutes.map((r) => {
          const item = NAV_DEFS[r] ?? NAV_DEFS.today;
          const isMobileVisible = activeNav.includes(r);
          return (
            <a
              key={r}
              href={`#/${r}`}
              className={`nav-link ${isMobileVisible ? '' : 'desktop-only'}`.trim()}
              aria-current={route === r ? 'page' : undefined}
              title={navSize === 'compact' ? t(item.key) : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(r);
              }}
            >
              <span className="ico">
                <Icon name={item.icon} size={21} />
              </span>
              {navSize !== 'compact' && <span>{t(item.key)}</span>}
              {r === 'subs' && recentChanges.length > 0 && (
                <span className="nav-pill warn" title={`${recentChanges.length} Änderungen`}>
                  {recentChanges.length}
                </span>
              )}
            </a>
          );
        })}

        <div className="nav-divider desktop-only" />

        {DESKTOP_SECONDARY.map((r) => {
          const item = NAV_DEFS[r] ?? NAV_DEFS.settings;
          const isMobileVisible = activeNav.includes(r);
          return (
            <a
              key={r}
              href={`#/${r}`}
              className={`nav-link ${isMobileVisible ? '' : 'desktop-only'}`.trim()}
              aria-current={route === r ? 'page' : undefined}
              title={navSize === 'compact' ? t(item.key) : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(r);
              }}
            >
              <span className="ico">
                <Icon name={item.icon} size={21} />
              </span>
              {navSize !== 'compact' && <span>{t(item.key)}</span>}
            </a>
          );
        })}

        {modNavItems(modNav, route, param, navigate, navSize !== 'compact')}
      </nav>

      <main className="main">
        {recentChanges.length > 0 && (
          <div className="banner" role="status">
            <Icon name="bell" size={17} />
            <span className="nowrap">
              {t('changes.banner', { count: recentChanges.length })}
            </span>
            <div className="spacer" />
            <button className="btn ghost sm" onClick={() => navigate('subs')}>
              {t('changes.view')}
            </button>
            <button className="btn ghost icon sm" onClick={clearRecentChanges} aria-label={t('common.close')}>
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
        {children}
      </main>

      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone ?? 'info'}`} role="status">
            <span>{toast.message}</span>
            <button
              className="btn ghost icon sm"
              onClick={() => dismissToast(toast.id)}
              aria-label={t('common.close')}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function modNavItems(
  items: ReturnType<typeof getNavItems>,
  route: Route,
  param: string | null,
  nav: typeof navigate,
  showLabel: boolean,
) {
  if (items.length === 0) return null;
  return (
    <>
      <div className="nav-divider desktop-only" />
      {items.map((m) => {
        const active = route === 'x' && param === m.id;
        return (
          <a
            key={m.id}
            href={`#/x/${m.id}`}
            className="nav-link desktop-only"
            aria-current={active ? 'page' : undefined}
            title={!showLabel ? m.label : undefined}
            onClick={(e) => {
              e.preventDefault();
              nav('x', m.id);
            }}
          >
            <span className="ico">
              <Icon name={m.icon ?? 'puzzle'} size={21} />
            </span>
            {showLabel && <span>{m.label}</span>}
          </a>
        );
      })}
    </>
  );
}
