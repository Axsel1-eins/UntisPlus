import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstallPrompt } from '../hooks.js';
import { Icon } from './primitives.js';
import { QrCodeSvg } from './QrCodeSvg.js';
import { toast } from '../toast.js';

interface InstallModalProps {
  onClose: () => void;
}

export function InstallModal({ onClose }: InstallModalProps) {
  const { t } = useTranslation();
  const { canInstall, promptInstall, installed } = useInstallPrompt();
  const [activeTab, setActiveTab] = useState<'pwa' | 'apk' | 'ios'>('pwa');

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

  // Platform detection
  const isIos = useMemo(() => {
    return (
      typeof navigator !== 'undefined' &&
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as any).MSStream
    );
  }, []);

  const isAndroid = useMemo(() => {
    return typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);
  }, []);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog card pad"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 540, width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}
      >
        <div className="sheet-handle show-on-mobile" />
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 24 }}>📱</span>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800 }}>{t('install.title')}</h2>
              <div className="small muted">{t('install.subtitle')}</div>
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose} type="button">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Tab Picker */}
        <div className="segmented" style={{ marginBottom: 16 }}>
          <button
            type="button"
            aria-selected={activeTab === 'pwa'}
            onClick={() => setActiveTab('pwa')}
          >
            ⚡ {t('install.tabPwa')}
          </button>
          <button
            type="button"
            aria-selected={activeTab === 'apk'}
            onClick={() => setActiveTab('apk')}
          >
            🤖 {t('install.tabApk')}
          </button>
          <button
            type="button"
            aria-selected={activeTab === 'ios'}
            onClick={() => setActiveTab('ios')}
          >
            🍏 {t('install.tabIos')}
          </button>
        </div>

        {/* TAB 1: Progressive Web App (PWA) */}
        {activeTab === 'pwa' && (
          <div className="col" style={{ gap: 14 }}>
            {installed ? (
              <div className="card pad" style={{ background: 'var(--ok-soft)', border: '1px solid var(--ok)' }}>
                <div className="row" style={{ gap: 10 }}>
                  <Icon name="check" size={20} />
                  <div>
                    <strong>{t('install.alreadyInstalledTitle')}</strong>
                    <div className="small" style={{ marginTop: 2 }}>
                      {t('install.alreadyInstalledDesc')}
                    </div>
                  </div>
                </div>
              </div>
            ) : isIos ? (
              /* iOS Safari Instructions */
              <div className="card pad" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 750, marginBottom: 8 }}>
                  🍏 {t('install.iosSafariStepsTitle')}
                </h3>
                <ol className="small col" style={{ gap: 8, paddingLeft: 18, margin: 0, lineHeight: 1.5 }}>
                  <li>
                    {t('install.iosStep1')} <strong>(Share / Teilen 􀈂)</strong>
                  </li>
                  <li>
                    {t('install.iosStep2')} <strong>"Zum Home-Bildschirm" (⊞)</strong>
                  </li>
                  <li>
                    {t('install.iosStep3')} <strong>"Hinzufügen"</strong>
                  </li>
                </ol>
                <div className="small muted" style={{ marginTop: 8 }}>
                  {t('install.iosBenefit')}
                </div>
              </div>
            ) : (
              /* Android Chrome & Desktop 1-Click Install */
              <div className="col" style={{ gap: 10 }}>
                <div className="card pad" style={{ background: 'var(--surface-2)' }}>
                  <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <strong>{t('install.oneClickTitle')}</strong>
                      <div className="small muted" style={{ marginTop: 2 }}>
                        {t('install.oneClickDesc')}
                      </div>
                    </div>
                    {canInstall && (
                      <button
                        className="btn primary"
                        onClick={() => promptInstall()}
                        type="button"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        ⚡ {t('install.installNowBtn')}
                      </button>
                    )}
                  </div>
                </div>

                {!canInstall && (
                  <div className="small muted" style={{ lineHeight: 1.45 }}>
                    💡 {t('install.browserMenuHint')} (z.B. Chrome Menü ⋮ → "App installieren" oder "Zum Startbildschirm hinzufügen").
                  </div>
                )}
              </div>
            )}

            {/* QR Code Scan to open on mobile */}
            <div className="card pad" style={{ textAlign: 'center', background: 'var(--surface)' }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>
                📱 {t('install.qrScanTitle')}
              </div>
              <div style={{ display: 'inline-block', padding: 8, background: '#fff', borderRadius: 12 }}>
                <QrCodeSvg value={currentUrl} size={150} />
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                {t('install.qrScanDesc')}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Android APK */}
        {activeTab === 'apk' && (
          <div className="col" style={{ gap: 14 }}>
            <div className="card pad" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 24 }}>🤖</span>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 750, margin: 0 }}>
                    UntisPlus-debug.apk
                  </h3>
                  <div className="small muted" style={{ marginTop: 3 }}>
                    Native Android App (Capacitor 8 + OpenJDK 21)
                  </div>
                </div>
                <span className="badge ok">Bereit (4.6 MB)</span>
              </div>

              <div className="small" style={{ marginTop: 12, lineHeight: 1.5 }}>
                <p style={{ margin: '0 0 8px 0' }}>
                  Die native Android-App wurde direkt im Projekt kompiliert und liegt unter:
                  <br />
                  <code style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 6 }}>
                    UntisPlus/dist-mobile/UntisPlus-debug.apk
                  </code>
                </p>

                <strong>{t('install.apkInstallStepsTitle')}:</strong>
                <ol style={{ paddingLeft: 18, margin: '6px 0 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>APK auf das Android-Smartphone übertragen oder herunterladen</li>
                  <li>In Android: "Installation aus unbekannten Quellen" zulassen</li>
                  <li>Tippe auf die APK, um Untis⁺ direkt zu installieren</li>
                </ol>
              </div>

              <div className="row" style={{ marginTop: 14, gap: 8 }}>
                <button
                  className="btn sm primary"
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('npm run build:apk');
                    toast(t('common.copied'));
                  }}
                  style={{ gap: 5 }}
                >
                  <Icon name="copy" size={14} />
                  <span>Build-Befehl kopieren</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: iOS IPA & Sideloading */}
        {activeTab === 'ios' && (
          <div className="col" style={{ gap: 14 }}>
            <div className="card pad" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 24 }}>🍏</span>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 750, margin: 0 }}>
                    iOS App (IPA & Sideloading)
                  </h3>
                  <div className="small muted" style={{ marginTop: 3 }}>
                    Native Xcode / Capacitor Workspace (`apps/web/ios`)
                  </div>
                </div>
              </div>

              <div className="small" style={{ marginTop: 12, lineHeight: 1.5 }}>
                <p style={{ margin: '0 0 8px 0' }}>
                  Auf Apple iOS gibt es für eigene Builds zwei bequeme Wege:
                </p>
                <div className="col" style={{ gap: 8 }}>
                  <div className="card pad" style={{ background: 'var(--surface)', padding: 10 }}>
                    <strong>1. 🌟 Empfohlen: PWA (Kein Sideloading nötig!)</strong>
                    <div className="muted" style={{ marginTop: 2 }}>
                      In Safari auf <strong>Teilen (􀈂) → "Zum Home-Bildschirm"</strong>. Funktioniert sofort ohne 7-Tage-Zertifikat-Limit!
                    </div>
                  </div>
                  <div className="card pad" style={{ background: 'var(--surface)', padding: 10 }}>
                    <strong>2. 📦 Native IPA Sideloading (AltStore / Sideloadly)</strong>
                    <div className="muted" style={{ marginTop: 2 }}>
                      Das GitHub Actions Workflow <code>.github/workflows/build-mobile.yml</code> baut automatisch die <code>UntisPlus-Debug.ipa</code>. Diese kann via Sideloadly, AltStore oder TrollStore installiert werden.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
