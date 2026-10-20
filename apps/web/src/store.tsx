import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ElementType, LessonChange, MasterData, SessionSummary } from '@untisplus/shared';
import { api } from './api.js';
import { setLanguage, type SupportedLanguage } from './i18n.js';
import {
  DEFAULT_THEME_ID,
  applyActiveTheme,
  initialThemeId,
  persistActiveThemeId,
  subscribeThemes,
  systemPrefersDark,
} from './themes.js';
import { emitModEvent, initMods } from './mods.js';

export type Role = 'student' | 'teacher';
export type NotifyPref = 'off' | 'on';

export interface Target {
  id: number;
  type: ElementType;
  label?: string;
}

interface AppState {
  session: SessionSummary | null;
  sessionReady: boolean;
  master: MasterData | null;
  masterError: string | null;
  /** Id of the active theme (or `system`). See {@link ./themes.js}. */
  themeId: string;
  lang: SupportedLanguage;
  role: Role;
  target: Target | null;
  notifyPref: NotifyPref;
  recentChanges: LessonChange[];
  setThemeId: (id: string) => void;
  setLang: (l: SupportedLanguage) => void;
  setTarget: (t: Target | null) => void;
  setNotifyPref: (p: NotifyPref) => void;
  setRecentChanges: (c: LessonChange[]) => void;
  clearRecentChanges: () => void;
  refresh: () => Promise<void>;
  setSession: (s: SessionSummary | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

const ls = {
  get: (k: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null),
  set: (k: string, v: string) => typeof localStorage !== 'undefined' && localStorage.setItem(k, v),
};

/** Teacher accounts have personType 2 in WebUntis. Role is strictly derived from the account. */
function roleFromSession(session: SessionSummary | null): Role {
  if (session?.personType === 2) return 'teacher';
  return 'student';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionSummary | null>(() => {
    try {
      const raw = ls.get('up.session');
      return raw ? (JSON.parse(raw) as SessionSummary) : null;
    } catch {
      return null;
    }
  });
  const [sessionReady, setSessionReady] = useState(false);
  const [master, setMaster] = useState<MasterData | null>(null);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [themeId, setThemeIdState] = useState<string>(() => initialThemeId());
  const [lang, setLangState] = useState<SupportedLanguage>(
    () => (ls.get('up.lang') as SupportedLanguage) ?? 'de',
  );
  const [target, setTargetState] = useState<Target | null>(null);
  const [notifyPref, setNotifyPrefState] = useState<NotifyPref>(
    (ls.get('up.notify') as NotifyPref) ?? 'off',
  );
  const [recentChanges, setRecentChangesState] = useState<LessonChange[]>([]);

  const setSession = useCallback((s: SessionSummary | null) => {
    if (s) {
      ls.set('up.session', JSON.stringify(s));
    } else {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('up.session');
    }
    setSessionState(s);
  }, []);

  // Apply the active theme. Re-runs on theme change, OS scheme change, and whenever the theme
  // registry changes (e.g. a mod registers or removes a theme).
  useEffect(() => {
    const apply = () => {
      applyActiveTheme(themeId, systemPrefersDark());
      emitModEvent('theme', themeId);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => {
      if (themeId === DEFAULT_THEME_ID) apply();
    };
    mq.addEventListener('change', onScheme);
    const unsub = subscribeThemes(apply);
    return () => {
      mq.removeEventListener('change', onScheme);
      unsub();
    };
  }, [themeId]);

  // Load mods once (they may add themes, pages, transforms…).
  useEffect(() => {
    void initMods();
  }, []);

  // Initial session check with graceful recovery for temporary glitches
  useEffect(() => {
    setLanguage(lang);
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const checkSession = async (attempt = 0) => {
      try {
        const s = await api.session();
        if (!active) return;
        setSession(s);
        setSessionReady(true);
      } catch (err: unknown) {
        if (!active) return;
        const isTemporary =
          err instanceof Error &&
          (err.message === 'network' ||
            (err as any).status === 0 ||
            (err as any).status === 502 ||
            (err as any).status === 503 ||
            (err as any).status === 504);

        const cached = ls.get('up.session');
        if (isTemporary && cached && attempt < 3) {
          // Keep previous session and retry gracefully in background
          setSessionReady(true);
          retryTimer = setTimeout(() => {
            void checkSession(attempt + 1);
          }, 1500 * (attempt + 1));
          return;
        }

        // If session expired or invalid, attempt silent auto-reauth using saved credentials
        const savedLogin = ls.get('up.saved_login');
        if (savedLogin) {
          try {
            const creds = JSON.parse(savedLogin);
            if (creds && creds.school && (creds.mode === 'anonymous' || creds.user)) {
              const reauthSession = await api.login(creds);
              if (!active) return;
              setSession(reauthSession);
              setSessionReady(true);
              return;
            }
          } catch (reauthErr) {
            // If explicit auth rejection (credentials changed/invalid), purge to avoid retry loops
            if ((reauthErr as any)?.status === 401 || (reauthErr as any)?.status === 403) {
              if (typeof localStorage !== 'undefined') localStorage.removeItem('up.saved_login');
            }
          }
        }

        // Only clear session on definitive auth failure (401/403) or no previous session
        if (!cached || !isTemporary) {
          setSession(null);
        }
        setSessionReady(true);
      }
    };

    void checkSession();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSession]);

  // Notify mods about the session.
  useEffect(() => {
    emitModEvent('session', session);
  }, [session]);

  const loadMaster = useCallback(async () => {
    try {
      setMasterError(null);
      const md = await api.master();
      setMaster(md);
    } catch {
      // Keep previous master data if available; mark error
      setMaster((prev) => prev);
      setMasterError('master');
    }
  }, []);

  useEffect(() => {
    if (session) void loadMaster();
    else setMaster(null);
  }, [session, loadMaster]);

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id);
    persistActiveThemeId(id);
  }, []);
  const setLang = useCallback((l: SupportedLanguage) => {
    setLangState(l);
    setLanguage(l);
  }, []);
  const setTarget = useCallback((t: Target | null) => setTargetState(t), []);
  const setNotifyPref = useCallback((p: NotifyPref) => {
    setNotifyPrefState(p);
    ls.set('up.notify', p);
  }, []);
  const setRecentChanges = useCallback((c: LessonChange[]) => setRecentChangesState(c), []);
  const clearRecentChanges = useCallback(() => setRecentChangesState([]), []);

  const refresh = useCallback(async () => {
    await loadMaster();
  }, [loadMaster]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('up.saved_login');
        localStorage.removeItem('up.token');
      }
      setSession(null);
      setMaster(null);
    }
  }, [setSession]);

  const role = roleFromSession(session);

  const value = useMemo<AppState>(
    () => ({
      session,
      sessionReady,
      master,
      masterError,
      themeId,
      lang,
      role,
      target,
      notifyPref,
      recentChanges,
      setThemeId,
      setLang,
      setTarget,
      setNotifyPref,
      setRecentChanges,
      clearRecentChanges,
      refresh,
      setSession,
      logout,
    }),
    [
      session,
      sessionReady,
      master,
      masterError,
      themeId,
      lang,
      role,
      target,
      notifyPref,
      recentChanges,
      setThemeId,
      setLang,
      setTarget,
      setNotifyPref,
      setRecentChanges,
      clearRecentChanges,
      refresh,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export { DEFAULT_THEME_ID };
