import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildICalendar,
  type CalendarScope,
  type Exam,
  type Holiday,
  type Lesson,
} from '@untisplus/shared';
import { api } from '../api.js';
import { useApp } from '../store.js';
import { typeName } from '../data.js';
import { Dialog, Icon, Segmented, Spinner } from './primitives.js';
import { QrCodeSvg } from './QrCodeSvg.js';
import { toast } from '../toast.js';

export type { CalendarScope };

export function CalendarExportModal({
  open,
  onClose,
  initialScope = 'all',
}: {
  open: boolean;
  onClose: () => void;
  initialScope?: CalendarScope;
}) {
  const { t } = useTranslation();
  const { session, master, target } = useApp();
  const [scope, setScope] = useState<CalendarScope>(initialScope);
  const [calFeed, setCalFeed] = useState<{ token: string; url: string; webcalUrl: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open) setScope(initialScope);
  }, [open, initialScope]);

  // Fetch calendar feed token
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const targetArg = target ? { id: target.id, type: typeName(target.type) } : undefined;
    api
      .calendarToken(targetArg)
      .then((res) => {
        if (active) setCalFeed(res);
      })
      .catch(() => {
        if (active) setCalFeed(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, target]);

  const effectiveWebcalUrl = useMemo(() => {
    if (!calFeed) return '';
    const urlObj = new URL(calFeed.webcalUrl);
    urlObj.searchParams.set('scope', scope);
    return urlObj.toString();
  }, [calFeed, scope]);

  const effectiveHttpUrl = useMemo(() => {
    if (!calFeed) return '';
    const urlObj = new URL(calFeed.url);
    urlObj.searchParams.set('scope', scope);
    return urlObj.toString();
  }, [calFeed, scope]);

  async function copyUrl() {
    if (!effectiveHttpUrl) return;
    try {
      await navigator.clipboard.writeText(effectiveHttpUrl);
      toast(t('calendar.copied'), 'success');
    } catch {
      window.prompt(t('calendar.copyUrl'), effectiveHttpUrl);
    }
  }

  // Client-side RFC 5545 .ics generator for direct downloads
  async function handleDownloadIcs() {
    setDownloading(true);
    try {
      const now = new Date();
      const schoolName = session?.school.displayName || session?.school.loginName || 'Untis+';
      const calName = `Untis⁺ ${schoolName} (${t(`calendar.scope_${scope}` as const)})`;

      const todayStr = now.toISOString().slice(0, 10);
      const futureDate = new Date(now.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);
      const pastDate = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
      const futureTtDate = new Date(now.getTime() + 28 * 86_400_000).toISOString().slice(0, 10);

      let exams: Exam[] = [];
      let lessons: Lesson[] = [];
      const holidays: Holiday[] = master?.holidays ?? [];

      if (scope === 'all' || scope === 'exams') {
        try {
          const examRes = await api.exams(todayStr, futureDate);
          exams = examRes.data ?? [];
        } catch {
          // Ignore module permission error if exams unavailable
        }
      }

      if (scope === 'all' || scope === 'timetable') {
        const targetArg = target ? { id: target.id, type: typeName(target.type) } : undefined;
        try {
          const ttRes = await api.timetable(pastDate, futureTtDate, targetArg);
          lessons = ttRes.lessons ?? [];
        } catch {
          // Ignore timetable error
        }
      }

      const icsContent = buildICalendar({
        calendarName: calName,
        schoolName,
        lessons,
        exams,
        holidays,
        scope,
        includeAlarms: true,
        now,
      });

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `untis-export-${scope}.ics`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t('calendar.downloadedSuccess'), 'success');
    } catch {
      toast(t('calendar.error'), 'error');
    } finally {
      setDownloading(false);
    }
  }

  // Google Calendar subscribe URL
  const googleCalUrl = effectiveWebcalUrl
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(effectiveWebcalUrl)}`
    : '#';

  // Outlook Web subscribe URL
  const outlookUrl = effectiveWebcalUrl
    ? `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(effectiveWebcalUrl)}`
    : '#';

  return (
    <Dialog open={open} onClose={onClose} title={t('calendar.exportModalTitle')}>
      <div className="col" style={{ gap: 14, maxHeight: '78vh', overflowY: 'auto' }}>
        <p className="small muted" style={{ margin: 0 }}>
          {t('calendar.exportModalSubtitle')}
        </p>

        {/* Scope Picker */}
        <div className="col" style={{ gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{t('calendar.scopeLabel')}</span>
          <Segmented
            label={t('calendar.scopeLabel')}
            value={scope}
            onChange={(v) => setScope(v as CalendarScope)}
            options={[
              { value: 'all', label: `✨ ${t('calendar.scopeAll')}` },
              { value: 'exams', label: `📝 ${t('calendar.scopeExams')}` },
              { value: 'holidays', label: `🏖️ ${t('calendar.scopeHolidays')}` },
              { value: 'timetable', label: `📅 ${t('calendar.scopeTimetable')}` },
            ]}
          />
        </div>

        {/* 1-Click Platform Buttons Grid */}
        <div className="col" style={{ gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{t('calendar.platformsTitle')}</span>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 8,
            }}
          >
            {/* Apple Kalender */}
            <a
              href={effectiveWebcalUrl || '#'}
              className="btn primary"
              style={{ justifyContent: 'center', textDecoration: 'none' }}
              title="Apple Kalender (iOS & macOS)"
            >
              <span style={{ fontSize: 16 }}>🍏</span>
              <span>{t('calendar.appApple')}</span>
            </a>

            {/* Google Kalender */}
            <a
              href={googleCalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ justifyContent: 'center', textDecoration: 'none' }}
              title="Google Calendar Web"
            >
              <span style={{ fontSize: 16 }}>📅</span>
              <span>{t('calendar.appGoogle')}</span>
            </a>

            {/* Microsoft Outlook */}
            <a
              href={outlookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ justifyContent: 'center', textDecoration: 'none' }}
              title="Microsoft Outlook Web"
            >
              <span style={{ fontSize: 16 }}>✉️</span>
              <span>{t('calendar.appOutlook')}</span>
            </a>

            {/* Android / .ics File Download */}
            <button
              type="button"
              className="btn"
              onClick={handleDownloadIcs}
              disabled={downloading}
              style={{ justifyContent: 'center' }}
            >
              {downloading ? <Spinner size={16} /> : <span style={{ fontSize: 16 }}>🤖</span>}
              <span>{t('calendar.downloadIcs')}</span>
            </button>
          </div>
        </div>

        {/* QR Code Section for Camera Scan */}
        <div
          className="card pad col"
          style={{
            alignItems: 'center',
            gap: 10,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, textAlign: 'center' }}>
            📱 {t('calendar.qrTitle')}
          </div>
          <div className="tiny muted" style={{ textAlign: 'center', maxWidth: 360 }}>
            {t('calendar.qrHint')}
          </div>

          {loading ? (
            <div style={{ width: 180, height: 180, display: 'grid', placeItems: 'center' }}>
              <Spinner size={24} />
            </div>
          ) : effectiveWebcalUrl ? (
            <div
              style={{
                padding: 12,
                background: '#ffffff',
                borderRadius: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
            >
              <QrCodeSvg
                value={effectiveWebcalUrl}
                size={180}
                quietZone={2}
                fgColor="#0f172a"
                bgColor="#ffffff"
              />
            </div>
          ) : (
            <div className="small muted">{t('calendar.error')}</div>
          )}

          {/* Copy URL Row */}
          <div className="row wrap" style={{ gap: 6, width: '100%', marginTop: 4 }}>
            <input
              type="text"
              readOnly
              value={effectiveHttpUrl || ''}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{
                flex: 1,
                minWidth: 160,
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--muted)',
                fontSize: 12,
              }}
            />
            <button type="button" className="btn sm" onClick={copyUrl}>
              <Icon name="clipboard" size={14} />
              <span>{t('calendar.copyUrl')}</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="tiny muted" style={{ lineHeight: 1.5 }}>
          💡 {t('calendar.syncHelp')}
        </div>
      </div>
    </Dialog>
  );
}
