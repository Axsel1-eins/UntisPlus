import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getCommands,
  installMod,
  listMods,
  reloadMod,
  removeMod,
  setModEnabled,
  useModsVersion,
  type ModView,
} from '../mods.js';
import { Dialog, Icon } from '../components/primitives.js';
import { toast } from '../toast.js';
import { APP_VERSION } from '../version.js';

export function ModsView() {
  const { t } = useTranslation();
  useModsVersion();
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const mods = listMods();
  const commands = getCommands();

  async function toggle(mod: ModView): Promise<void> {
    setBusy(mod.id);
    try {
      await setModEnabled(mod.id, !mod.enabled);
    } finally {
      setBusy(null);
    }
  }

  async function reload(mod: ModView): Promise<void> {
    setBusy(mod.id);
    try {
      await reloadMod(mod.id);
      toast(t('mods.reloaded', { name: mod.name }));
    } finally {
      setBusy(null);
    }
  }

  function onRemove(mod: ModView): void {
    if (!window.confirm(t('mods.confirmRemove', { name: mod.name }))) return;
    removeMod(mod.id);
    toast(t('mods.removed', { name: mod.name }));
  }

  return (
    <div>
      <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
        <h1 className="page-title">{t('mods.title')}</h1>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setAddOpen(true)} type="button">
          <Icon name="plus" size={16} /> {t('mods.add')}
        </button>
      </div>

      <div className="callout" style={{ marginBottom: 14 }}>
        <Icon name="alert" size={18} />
        <div>
          <strong>{t('mods.trustTitle')}</strong> {t('mods.trustBody')}
        </div>
      </div>

      <div className="col" style={{ gap: 10 }}>
        {mods.map((mod) => (
          <ModRow
            key={mod.id}
            mod={mod}
            busy={busy === mod.id}
            onToggle={() => void toggle(mod)}
            onReload={() => void reload(mod)}
            onRemove={() => onRemove(mod)}
          />
        ))}
      </div>

      {commands.length > 0 && (
        <div className="section">
          <h2>{t('mods.commands')}</h2>
          <div className="col" style={{ gap: 8 }}>
            {commands.map((cmd) => (
              <div key={`${cmd.modId}:${cmd.id}`} className="row" style={{ gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10 }}>
                <Icon name="puzzle" size={16} />
                <span style={{ flex: 1 }}>{cmd.title}</span>
                <span className="tiny muted mono nowrap">{cmd.modId}</span>
                <button
                  className="btn sm"
                  onClick={() => {
                    try {
                      cmd.run();
                    } catch (err) {
                      toast(err instanceof Error ? err.message : String(err), 'error');
                    }
                  }}
                  type="button"
                >
                  {t('mods.run')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <h2>{t('mods.learn')}</h2>
        <div className="card pad col" style={{ gap: 10 }}>
          <p className="small muted" style={{ margin: 0 }}>
            {t('mods.learnBody')}
          </p>
          <details>
            <summary className="small" style={{ fontWeight: 700, cursor: 'pointer' }}>
              {t('mods.exampleTitle')}
            </summary>
            <pre className="code-input mono" style={{ marginTop: 10, overflowX: 'auto' }}>
{`UntisPlus.register({
  id: 'my.first-mod',
  name: 'My first mod',
  version: '1.0.0',
  apiVersion: 1,
  setup(api) {
    api.css.add('.appbar { letter-spacing: .3px; }');
    api.nav.add({
      id: 'my.first-mod.page',
      label: 'My page',
      render(el) {
        el.innerHTML = '<h1 class="page-title">Hi!</h1>';
      },
    });
    api.ui.toast('My mod is loaded');
  },
});`}
            </pre>
          </details>
          <div className="tiny muted mono">
            API v1 · app v{APP_VERSION} · guides: docs/tutorials/
          </div>
        </div>
      </div>

      <AddModDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function ModRow({
  mod,
  busy,
  onToggle,
  onReload,
  onRemove,
}: {
  mod: ModView;
  busy: boolean;
  onToggle: () => void;
  onReload: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const status = mod.status;
  const dotClass =
    status === 'enabled'
      ? 'status-dot enabled'
      : status === 'error'
        ? 'status-dot error'
        : status === 'loading'
          ? 'status-dot loading'
          : 'status-dot';

  return (
    <div className="card pad col" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 10 }}>
        <span className={dotClass} aria-hidden="true" />
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontWeight: 700 }} className="nowrap">
              {mod.name}
            </span>
            {mod.example && <span className="badge ok">{t('mods.example')}</span>}
            {mod.version && <span className="tiny muted nowrap">v{mod.version}</span>}
          </div>
          <div className="small muted nowrap">
            {mod.author ? `${mod.author} · ` : ''}
            <span className="mono">{mod.id}</span>
          </div>
        </div>
        <div className="spacer" />
        <button
          className={mod.enabled ? 'btn sm' : 'btn sm primary'}
          onClick={onToggle}
          disabled={busy}
          type="button"
        >
          {busy ? <Icon name="refresh" size={15} /> : <Icon name={mod.enabled ? 'close' : 'check'} size={15} />}
          {mod.enabled ? t('mods.disable') : t('mods.enable')}
        </button>
        {mod.enabled && (
          <button className="btn sm icon" onClick={onReload} disabled={busy} title={t('mods.reload')} type="button">
            <Icon name="refresh" size={15} />
          </button>
        )}
        {!mod.example && (
          <button
            className="btn sm danger icon"
            onClick={onRemove}
            title={t('mods.remove')}
            aria-label={t('mods.remove')}
            type="button"
          >
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>

      {mod.description && <div className="small muted">{mod.description}</div>}

      {status === 'error' && mod.error && (
        <div className="small" style={{ color: 'var(--danger)' }} role="alert">
          {t('mods.errorLabel')}: {mod.error}
        </div>
      )}
    </div>
  );
}

function AddModDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'url' | 'code'>('url');
  const [busy, setBusy] = useState(false);

  function reset(): void {
    setName('');
    setUrl('');
    setCode('');
    setMode('url');
  }

  async function submit(): Promise<void> {
    if (!name.trim()) {
      toast(t('mods.needName'), 'error');
      return;
    }
    if (mode === 'url' && !url.trim()) {
      toast(t('mods.needUrl'), 'error');
      return;
    }
    if (mode === 'code' && !code.trim()) {
      toast(t('mods.needCode'), 'error');
      return;
    }
    setBusy(true);
    try {
      await installMod(
        mode === 'url'
          ? { name: name.trim(), url: url.trim() }
          : { name: name.trim(), code },
      );
      toast(t('mods.installed', { name: name.trim() }));
      reset();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('mods.add')}>
      <div className="col" style={{ gap: 12 }}>
        <div>
          <label className="field">{t('mods.name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My mod" />
        </div>

        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={mode === 'url'} onClick={() => setMode('url')} type="button">
            <Icon name="link" size={15} /> {t('mods.fromUrl')}
          </button>
          <button role="tab" aria-selected={mode === 'code'} onClick={() => setMode('code')} type="button">
            <Icon name="puzzle" size={15} /> {t('mods.fromCode')}
          </button>
        </div>

        {mode === 'url' ? (
          <div>
            <label className="field">{t('mods.url')}</label>
            <input
              className="input mono"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/my-mod.js"
            />
            <div className="tiny muted" style={{ marginTop: 6 }}>
              {t('mods.urlHint')}
            </div>
          </div>
        ) : (
          <div>
            <label className="field">{t('mods.code')}</label>
            <textarea
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="UntisPlus.register({ id: 'x', name: 'X', setup(api) { /* … */ } });"
            />
          </div>
        )}

        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose} type="button">
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={() => void submit()} disabled={busy} type="button">
            {busy ? <Icon name="refresh" size={16} /> : <Icon name="plus" size={16} />}
            {t('mods.add')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
