import { useTranslation } from 'react-i18next';
import { useApp } from './store.js';
import { useRouteInfo } from './router.js';
import { useChangeWatcher } from './notify.js';
import { AppShell } from './components/AppShell.js';
import { ModPageView } from './components/ModHost.js';
import { Spinner } from './components/primitives.js';
import { Onboarding } from './views/Onboarding.js';
import { TodayView } from './views/Today.js';
import { TimetableView } from './views/TimetableView.js';
import { SubstitutionsView } from './views/Substitutions.js';
import { HomeworkView } from './views/Homework.js';
import { ExamsView } from './views/Exams.js';
import { AbsencesView } from './views/Absences.js';
import { MessagesView } from './views/Messages.js';
import { SettingsView } from './views/Settings.js';
import { AppearanceView } from './views/Appearance.js';
import { CustomizeView } from './views/Customize.js';
import { ThemeStudioView } from './views/ThemeStudio.js';
import { ModsView } from './views/Mods.js';
import { RoomsView } from './views/Rooms.js';

export function App() {
  const { sessionReady, session } = useApp();
  const { route, param } = useRouteInfo();
  const { t } = useTranslation();

  // Poll the effective timetable for substitutions while notifications are enabled.
  useChangeWatcher();

  if (!sessionReady) {
    return (
      <div className="onboarding">
        <div className="col" style={{ alignItems: 'center', gap: 14, color: 'var(--muted)' }}>
          <span className="logo" style={{ width: 54, height: 54, borderRadius: 16, fontSize: 28 }}>
            U
          </span>
          <Spinner size={22} />
          <div className="small">{t('common.loading')}</div>
        </div>
      </div>
    );
  }

  if (!session) return <Onboarding />;

  return (
    <AppShell>
      {route === 'today' && <TodayView />}
      {route === 'timetable' && <TimetableView />}
      {route === 'subs' && <SubstitutionsView />}
      {route === 'homework' && <HomeworkView />}
      {route === 'exams' && <ExamsView />}
      {route === 'absences' && <AbsencesView />}
      {route === 'messages' && <MessagesView />}
      {route === 'settings' && <SettingsView />}
      {route === 'appearance' && <AppearanceView />}
      {route === 'customize' && <CustomizeView />}
      {route === 'theme-studio' && <ThemeStudioView />}
      {route === 'rooms' && <RoomsView />}
      {route === 'mods' && <ModsView />}
      {route === 'x' && <ModPageView param={param ?? ''} />}
    </AppShell>
  );
}
