import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, minutesToTime, type Absence } from '@untisplus/shared';
import { api } from '../api.js';
import { useModule } from '../data.js';
import { formatDay, todayIso } from '../lib.js';
import { useApp } from '../store.js';
import { toast } from '../toast.js';
import { EmptyState, ErrorState, Icon, Segmented } from '../components/primitives.js';
import { ListSkeleton, ModuleHeader, PageSubtitle } from '../components/module-ui.js';

export interface PersonalAbsence {
  id: string;
  start: string;
  end: string;
  periods: number;
  reason: string;
  subjectName?: string;
  hasAttest: boolean;
  status: 'offen' | 'abgegeben' | 'bestaetigt';
  notes?: string;
  createdAt: string;
}

const STORAGE_KEY = 'up.personal_absences';

function loadPersonalAbsences(): PersonalAbsence[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePersonalAbsences(items: PersonalAbsence[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage errors
  }
}

/** Calculate days between two ISO dates (b - a) */
function daysDiff(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/** Unified absence item (merges WebUntis & Personal Absences) */
interface UnifiedAbsence {
  id: string | number;
  isPersonal: boolean;
  start: string;
  end: string;
  startTime?: string | number;
  endTime?: string | number;
  periods: number;
  excused: boolean;
  excuseStatus: string;
  reason: string;
  text?: string;
  subjectName?: string;
  hasAttest?: boolean;
  notes?: string;
  personalItem?: PersonalAbsence;
}

export function AbsencesView() {
  const { t, i18n } = useTranslation();
  const { session, master } = useApp();

  const today = todayIso();

  // Date range selection (default: current school year)
  const [dateRangeMode, setDateRangeMode] = useState<'schoolyear' | 'last60' | 'all'>('schoolyear');

  const { start, end } = useMemo(() => {
    if (dateRangeMode === 'last60') {
      return { start: addDays(today, -60), end: today };
    }
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const syStart = currentMonth >= 7 ? `${currentYear}-09-01` : `${currentYear - 1}-09-01`;
    const syEnd = currentMonth >= 7 ? `${currentYear + 1}-07-31` : `${currentYear}-07-31`;
    if (dateRangeMode === 'all') {
      return { start: `${currentYear - 3}-09-01`, end: syEnd };
    }
    return { start: syStart, end: syEnd };
  }, [dateRangeMode]);

  // WebUntis module data
  const mod = useModule<Absence>(() => api.absences(start, end), [start, end]);

  // Personal absences from localStorage
  const [personalItems, setPersonalItems] = useState<PersonalAbsence[]>(loadPersonalAbsences);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [excuseTarget, setExcuseTarget] = useState<UnifiedAbsence | null>(null);

  // Filter state
  const [filterTab, setFilterTab] = useState<'all' | 'open' | 'excused' | 'illness' | 'late'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Persist changes
  useEffect(() => {
    savePersonalAbsences(personalItems);
  }, [personalItems]);

  // Combine WebUntis items + Personal items
  const unifiedItems: UnifiedAbsence[] = useMemo(() => {
    const webList: UnifiedAbsence[] = (mod.items || []).map((w: any) => {
      const reasonVal = w.reason && w.reason !== '—' ? w.reason : (w.text || t('absences.unspecifiedReason'));
      const textVal = w.text && w.text !== w.reason && w.text !== '—' ? w.text : undefined;
      return {
        id: `wu-${w.id}`,
        isPersonal: false,
        start: w.start,
        end: w.end,
        startTime: w.startTime ?? w.startTimeStr ?? w.startMin,
        endTime: w.endTime ?? w.endTimeStr ?? w.endMin,
        periods: w.periods ?? 1,
        excused: Boolean(w.excused),
        excuseStatus: w.excused
          ? (w.excuseStatus && /entsch/i.test(w.excuseStatus) ? w.excuseStatus : t('absences.excused'))
          : (w.excuseStatus ?? t('absences.pending')),
        reason: reasonVal,
        text: textVal,
        subjectName: w.subject?.name,
      };
    });

    const persList: UnifiedAbsence[] = personalItems.map((p) => ({
      id: p.id,
      isPersonal: true,
      start: p.start,
      end: p.end,
      periods: p.periods,
      excused: p.status === 'bestaetigt',
      excuseStatus:
        p.status === 'bestaetigt'
          ? t('absences.statusConfirmed')
          : p.status === 'abgegeben'
            ? t('absences.statusSubmitted')
            : t('absences.statusOpen'),
      reason: p.reason,
      text: p.notes,
      subjectName: p.subjectName,
      hasAttest: p.hasAttest,
      notes: p.notes,
      personalItem: p,
    }));

    return [...webList, ...persList].sort((a, b) => b.start.localeCompare(a.start));
  }, [mod.items, personalItems, t]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return unifiedItems.filter((item) => {
      // Tab filter
      if (filterTab === 'open' && item.excused) return false;
      if (filterTab === 'excused' && !item.excused) return false;
      if (filterTab === 'illness' && !/krank|grippe|arzt|fieber|infekt/i.test(item.reason)) return false;
      if (filterTab === 'late' && !/spät|verspät|zug|öbb|bus/i.test(item.reason)) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchReason = item.reason.toLowerCase().includes(q);
        const matchSubj = item.subjectName?.toLowerCase().includes(q);
        const matchNotes = item.notes?.toLowerCase().includes(q);
        const matchDate = item.start.includes(q) || item.end.includes(q);
        if (!matchReason && !matchSubj && !matchNotes && !matchDate) return false;
      }

      return true;
    });
  }, [unifiedItems, filterTab, searchQuery]);

  // Statistics
  const totalPeriods = unifiedItems.reduce((acc, i) => acc + (i.periods || 0), 0);
  const openAbsences = unifiedItems.filter((i) => !i.excused);
  const openPeriods = openAbsences.reduce((acc, i) => acc + (i.periods || 0), 0);
  const excusedAbsences = unifiedItems.filter((i) => i.excused);
  const excusedPeriods = totalPeriods - openPeriods;
  const excusedCount = excusedAbsences.length;

  // 5-Day Legal Deadline Watchdog (§ 45 SchUG)
  const urgentDeadlineItems = useMemo(() => {
    return openAbsences.filter((a) => {
      const deadline = addDays(a.end, 5);
      const diff = daysDiff(today, deadline);
      return diff >= -14 && diff <= 5; // Recently expired or upcoming within 5 days
    });
  }, [openAbsences, today]);

  // Subject missed percentage calculation (Austrian >20% rule)
  const subjectStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of unifiedItems) {
      const subj = item.subjectName || 'Allgemein';
      map.set(subj, (map.get(subj) || 0) + item.periods);
    }
    const list: { subject: string; missed: number; percent: number }[] = [];
    // Assume average semester hours per subject is ~30 lessons
    const BASE_SEMESTER_HOURS = 30;
    map.forEach((missed, subject) => {
      const percent = Math.min(100, Math.round((missed / BASE_SEMESTER_HOURS) * 100));
      list.push({ subject, missed, percent });
    });
    return list.sort((a, b) => b.percent - a.percent);
  }, [unifiedItems]);

  const atRiskSubjects = subjectStats.filter((s) => s.percent >= 15);

  function label(a: UnifiedAbsence): string {
    return a.start === a.end
      ? formatDay(a.start, i18n.language)
      : `${formatDay(a.start, i18n.language)} – ${formatDay(a.end, i18n.language)}`;
  }

  function timeRange(a: UnifiedAbsence): string | null {
    if (a.startTime !== undefined && a.endTime !== undefined) {
      const s = typeof a.startTime === 'number' ? minutesToTime(a.startTime) : String(a.startTime);
      const e = typeof a.endTime === 'number' ? minutesToTime(a.endTime) : String(a.endTime);
      return `${s}–${e}`;
    }
    return null;
  }

  function handleAddPersonal(entry: Omit<PersonalAbsence, 'id' | 'createdAt'>) {
    const newEntry: PersonalAbsence = {
      ...entry,
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    setPersonalItems((prev) => [newEntry, ...prev]);
    setShowAddModal(false);
    toast(t('absences.toastSaved'));
  }

  function handleDeletePersonal(id: string) {
    setPersonalItems((prev) => prev.filter((p) => p.id !== id));
    toast(t('absences.toastDeleted'));
  }

  function handleUpdateStatus(id: string, status: PersonalAbsence['status']) {
    setPersonalItems((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    toast(t('absences.toastUpdated'));
  }

  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <ModuleHeader title={t('absences.title')} icon="calendarX" />
          <PageSubtitle>{t('absences.subtitle')}</PageSubtitle>
        </div>
        <button
          className="btn primary"
          onClick={() => setShowAddModal(true)}
          style={{ whiteSpace: 'nowrap', gap: 6 }}
          type="button"
        >
          <Icon name="plus" size={16} />
          <span>{t('absences.addBtn')}</span>
        </button>
      </div>

      {mod.loading && <ListSkeleton rows={3} height={70} />}

      {/* Permission warning if school blocks RPC */}
      {!mod.loading && !mod.available && (
        <div className="alert warn" style={{ marginBottom: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="alert" size={18} />
            <div>
              <strong>{t('absences.schoolRestrictedTitle')}</strong>
              <div className="small" style={{ marginTop: 2 }}>
                {t('absences.schoolRestrictedDesc')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Frist-Warnung (5-Tage-Frist SchUG § 45) */}
      {urgentDeadlineItems.length > 0 && (
        <div className="alert" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444', marginBottom: 16 }}>
          <div className="col" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8, color: '#dc2626', fontWeight: 800 }}>
              <Icon name="alert" size={18} />
              <span>{t('absences.deadlineAlertTitle')} (SchUG § 45)</span>
            </div>
            <div className="small">
              {urgentDeadlineItems.map((item) => {
                const deadline = addDays(item.end, 5);
                const diff = daysDiff(today, deadline);
                return (
                  <div key={item.id} className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
                    <span>
                      {label(item)}: <strong>{item.reason}</strong>
                    </span>
                    <span style={{ fontWeight: 700, color: diff >= 0 ? '#b45309' : '#dc2626' }}>
                      {diff >= 0 ? `${t('absences.deadlineRemaining')}: ${diff} ${t('common.days')}` : t('absences.deadlinePassed')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 20% Feststellungsprüfungs-Gefahr */}
      {atRiskSubjects.length > 0 && (
        <div className="alert warn" style={{ marginBottom: 16 }}>
          <div className="col" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 8, fontWeight: 750 }}>
              <Icon name="alert" size={18} />
              <span>{t('absences.examRiskTitle')} (SchUG § 20 Abs. 2)</span>
            </div>
            <div className="small">
              {atRiskSubjects.map((s) => (
                <div key={s.subject} className="row" style={{ justifyContent: 'space-between', marginTop: 2 }}>
                  <span>
                    {t('absences.subjectMissed', { subject: s.subject, count: s.missed })}
                  </span>
                  <span className={`badge ${s.percent >= 20 ? 'irregular' : 'subst'}`}>
                    {s.percent}% Quote
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <div className="n">{totalPeriods}</div>
          <div className="l">{t('absences.totalPeriods')}</div>
        </div>
        <div className="card stat">
          <div className="n" style={{ color: openPeriods > 0 ? 'var(--warn)' : 'var(--ok)' }}>
            {openPeriods}
          </div>
          <div className="l">{t('absences.unexcusedShort')}</div>
        </div>
        <div className="card stat">
          <div className="n" style={{ color: 'var(--ok)' }}>
            {excusedCount}
          </div>
          <div className="l">
            {i18n.language === 'de' ? 'entschuldigte Fehlzeiten' : t('absences.excused')}
          </div>
        </div>
        <div className="card stat">
          <div className="n">{unifiedItems.length}</div>
          <div className="l">{t('absences.totalAbsences')}</div>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{t('timetable.range') || 'Zeitraum'}:</span>
          <Segmented<'schoolyear' | 'last60' | 'all'>
            label="Zeitraum"
            value={dateRangeMode}
            onChange={(v: 'schoolyear' | 'last60' | 'all') => setDateRangeMode(v)}
            options={[
              { value: 'schoolyear', label: '📅 Schuljahr' },
              { value: 'last60', label: '🕒 60 Tage' },
              { value: 'all', label: '📚 Archiv' },
            ]}
          />
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div className="tabs" style={{ flex: 1, minWidth: 260 }}>
          <button
            type="button"
            className={`btn sm ${filterTab === 'all' ? 'primary' : 'ghost'}`}
            onClick={() => setFilterTab('all')}
          >
            {t('common.all')} ({unifiedItems.length})
          </button>
          <button
            type="button"
            className={`btn sm ${filterTab === 'open' ? 'primary' : 'ghost'}`}
            onClick={() => setFilterTab('open')}
          >
            {t('absences.pending')} ({openAbsences.length})
          </button>
          <button
            type="button"
            className={`btn sm ${filterTab === 'excused' ? 'primary' : 'ghost'}`}
            onClick={() => setFilterTab('excused')}
          >
            {t('absences.excused')} ({unifiedItems.length - openAbsences.length})
          </button>
          <button
            type="button"
            className={`btn sm ${filterTab === 'illness' ? 'primary' : 'ghost'}`}
            onClick={() => setFilterTab('illness')}
          >
            🤒 {t('absences.filterIllness')}
          </button>
          <button
            type="button"
            className={`btn sm ${filterTab === 'late' ? 'primary' : 'ghost'}`}
            onClick={() => setFilterTab('late')}
          >
            🚆 {t('absences.filterLate')}
          </button>
        </div>

        <div style={{ position: 'relative', minWidth: 160 }}>
          <input
            className="input"
            style={{ paddingLeft: 32, height: 34, minHeight: 34, fontSize: 13 }}
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div style={{ position: 'absolute', left: 10, top: 8, opacity: 0.5 }}>
            <Icon name="search" size={14} />
          </div>
        </div>
      </div>

      {/* List of Absences */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon="calendarX"
          title={totalPeriods === 0 ? t('absences.zeroNotice') : t('absences.none')}
          hint={totalPeriods === 0 ? t('absences.zeroNoticeBody') : undefined}
        />
      ) : (
        <div className="day-list">
          {filteredItems.map((a) => (
            <div
              key={a.id}
              className="item"
              style={{ ['--subj' as string]: a.excused ? 'var(--ok)' : 'var(--warn)' }}
            >
              <div className="item-body">
                <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <div>
                    <span className="item-title" style={{ fontSize: 15, fontWeight: 750 }}>
                      {label(a)}
                    </span>
                    {a.isPersonal && (
                      <span className="badge" style={{ marginLeft: 8, fontSize: 11, background: 'var(--surface-2)' }}>
                        {t('absences.personalEntry')}
                      </span>
                    )}
                  </div>
                  <div className="spacer" />
                  <span className={`badge ${a.excused ? 'ok' : 'irregular'}`}>
                    {a.excused ? (a.excuseStatus || t('absences.excused')) : (a.excuseStatus || t('absences.pending'))}
                  </span>
                </div>

                <div className="item-meta" style={{ marginTop: 6, flexWrap: 'wrap', gap: '6px 12px' }}>
                  {timeRange(a) && (
                    <span>
                      <Icon name="clock" size={13} /> {timeRange(a)}
                    </span>
                  )}
                  <span>
                    <Icon name="clock" size={13} /> {a.periods} {t('absences.periods')}
                  </span>
                  {a.subjectName && (
                    <span>
                      <Icon name="book" size={13} /> {a.subjectName}
                    </span>
                  )}
                  {a.reason && (
                    <span>
                      <Icon name="alert" size={13} /> {t('absences.reason')}: <strong>{a.reason}</strong>
                    </span>
                  )}
                  {a.hasAttest && (
                    <span style={{ color: 'var(--ok)', fontWeight: 650 }}>
                      ✓ {t('absences.hasAttest')}
                    </span>
                  )}
                </div>

                {a.text && a.text !== a.reason && (
                  <div className="small muted" style={{ marginTop: 4, fontStyle: 'italic' }}>
                    "{a.text}"
                  </div>
                )}
                {a.notes && a.notes !== a.text && (
                  <div className="small muted" style={{ marginTop: 4, fontStyle: 'italic' }}>
                    "{a.notes}"
                  </div>
                )}

                {/* Quick Action Buttons */}
                <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="btn sm"
                    onClick={() => setExcuseTarget(a)}
                    type="button"
                    style={{ gap: 5 }}
                  >
                    <Icon name="clipboard" size={13} />
                    <span>{t('absences.generateLetterBtn')}</span>
                  </button>

                  {a.isPersonal && a.personalItem && (
                    <>
                      {a.personalItem.status !== 'bestaetigt' && (
                        <button
                          className="btn sm"
                          onClick={() => handleUpdateStatus(a.personalItem!.id, 'bestaetigt')}
                          type="button"
                          style={{ color: 'var(--ok)' }}
                        >
                          ✓ {t('absences.markConfirmed')}
                        </button>
                      )}
                      <button
                        className="btn sm ghost"
                        onClick={() => handleDeletePersonal(a.personalItem!.id)}
                        type="button"
                        style={{ color: 'var(--danger)', padding: '0 6px' }}
                        title={t('common.delete')}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Absence Modal */}
      {showAddModal && (
        <AddAbsenceModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddPersonal}
          subjects={master?.subjects || []}
        />
      )}

      {/* Excuse Letter Generator Modal */}
      {excuseTarget && (
        <ExcuseLetterModal
          absence={excuseTarget}
          onClose={() => setExcuseTarget(null)}
          session={session}
          master={master}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Sub-components: Add Absence Modal & Excuse Letter Generator
// --------------------------------------------------------------------------

function AddAbsenceModal({
  onClose,
  onAdd,
  subjects,
}: {
  onClose: () => void;
  onAdd: (data: Omit<PersonalAbsence, 'id' | 'createdAt'>) => void;
  subjects: { id: number; name: string }[];
}) {
  const { t } = useTranslation();
  const today = todayIso();

  const REASON_PRESETS = [
    t('absences.reasonIllness'),
    t('absences.reasonDoctor'),
    t('absences.reasonDrivingTest'),
    t('absences.reasonTransitDelay'),
    t('absences.reasonOfficialAppointment'),
    t('absences.reasonJobInterview'),
    t('absences.reasonSchoolEvent'),
    t('absences.reasonOtherPrivate'),
  ];

  const [date, setDate] = useState(today);
  const [periods, setPeriods] = useState('1');
  const [reasonCategory, setReasonCategory] = useState(REASON_PRESETS[0] || 'Krankheit');
  const [customReason, setCustomReason] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [hasAttest, setHasAttest] = useState(false);
  const [status, setStatus] = useState<'offen' | 'abgegeben' | 'bestaetigt'>('offen');
  const [notes, setNotes] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalReason = customReason.trim() ? customReason.trim() : reasonCategory;
    onAdd({
      start: date,
      end: date,
      periods: Math.max(1, parseInt(periods, 10) || 1),
      reason: finalReason,
      subjectName: subjectName || undefined,
      hasAttest,
      status,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog card pad" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="sheet-handle show-on-mobile" />
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>{t('absences.addModalTitle')}</h2>
          <button className="btn ghost sm" onClick={onClose} type="button">
            <Icon name="close" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="col" style={{ gap: 12 }}>
          <div>
            <label className="field">{t('common.date')}</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="field">{t('absences.periods')}</label>
              <input
                type="number"
                min="1"
                max="12"
                className="input"
                value={periods}
                onChange={(e) => setPeriods(e.target.value)}
                required
              />
            </div>
            <div style={{ flex: 1.5 }}>
              <label className="field">{t('absences.subject')}</label>
              <select
                className="select"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
              >
                <option value="">{t('absences.allSubjects')}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="field">{t('absences.reason')}</label>
            <select
              className="select"
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
            >
              {REASON_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              type="text"
              className="input"
              style={{ marginTop: 6 }}
              placeholder={t('absences.customReasonPlaceholder')}
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
            />
          </div>

          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="field">{t('absences.status')}</label>
              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="offen">{t('absences.statusOpen')}</option>
                <option value="abgegeben">{t('absences.statusSubmitted')}</option>
                <option value="bestaetigt">{t('absences.statusConfirmed')}</option>
              </select>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingTop: 20 }}>
              <label className="row" style={{ cursor: 'pointer', gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={hasAttest}
                  onChange={(e) => setHasAttest(e.target.checked)}
                />
                <span>{t('absences.attestAttached')}</span>
              </label>
            </div>
          </div>

          <div>
            <label className="field">{t('absences.notes')}</label>
            <input
              type="text"
              className="input"
              placeholder={t('absences.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button className="btn" type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn primary" type="submit">
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExcuseLetterModal({
  absence,
  onClose,
  session,
  master,
}: {
  absence: UnifiedAbsence;
  onClose: () => void;
  session: any;
  master: any;
}) {
  const { t, i18n } = useTranslation();

  const studentName = session?.displayName || t('absences.defaultStudentName');
  const klasseName = master?.klassen?.[0]?.name || '3BHIF';
  const schoolName = session?.school?.displayName || 'HTBLUVA St. Pölten';

  const [kvName, setKvName] = useState(t('absences.defaultKv'));
  const [customText, setCustomText] = useState('');

  const formattedDate = formatDay(absence.start, i18n.language);

  // Generate formal Austrian excuse letter
  const letterBody = useMemo(() => {
    return (
      `Sehr geehrte(r) Frau/Herr ${kvName},\n\n` +
      `hiermit entschuldige ich das Fernbleiben von ${studentName} (Klasse ${klasseName}) an der Schule ${schoolName} am ${formattedDate} (${absence.periods} Unterrichtsstunde(n)).\n\n` +
      `Grund der Abwesenheit: ${absence.reason}.\n` +
      (absence.hasAttest ? `Eine ärztliche Bestätigung liegt diesem Schreiben bei.\n\n` : `\n`) +
      `Ich ersuche höflich darum, das Fehlen zu entschuldigen und die Fehlstunden im Klassenbuch als entschuldigt einzutragen.\n\n` +
      `Mit freundlichen Grüßen,\n` +
      `${studentName}`
    );
  }, [kvName, studentName, klasseName, schoolName, formattedDate, absence]);

  function handleCopy() {
    navigator.clipboard.writeText(letterBody);
    toast(t('common.copied'));
  }

  function handleEmail() {
    const mailto = `mailto:?subject=${encodeURIComponent(
      `Entschuldigung: ${studentName} (${klasseName}) - ${formattedDate}`
    )}&body=${encodeURIComponent(letterBody)}`;
    window.location.href = mailto;
  }

  function handlePrint() {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${t('absences.excuseTitle')} - ${studentName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; padding: 40px; max-width: 700px; margin: auto; }
            h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 24px; }
            pre { white-space: pre-wrap; font-family: inherit; font-size: 15px; }
            .date { text-align: right; color: #555; margin-bottom: 30px; }
            .sig { margin-top: 50px; }
          </style>
        </head>
        <body>
          <h1>${t('absences.writtenExcuse')}</h1>
          <div class="date">${formatDay(todayIso(), i18n.language)}</div>
          <pre>${letterBody}</pre>
          <div class="sig">______________________________<br><small>${t('absences.signatureParent')}</small></div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog card pad" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <div className="sheet-handle show-on-mobile" />
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>📄 {t('absences.letterModalTitle')}</h2>
          <button className="btn ghost sm" onClick={onClose} type="button">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="col" style={{ gap: 10 }}>
          <div>
            <label className="field">{t('absences.kvLabel')}</label>
            <input
              className="input"
              value={kvName}
              onChange={(e) => setKvName(e.target.value)}
              placeholder={t('absences.kvPlaceholder')}
            />
          </div>

          <div
            className="card pad"
            style={{
              background: 'var(--surface-2)',
              fontSize: 13.5,
              whiteSpace: 'pre-wrap',
              maxHeight: 240,
              overflowY: 'auto',
              fontFamily: 'inherit',
              border: '1px dashed var(--border)',
            }}
          >
            {letterBody}
          </div>

          <div className="row" style={{ justifyContent: 'space-between', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn sm" type="button" onClick={handlePrint} style={{ gap: 5 }}>
              <Icon name="download" size={14} />
              <span>{t('absences.printPdfBtn')}</span>
            </button>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm" type="button" onClick={handleEmail} style={{ gap: 5 }}>
                <Icon name="mail" size={14} />
                <span>{t('absences.emailBtn')}</span>
              </button>
              <button className="btn sm primary" type="button" onClick={handleCopy} style={{ gap: 5 }}>
                <Icon name="copy" size={14} />
                <span>{t('common.copy')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
