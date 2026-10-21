import { useEffect, useMemo, useState, type ReactNode } from 'react';
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

const MORE_MODULES: { route: Route; icon: string; titleKey: string; hintKey: string }[] = [
  { route: 'exams', icon: 'gradCap', titleKey: 'modules.exams', hintKey: 'exams.subtitle' },
  { route: 'homework', icon: 'clipboard', titleKey: 'modules.homework', hintKey: 'homework.subtitle' },
  { route: 'absences', icon: 'calendarX', titleKey: 'modules.absences', hintKey: 'absences.subtitle' },
  { route: 'rooms', icon: 'grid', titleKey: 'modules.rooms', hintKey: 'rooms.subtitle' },
  { route: 'messages', icon: 'mail', titleKey: 'modules.messages', hintKey: 'messages.subtitle' },
  { route: 'theme-studio', icon: 'palette', titleKey: 'themeStudio.title', hintKey: 'themeStudio.tileHint' },
  { route: 'customize', icon: 'sliders', titleKey: 'customize.title', hintKey: 'customize.subtitle' },
  { route: 'settings', icon: 'more', titleKey: 'settings.title', hintKey: 'settings.account' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { route, param } = useRouteInfo();
  const { session, role, recentChanges, clearRecentChanges } = useApp();
  const customization = useCustomization();
  const { navItems, privacyMode } = customization;
  const online = useOnlineStatus();
  useModsVersion();
  const toasts = useToasts();
  const [moreOpen, setMoreOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 240);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navPosition = customization.navPosition ?? 'sidebar-left';
  const navSize = customization.navSize ?? 'normal';
  const logoPosition = customization.logoPosition ?? 'left';

  // Mod contributions that asked for a slot in the main navigation.
  const modNav = getNavItems().filter((n) => n.placement === 'nav');
  const activeNav = navItems && navItems.length > 0 ? navItems : (['today', 'timetable', 'subs', 'settings'] as Route[]);

  const mobileTabs: Route[] = useMemo(() => {
    if (navItems && navItems.length > 0) {
      return navItems.filter((r) => r !== 'settings').slice(0, 4);
    }
    return ['today', 'timetable', 'subs', 'exams'];
  }, [navItems]);

  const isMoreActive = !mobileTabs.includes(route);

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
        {/* Brand logo: visible in appbar on mobile & top navbar, hidden when desktop sidebar is shown */}
        <div className="brand-appbar">
          {Brand}
        </div>

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
        <span className="chip accent role-chip" title={role === 'teacher' ? t('settings.roleTeacher') : t('settings.roleStudent')}>
          <Icon name={role === 'teacher' ? 'user' : 'book'} size={14} />
          <span className="desktop-only-inline">{role === 'teacher' ? t('settings.roleTeacher') : t('settings.roleStudent')}</span>
        </span>
        {session && (
          <span className="chip nowrap school-chip" title={session.school.displayName}>
            <span className="school-chip-text">{session.school.displayName}</span>
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
          const isMobileVisible = mobileTabs.includes(r);
          return (
            <a
              key={r}
              href={`#/${r}`}
              className={`nav-link ${isMobileVisible ? '' : 'desktop-only'}`.trim()}
              aria-current={route === r ? 'page' : undefined}
              title={navSize === 'compact' ? t(item.key) : undefined}
              onClick={(e) => {
                e.preventDefault();
                setMoreOpen(false);
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
          const isMobileVisible = mobileTabs.includes(r);
          return (
            <a
              key={r}
              href={`#/${r}`}
              className={`nav-link ${isMobileVisible ? '' : 'desktop-only'}`.trim()}
              aria-current={route === r ? 'page' : undefined}
              title={navSize === 'compact' ? t(item.key) : undefined}
              onClick={(e) => {
                e.preventDefault();
                setMoreOpen(false);
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

        {/* Mobile More (Mehr) button in bottom navigation */}
        <button
          type="button"
          className={`nav-link show-on-mobile ${moreOpen || isMoreActive ? 'active' : ''}`}
          aria-current={moreOpen || isMoreActive ? 'page' : undefined}
          onClick={() => setMoreOpen((v) => !v)}
          title={t('nav.settings')}
        >
          <span className="ico">
            <Icon name="more" size={21} />
          </span>
          <span>{t('nav.settings')}</span>
        </button>

        {modNavItems(modNav, route, param, navigate, navSize !== 'compact')}
      </nav>

      {/* Mobile More Sheet */}
      {moreOpen && (
        <div className="dialog-backdrop" onClick={() => setMoreOpen(false)} role="presentation">
          <div
            className="dialog card pad mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.settings')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle show-on-mobile" />

            <div className="row" style={{ marginBottom: 14, alignItems: 'center' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
                <span
                  className="logo"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    background: 'linear-gradient(180deg, #6366f1, #8b5cf6)',
                    fontWeight: 900,
                    fontSize: 15,
                  }}
                >
                  U
                </span>
                <div className="col" style={{ gap: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>
                    {session?.displayName || t('app.name')}
                  </div>
                  <div className="small muted nowrap">
                    {session ? session.school.displayName : (role === 'teacher' ? t('settings.roleTeacher') : t('settings.roleStudent'))}
                  </div>
                </div>
              </div>
              <div className="spacer" />
              <button
                type="button"
                className={`chip ${privacyMode ? 'accent' : ''}`}
                style={{
                  cursor: 'pointer',
                  border: 'none',
                  background: privacyMode ? 'var(--accent)' : 'var(--surface-2)',
                  padding: '6px 10px',
                }}
                title={privacyMode ? t('customize.privacyOn') : t('customize.privacyOff')}
                onClick={() => updateCustomization({ privacyMode: !privacyMode })}
              >
                <Icon name={privacyMode ? 'eyeOff' : 'eye'} size={15} />
              </button>
              <button
                type="button"
                className="btn ghost icon sm"
                onClick={() => setMoreOpen(false)}
                aria-label={t('common.close')}
              >
                <Icon name="close" size={17} />
              </button>
            </div>

            <div className="section" style={{ marginTop: 0 }}>
              <h2
                style={{
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--muted)',
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                {t('modules.title')}
              </h2>
              <div className="mobile-more-grid">
                {MORE_MODULES.map((m) => {
                  const active = route === m.route;
                  return (
                    <button
                      key={m.route}
                      type="button"
                      className={`mobile-more-card ${active ? 'active' : ''}`}
                      onClick={() => {
                        navigate(m.route);
                        setMoreOpen(false);
                      }}
                    >
                      <div className="mm-icon">
                        <Icon name={m.icon} size={19} />
                      </div>
                      <div className="col" style={{ gap: 1, minWidth: 0 }}>
                        <div className="mm-title nowrap">{t(m.titleKey)}</div>
                        <div className="mm-desc nowrap">{t(m.hintKey)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {modNav.length > 0 && (
              <div className="section" style={{ marginTop: 14 }}>
                <h2
                  style={{
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--muted)',
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  {t('mods.title')}
                </h2>
                <div className="mobile-more-grid">
                  {modNav.map((m) => {
                    const active = route === 'x' && param === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`mobile-more-card ${active ? 'active' : ''}`}
                        onClick={() => {
                          navigate('x', m.id);
                          setMoreOpen(false);
                        }}
                      >
                        <div className="mm-icon">
                          <Icon name={m.icon ?? 'puzzle'} size={19} />
                        </div>
                        <div className="col" style={{ gap: 1, minWidth: 0 }}>
                          <div className="mm-title nowrap">{m.label}</div>
                          <div className="mm-desc nowrap">{t('mods.fromMod')}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

      <button
        type="button"
        className={`scroll-top-btn ${showScrollTop ? 'visible' : ''}`}
        onClick={handleScrollToTop}
        aria-label={t('common.scrollToTop')}
        title={t('common.scrollToTop')}
      >
        <Icon name="arrowUp" size={20} />
      </button>

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
