import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { School } from '@untisplus/shared';
import { api, ApiError, type LoginInput } from '../api.js';
import { useApp } from '../store.js';
import { Icon, Spinner } from '../components/primitives.js';

type Step = 'search' | 'auth';
type Mode = 'anonymous' | 'password' | 'secret';

export function Onboarding() {
  const { t } = useTranslation();
  const { setSession } = useApp();

  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<School[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchTouched, setSearchTouched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [mode, setMode] = useState<Mode>('anonymous');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);

  // Restore saved login credentials if present
  useEffect(() => {
    try {
      const raw = localStorage.getItem('up.saved_login');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.server && saved.school) {
          setSchool({
            server: saved.server,
            loginName: saved.school,
            displayName: saved.displayName || saved.school,
          });
          if (saved.mode) setMode(saved.mode);
          if (saved.user) setUser(saved.user);
          if (saved.password) setPassword(saved.password);
          if (saved.secret) setSecret(saved.secret);
          setStep('auth');
        }
      }
    } catch {
      // Ignore corrupted cached credentials
    }
  }, []);

  useEffect(() => {
    api
      .health()
      .then((h) => setFixtures(h.fixtures))
      .catch(() => setFixtures(false));
  }, []);

  // Debounced school search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchTouched(true);
    const id = window.setTimeout(() => {
      api
        .searchSchools(q)
        .then((schools) => {
          setResults(schools);
          setSearchError(null);
        })
        .catch((err) => {
          setResults([]);
          if (err instanceof ApiError && err.code === 'too_many_results') {
            setSearchError(err.message || 'Zu viele Treffer. Bitte Suchbegriff verfeinern.');
          } else {
            setSearchError(null);
          }
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => window.clearTimeout(id);
  }, [query]);

  async function submit() {
    if (!school) return;
    setBusy(true);
    setError(null);
    const input: LoginInput = { ...school, server: school.server, school: school.loginName, mode };
    if (mode === 'password') {
      input.user = user;
      input.password = password;
    }
    if (mode === 'secret') {
      input.user = user;
      input.secret = secret;
    }
    try {
      const summary = await api.login(input);
      if (rememberLogin) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(
            'up.saved_login',
            JSON.stringify({
              ...input,
              displayName: school.displayName,
            })
          );
        }
      } else {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('up.saved_login');
        }
      }
      setSession(summary);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'auth_failed') setError(t('error.auth'));
      else if (err instanceof ApiError && err.code === 'permission_denied') setError(t('error.permission'));
      else if (err instanceof ApiError && err.code === 'network') setError(t('error.network'));
      else setError(t('error.generic'));
    } finally {
      setBusy(false);
    }
  }

  async function demoLogin() {
    setBusy(true);
    setError(null);
    try {
      const summary = await api.login({
        server: 'fixture.webuntis.com',
        school: 'untisplus-fixture',
        displayName: t('onboarding.fixture'),
        mode: 'anonymous',
      });
      setSession(summary);
    } catch {
      setError(t('error.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding">
      <div className="panel">
        <div className="row" style={{ gap: 12 }}>
          <span className="logo" style={{ width: 44, height: 44, borderRadius: 14, fontSize: 24 }}>
            U
          </span>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 850 }}>
              {t('onboarding.welcome')}
            </h1>
            <div className="muted small">{t('onboarding.subtitle')}</div>
          </div>
        </div>

        {error && (
          <div className="alert error" role="alert" style={{ marginTop: 16 }}>
            <Icon name="alert" size={17} /> {error}
          </div>
        )}

        {step === 'search' && (
          <div style={{ marginTop: 20 }}>
            <label className="field" htmlFor="school-search">
              {t('onboarding.searchLabel')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="school-search"
                className="input"
                autoComplete="off"
                placeholder={t('onboarding.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
              <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }}>
                {searching ? <Spinner size={18} /> : <Icon name="search" size={18} />}
              </span>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              {t('onboarding.searchHint')}
            </div>

            {results.length > 0 && (
              <div className="col" style={{ marginTop: 12, maxHeight: 280, overflow: 'auto' }}>
                {results.map((s) => (
                  <button
                    key={`${s.server}-${s.loginName}`}
                    className="school-result"
                    aria-selected={school?.loginName === s.loginName}
                    onClick={() => setSchool(s)}
                  >
                    <span style={{ fontWeight: 700 }}>{s.displayName}</span>
                    <span className="small muted">
                      {s.server}
                      {s.address ? ` · ${s.address}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {searchTouched && !searching && query.trim().length >= 2 && results.length === 0 && (
              <div className="small muted" style={{ marginTop: 12 }}>
                {searchError || t('onboarding.noResults')}
              </div>
            )}

            <div className="row" style={{ marginTop: 18 }}>
              <div className="spacer" />
              <button className="btn primary" disabled={!school} onClick={() => setStep('auth')}>
                {t('onboarding.continue')}
                <Icon name="chevronRight" size={17} />
              </button>
            </div>

            {fixtures && (
              <>
                <div className="divider" style={{ margin: '16px 0' }} />
                <button className="btn ghost" onClick={demoLogin} disabled={busy} style={{ width: '100%' }}>
                  <Icon name="grid" size={17} />
                  {t('onboarding.fixture')}
                </button>
              </>
            )}
          </div>
        )}

        {step === 'auth' && school && (
          <div style={{ marginTop: 20 }}>
            <div className="card pad row" style={{ gap: 10 }}>
              <Icon name="book" size={20} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }} className="nowrap">
                  {school.displayName}
                </div>
                <div className="small muted nowrap">{school.server}</div>
              </div>
              <div className="spacer" />
              <button className="btn ghost sm" onClick={() => setStep('search')}>
                {t('onboarding.changeSchool')}
              </button>
            </div>

            <div className="col" style={{ marginTop: 16, gap: 8 }}>
              <div className="field">{t('onboarding.chooseHow')}</div>
              {(
                [
                  ['anonymous', 'onboarding.modeAnonymous', 'onboarding.modeAnonymousHint', 'user'],
                  ['password', 'onboarding.modePassword', 'onboarding.modePasswordHint', 'user'],
                  ['secret', 'onboarding.modeSecret', 'onboarding.modeSecretHint', 'alert'],
                ] as const
              ).map(([value, labelKey, hintKey, icon]) => (
                <button
                  key={value}
                  className="school-result"
                  aria-selected={mode === value}
                  onClick={() => setMode(value)}
                  type="button"
                >
                  <span className="row" style={{ gap: 8, fontWeight: 700 }}>
                    <Icon name={icon} size={16} />
                    {t(labelKey)}
                  </span>
                  <span className="small muted">{t(hintKey)}</span>
                </button>
              ))}
            </div>

            {mode !== 'anonymous' && (
              <div className="col" style={{ marginTop: 12, gap: 10 }}>
                <div>
                  <label className="field" htmlFor="user">
                    {t('onboarding.username')}
                  </label>
                  <input id="user" className="input" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />
                </div>
                {mode === 'password' && (
                  <div>
                    <label className="field" htmlFor="password">
                      {t('onboarding.password')}
                    </label>
                    <input
                      id="password"
                      className="input"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                )}
                {mode === 'secret' && (
                  <div>
                    <label className="field" htmlFor="secret">
                      {t('onboarding.secret')}
                    </label>
                    <input
                      id="secret"
                      className="input"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      placeholder={t('onboarding.secretPlaceholder')}
                      autoComplete="off"
                    />
                  </div>
                )}
              </div>
            )}

            <label
              className="row"
              style={{
                gap: 8,
                alignItems: 'center',
                marginTop: 14,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={rememberLogin}
                onChange={(e) => setRememberLogin(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--brand)' }}
              />
              <span className="small">{t('onboarding.rememberLogin')}</span>
            </label>

            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn ghost" onClick={() => setStep('search')} disabled={busy}>
                <Icon name="chevronLeft" size={17} />
                {t('onboarding.back')}
              </button>
              <div className="spacer" />
              <button className="btn primary" onClick={submit} disabled={busy}>
                {busy ? <Spinner size={17} /> : <Icon name="check" size={17} />}
                {t('onboarding.signIn')}
              </button>
            </div>
          </div>
        )}

        <div className="tiny muted" style={{ marginTop: 18, lineHeight: 1.5 }}>
          {t('onboarding.disclaimer')}
        </div>
      </div>
    </div>
  );
}
