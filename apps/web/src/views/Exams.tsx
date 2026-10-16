import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, minutesToTime, type Exam } from '@untisplus/shared';
import { api } from '../api.js';
import { useModule, useWeekLessons } from '../data.js';
import { useApp } from '../store.js';
import { dowShort, names, primarySubject, subjectColor, todayIso } from '../lib.js';
import { EmptyState, ErrorState, Icon, Segmented } from '../components/primitives.js';
import { ListSkeleton, ModuleHeader, ModuleUnavailable, PageSubtitle } from '../components/module-ui.js';
import { CalendarExportModal } from '../components/CalendarExportModal.js';

interface ExamPrepData {
  notes: string;
  checklist: { id: string; text: string; done: boolean }[];
}

const PREP_STORAGE_KEY = 'untisplus_exam_prep';
const GRADES_STORAGE_KEY = 'untisplus_exam_grades';
const GRADES_STORAGE_KEY_ALT = 'up.exam_grades';

function loadPrepData(): Record<number, ExamPrepData> {
  try {
    const raw = localStorage.getItem(PREP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePrepData(data: Record<number, ExamPrepData>): void {
  try {
    localStorage.setItem(PREP_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

function loadGrades(): Record<string, number> {
  try {
    const raw =
      (typeof localStorage !== 'undefined' ? localStorage.getItem(GRADES_STORAGE_KEY_ALT) : null) ??
      (typeof localStorage !== 'undefined' ? localStorage.getItem(GRADES_STORAGE_KEY) : null);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveGrades(grades: Record<string, number>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const serialized = JSON.stringify(grades);
      localStorage.setItem(GRADES_STORAGE_KEY, serialized);
      localStorage.setItem(GRADES_STORAGE_KEY_ALT, serialized);
    }
  } catch {
    // Ignore storage quota errors
  }
}

function daysDiff(targetIso: string, fromIso: string): number {
  const [ty, tm, td] = targetIso.split('-').map(Number) as [number, number, number];
  const [fy, fm, fd] = fromIso.split('-').map(Number) as [number, number, number];
  const tDate = new Date(ty, tm - 1, td);
  const fDate = new Date(fy, fm - 1, fd);
  return Math.round((tDate.getTime() - fDate.getTime()) / 86_400_000);
}

/** Upcoming exams, countdown badges, study checklists, target GPA simulator, and calendar export. */
export function ExamsView() {
  const { t, i18n } = useTranslation();
  const { master } = useApp();
  const today = todayIso();

  const { start, end } = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const syStart = currentMonth >= 7 ? `${currentYear}-09-01` : `${currentYear - 1}-09-01`;
    const syEnd = currentMonth >= 7 ? `${currentYear + 1}-07-31` : `${currentYear}-07-31`;
    return { start: syStart, end: syEnd };
  }, []);

  const mod = useModule<Exam>(() => api.exams(start, end), [start, end]);

  const [activeTab, setActiveTab] = useState<'list' | 'simulator'>('list');
  const [examScope, setExamScope] = useState<'all' | 'upcoming' | 'past'>('all');
  const [prepMap, setPrepMap] = useState<Record<number, ExamPrepData>>(() => loadPrepData());
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [grades, setGrades] = useState<Record<string, number>>(() => loadGrades());
  const [calModalOpen, setCalModalOpen] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [showAllSchoolSubjects, setShowAllSchoolSubjects] = useState(false);
  const [copiedGpa, setCopiedGpa] = useState(false);

  const { lessons } = useWeekLessons();

  useEffect(() => {
    savePrepData(prepMap);
  }, [prepMap]);

  useEffect(() => {
    saveGrades(grades);
  }, [grades]);

  const items = useMemo(() => {
    const list = [...mod.items].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
    if (examScope === 'upcoming') {
      return list.filter((e) => e.date >= today);
    }
    if (examScope === 'past') {
      return list.filter((e) => e.date < today);
    }
    return list;
  }, [mod.items, examScope, today]);

  // Active timetable subject names for prioritizing student's own subjects
  const timetableSubjectCodes = useMemo(() => {
    const set = new Set<string>();
    for (const l of lessons) {
      const ps = primarySubject(l);
      if (ps?.name) set.add(ps.name);
    }
    return set;
  }, [lessons]);

  // Collect subjects from exams and master data for the GPA simulator
  const allSubjects = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const s of master?.subjects ?? []) {
      map.set(s.name, { code: s.name, name: s.longName ?? s.name });
    }
    for (const e of items) {
      if (e.subject) {
        map.set(e.subject.name, {
          code: e.subject.name,
          name: e.subject.longName ?? e.subject.name,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [master?.subjects, items]);

  const { mySubjects, otherSubjects } = useMemo(() => {
    const my: Array<{ code: string; name: string }> = [];
    const other: Array<{ code: string; name: string }> = [];

    for (const s of allSubjects) {
      const isCurrent =
        timetableSubjectCodes.has(s.code) ||
        items.some((e) => e.subject?.name === s.code) ||
        grades[s.code] !== undefined;

      if (isCurrent) {
        my.push(s);
      } else {
        other.push(s);
      }
    }

    return { mySubjects: my, otherSubjects: other };
  }, [allSubjects, timetableSubjectCodes, items, grades]);

  const q = subjectSearch.trim().toLowerCase();
  const visibleMySubjects = useMemo(() => {
    if (!q) return mySubjects;
    return mySubjects.filter(
      (s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [mySubjects, q]);

  const visibleOtherSubjects = useMemo(() => {
    if (!q) return otherSubjects;
    return otherSubjects.filter(
      (s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [otherSubjects, q]);

  const gradeCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of Object.values(grades)) {
      if (g >= 1 && g <= 5) counts[g] = (counts[g] || 0) + 1;
    }
    return counts;
  }, [grades]);

  function updateNotes(examId: number, notes: string) {
    setPrepMap((prev) => ({
      ...prev,
      [examId]: {
        notes,
        checklist: prev[examId]?.checklist ?? [],
      },
    }));
  }

  function addChecklistItem(examId: number) {
    const text = newChecklistText.trim();
    if (!text) return;
    setPrepMap((prev) => {
      const cur = prev[examId] ?? { notes: '', checklist: [] };
      return {
        ...prev,
        [examId]: {
          ...cur,
          checklist: [...cur.checklist, { id: String(Date.now()), text, done: false }],
        },
      };
    });
    setNewChecklistText('');
  }

  function toggleChecklistItem(examId: number, itemId: string) {
    setPrepMap((prev) => {
      const cur = prev[examId];
      if (!cur) return prev;
      return {
        ...prev,
        [examId]: {
          ...cur,
          checklist: cur.checklist.map((item) =>
            item.id === itemId ? { ...item, done: !item.done } : item,
          ),
        },
      };
    });
  }

  function removeChecklistItem(examId: number, itemId: string) {
    setPrepMap((prev) => {
      const cur = prev[examId];
      if (!cur) return prev;
      return {
        ...prev,
        [examId]: {
          ...cur,
          checklist: cur.checklist.filter((item) => item.id !== itemId),
        },
      };
    });
  }

  // GPA calculation
  const gradeValues = Object.values(grades).filter((g) => g >= 1 && g <= 5);
  const averageGpa =
    gradeValues.length > 0
      ? (gradeValues.reduce((sum, g) => sum + g, 0) / gradeValues.length).toFixed(2)
      : null;

  const hasFailingGrade = gradeValues.some((g) => g === 5);
  const numericAvg = averageGpa ? parseFloat(averageGpa) : 0;
  const isExcellent = !hasFailingGrade && numericAvg <= 1.5 && !gradeValues.some((g) => g > 2);
  const isGood = !hasFailingGrade && !isExcellent && numericAvg <= 2.0 && !gradeValues.some((g) => g > 3);

  return (
    <div>
      <ModuleHeader
        title={t('exams.title')}
        icon="gradCap"
        right={
          <button
            type="button"
            className="btn sm"
            onClick={() => setCalModalOpen(true)}
            style={{ gap: 6 }}
            title={t('calendar.exportButton')}
          >
            <Icon name="calendar" size={15} />
            <span>{t('calendar.exportButton')}</span>
          </button>
        }
      />
      <PageSubtitle>{t('exams.subtitle')}</PageSubtitle>

      {/* Tabs */}
      <div style={{ marginBottom: 16 }}>
        <Segmented
          label="Exams Tabs"
          value={activeTab}
          onChange={(v) => setActiveTab(v as 'list' | 'simulator')}
          options={[
            { value: 'list', label: t('exams.tabsList') },
            { value: 'simulator', label: t('exams.tabsSimulator') },
          ]}
        />
      </div>

      {activeTab === 'list' && (
        <>
          <div style={{ marginBottom: 14 }}>
            <Segmented
              label="Exam Scope"
              value={examScope}
              onChange={(v) => setExamScope(v as 'all' | 'upcoming' | 'past')}
              options={[
                { value: 'all', label: `${t('common.all')} (${mod.items.length})` },
                { value: 'upcoming', label: `⏳ ${t('exams.upcoming') || 'Kommende'}` },
                { value: 'past', label: `🏁 ${t('exams.past') || 'Vergangene'}` },
              ]}
            />
          </div>

          {mod.loading && <ListSkeleton rows={2} height={84} />}
          {!mod.loading && mod.error ? (
            <ErrorState
              message={t('common.error')}
              onRetry={mod.reload}
              retryLabel={t('common.retry')}
            />
          ) : null}

          {!mod.loading && !mod.error && !mod.available && <ModuleUnavailable />}
          {!mod.loading && !mod.error && mod.available && items.length === 0 && (
            <EmptyState icon="gradCap" title={t('exams.none')} />
          )}

          {!mod.loading && !mod.error && mod.available && items.length > 0 && (
            <div className="day-list">
              {items.map((e) => {
                const color = subjectColor(e.subject?.id, e.subject?.name);
                const diff = daysDiff(e.date, today);
                const isExpanded = expandedExamId === e.id;
                const prep = prepMap[e.id] ?? { notes: '', checklist: [] };
                const checkedCount = prep.checklist.filter((i) => i.done).length;

                return (
                  <div
                    key={e.id}
                    className="item"
                    style={{
                      ['--subj' as string]: color,
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 10,
                    }}
                  >
                    <div className="row" style={{ alignItems: 'center', width: '100%', gap: 12 }}>
                      <div
                        className="col"
                        style={{
                          flex: 'none',
                          width: 74,
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                        }}
                      >
                        <div className="small muted">{dowShort(e.date, i18n.language)}</div>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 18,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {e.date.slice(8, 10)}.{e.date.slice(5, 7)}.
                        </div>
                        <div className="tiny muted">
                          {minutesToTime(e.startMin)}–{minutesToTime(e.endMin)}
                        </div>
                      </div>

                      <div className="item-body" style={{ flex: 1 }}>
                        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                          <span className="item-title">{e.subject?.name ?? '—'}</span>
                          <div className="spacer" />

                          {/* Countdown badge */}
                          {diff === 0 ? (
                            <span className="badge danger">{t('exams.countdownToday')}</span>
                          ) : diff === 1 ? (
                            <span className="badge warn">{t('exams.countdownTomorrow')}</span>
                          ) : diff < 14 ? (
                            <span className="badge info">
                              {t('exams.countdownDays', { days: diff })}
                            </span>
                          ) : (
                            <span className="badge info">
                              {t('exams.countdownWeeks', { weeks: Math.round(diff / 7) })}
                            </span>
                          )}

                          <span className="badge exam">{e.type ?? t('today.exam')}</span>
                        </div>

                        {e.text && <div className="item-text">{e.text}</div>}

                        <div className="item-meta">
                          {e.teachers.length > 0 && (
                            <span>
                              <Icon name="user" size={13} /> {names(e.teachers)}
                            </span>
                          )}
                          {e.rooms.length > 0 && (
                            <span>
                              <Icon name="mapPin" size={13} /> {names(e.rooms)}
                            </span>
                          )}
                          {prep.checklist.length > 0 && (
                            <span className="chip" style={{ fontSize: 11 }}>
                              ✓ {checkedCount}/{prep.checklist.length}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setExpandedExamId(isExpanded ? null : e.id)}
                        aria-label="Expand prep checklist"
                      >
                        <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={16} />
                      </button>
                    </div>

                    {/* Expandable Preparation & Checklist Section */}
                    {isExpanded && (
                      <div
                        className="col"
                        style={{
                          marginTop: 6,
                          padding: '12px 14px',
                          background: 'var(--surface-2)',
                          borderRadius: 'var(--radius-sm)',
                          borderTop: '1px solid var(--border)',
                          gap: 10,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          📝 {t('exams.checklistTitle')}
                        </div>

                        {/* Checklist items */}
                        {prep.checklist.map((item) => (
                          <div
                            key={item.id}
                            className="row"
                            style={{
                              gap: 8,
                              alignItems: 'center',
                              fontSize: 13,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={() => toggleChecklistItem(e.id, item.id)}
                              style={{ cursor: 'pointer' }}
                            />
                            <span
                              style={{
                                flex: 1,
                                textDecoration: item.done ? 'line-through' : 'none',
                                color: item.done ? 'var(--muted)' : 'inherit',
                              }}
                            >
                              {item.text}
                            </span>
                            <button
                              type="button"
                              className="btn ghost sm"
                              style={{ padding: '2px 6px', color: 'var(--muted)' }}
                              onClick={() => removeChecklistItem(e.id, item.id)}
                            >
                              ✕
                            </button>
                          </div>
                        ))}

                        {/* Add checklist item */}
                        <div className="row" style={{ gap: 6 }}>
                          <input
                            className="input small"
                            placeholder={t('exams.addChecklistItem')}
                            value={newChecklistText}
                            onChange={(ev) => setNewChecklistText(ev.target.value)}
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter') addChecklistItem(e.id);
                            }}
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            className="btn primary sm"
                            onClick={() => addChecklistItem(e.id)}
                          >
                            <Icon name="plus" size={14} />
                          </button>
                        </div>

                        {/* Personal Notes */}
                        <textarea
                          className="input small"
                          rows={2}
                          placeholder={t('exams.notesPlaceholder')}
                          value={prep.notes}
                          onChange={(ev) => updateNotes(e.id, ev.target.value)}
                          style={{ resize: 'vertical', fontSize: 12 }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Target GPA Simulator Tab */}
      {activeTab === 'simulator' && (
        <div className="col" style={{ gap: 16 }}>
          {/* Main GPA & Honors Banner */}
          <div
            className="card pad col"
            style={{
              gap: 12,
              background: 'var(--surface)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow)',
            }}
          >
            <div className="row wrap" style={{ gap: 12, alignItems: 'center' }}>
              <div className="col" style={{ flex: 1, minWidth: 160 }}>
                <span className="tiny muted uppercase" style={{ fontWeight: 800, letterSpacing: '0.05em' }}>
                  Österreichischer Notenschnitt
                </span>
                <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                  <span
                    style={{
                      fontSize: 42,
                      fontWeight: 900,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '-0.03em',
                      color: hasFailingGrade
                        ? 'var(--danger)'
                        : isExcellent || isGood
                        ? 'var(--ok)'
                        : 'var(--text)',
                    }}
                  >
                    {averageGpa ?? '—'}
                  </span>
                  {gradeValues.length > 0 && (
                    <span className="small muted">({gradeValues.length} Fächer benotet)</span>
                  )}
                </div>
              </div>

              {averageGpa && (
                <div className="col" style={{ alignItems: 'flex-end', gap: 6 }}>
                  <span
                    className={`badge ${
                      hasFailingGrade ? 'danger' : isExcellent || isGood ? 'ok' : 'info'
                    }`}
                    style={{ fontSize: 14, padding: '7px 14px', fontWeight: 800, borderRadius: 999 }}
                  >
                    {hasFailingGrade
                      ? '⚠️ Nicht Bestanden / Gefährdet'
                      : isExcellent
                      ? '🏆 Ausgezeichneter Erfolg'
                      : isGood
                      ? '🎖️ Guter Erfolg'
                      : '✅ Bestanden'}
                  </span>
                  <span className="tiny muted">{t('exams.honorHint')}</span>
                </div>
              )}
            </div>

            {/* Grade Distribution Bar */}
            <div
              className="row wrap"
              style={{
                gap: 8,
                background: 'var(--surface-2)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                alignItems: 'center',
              }}
            >
              <div className="row wrap" style={{ gap: 6, flex: 1 }}>
                <span className="chip" style={{ borderLeft: '3px solid #16a34a', fontWeight: 700 }}>
                  1️⃣ Sehr Gut: {gradeCounts[1] || 0}
                </span>
                <span className="chip" style={{ borderLeft: '3px solid #2563eb', fontWeight: 700 }}>
                  2️⃣ Gut: {gradeCounts[2] || 0}
                </span>
                <span className="chip" style={{ borderLeft: '3px solid #eab308', fontWeight: 700 }}>
                  3️⃣ Befriedigend: {gradeCounts[3] || 0}
                </span>
                <span className="chip" style={{ borderLeft: '3px solid #ea580c', fontWeight: 700 }}>
                  4️⃣ Genügend: {gradeCounts[4] || 0}
                </span>
                <span className="chip" style={{ borderLeft: '3px solid #dc2626', fontWeight: 700 }}>
                  5️⃣ Nicht Genügend: {gradeCounts[5] || 0}
                </span>
              </div>

              <div className="row" style={{ gap: 6 }}>
                {averageGpa && (
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(`Notenschnitt: ${averageGpa}`);
                        setCopiedGpa(true);
                        setTimeout(() => setCopiedGpa(false), 2000);
                      }
                    }}
                    title="Notenschnitt kopieren"
                  >
                    <Icon name="check" size={13} />
                    <span>{copiedGpa ? 'Kopiert!' : 'Kopieren'}</span>
                  </button>
                )}
                {gradeValues.length > 0 && (
                  <button
                    type="button"
                    className="btn sm ghost danger"
                    onClick={() => {
                      if (confirm('Möchtest du wirklich alle eingetragenen Noten zurücksetzen?')) {
                        setGrades({});
                      }
                    }}
                    title="Alle Noten löschen"
                  >
                    <span>Zurücksetzen</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Subject Filter Bar */}
          <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
            <input
              type="search"
              className="input sm"
              placeholder="🔍 Fach suchen (z.B. AM, D, POS)..."
              value={subjectSearch}
              onChange={(e) => setSubjectSearch(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
          </div>

          {/* Student's Current Subjects */}
          <div className="card pad col" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>
                📚 Meine Fächer ({visibleMySubjects.length})
              </span>
              <span className="tiny muted">Noten werden automatisch gespeichert</span>
            </div>

            <div className="col" style={{ gap: 8 }}>
              {visibleMySubjects.length === 0 ? (
                <div className="small muted" style={{ padding: '8px 0' }}>
                  Keine passenden Fächer gefunden.
                </div>
              ) : (
                visibleMySubjects.map((sub) => {
                  const currentGrade = grades[sub.code];
                  const color = subjectColor(undefined, sub.code);
                  return (
                    <div
                      key={sub.code}
                      className="row wrap"
                      style={{
                        padding: '10px 12px',
                        background: 'var(--surface-2)',
                        borderRadius: 'var(--radius-sm)',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div className="row" style={{ gap: 10, flex: 1, minWidth: 140, alignItems: 'center' }}>
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            background: color,
                            flexShrink: 0,
                          }}
                        />
                        <div className="col" style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 800, fontSize: 15 }}>{sub.code}</span>
                          {sub.name !== sub.code && (
                            <span
                              className="tiny muted nowrap"
                              style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {sub.name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Grade Selector (1 to 5) with Austrian colors */}
                      <div className="row" style={{ gap: 6 }}>
                        {[
                          { grade: 1, label: '1', name: 'Sehr Gut', color: '#16a34a' },
                          { grade: 2, label: '2', name: 'Gut', color: '#2563eb' },
                          { grade: 3, label: '3', name: 'Befriedigend', color: '#eab308' },
                          { grade: 4, label: '4', name: 'Genügend', color: '#ea580c' },
                          { grade: 5, label: '5', name: 'Nicht Genügend', color: '#dc2626' },
                        ].map(({ grade, label, name, color }) => {
                          const isSelected = currentGrade === grade;
                          return (
                            <button
                              key={grade}
                              type="button"
                              className="btn sm"
                              style={{
                                width: 36,
                                height: 36,
                                padding: 0,
                                justifyContent: 'center',
                                fontWeight: isSelected ? 900 : 600,
                                fontSize: 14,
                                borderRadius: 'var(--radius-sm, 6px)',
                                background: isSelected ? color : 'var(--surface)',
                                color: isSelected ? '#ffffff' : 'var(--text)',
                                borderColor: isSelected ? color : 'var(--border)',
                                boxShadow: isSelected
                                  ? `0 2px 8px color-mix(in srgb, ${color} 40%, transparent)`
                                  : 'none',
                              }}
                              title={`${name} (${grade})`}
                              onClick={() => {
                                setGrades((prev) => {
                                  if (prev[sub.code] === grade) {
                                    const next = { ...prev };
                                    delete next[sub.code];
                                    return next;
                                  }
                                  return { ...prev, [sub.code]: grade };
                                });
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Other School Subjects Toggle */}
          {otherSubjects.length > 0 && (
            <div className="col" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn sm ghost"
                style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                onClick={() => setShowAllSchoolSubjects(!showAllSchoolSubjects)}
              >
                <span>
                  {showAllSchoolSubjects
                    ? '▲ Weitere Schulfächer ausblenden'
                    : `➕ Weitere Schulfächer anzeigen (${otherSubjects.length} Fächer)`}
                </span>
              </button>

              {showAllSchoolSubjects && (
                <div className="card pad col" style={{ gap: 8, background: 'var(--surface-2)' }}>
                  <div className="small muted">
                    Alle weiteren Fächer der Schule ({visibleOtherSubjects.length}):
                  </div>
                  <div className="col" style={{ gap: 8 }}>
                    {visibleOtherSubjects.map((sub) => {
                      const currentGrade = grades[sub.code];
                      const color = subjectColor(undefined, sub.code);
                      return (
                        <div
                          key={sub.code}
                          className="row wrap"
                          style={{
                            padding: '10px 12px',
                            background: 'var(--surface)',
                            borderRadius: 'var(--radius-sm)',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          <div className="row" style={{ gap: 10, flex: 1, minWidth: 140, alignItems: 'center' }}>
                            <span
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: 999,
                                background: color,
                                flexShrink: 0,
                              }}
                            />
                            <div className="col" style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontWeight: 800, fontSize: 15 }}>{sub.code}</span>
                              {sub.name !== sub.code && (
                                <span
                                  className="tiny muted nowrap"
                                  style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                  {sub.name}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="row" style={{ gap: 6 }}>
                            {[
                              { grade: 1, label: '1', name: 'Sehr Gut', color: '#16a34a' },
                              { grade: 2, label: '2', name: 'Gut', color: '#2563eb' },
                              { grade: 3, label: '3', name: 'Befriedigend', color: '#eab308' },
                              { grade: 4, label: '4', name: 'Genügend', color: '#ea580c' },
                              { grade: 5, label: '5', name: 'Nicht Genügend', color: '#dc2626' },
                            ].map(({ grade, label, name, color }) => {
                              const isSelected = currentGrade === grade;
                              return (
                                <button
                                  key={grade}
                                  type="button"
                                  className="btn sm"
                                  style={{
                                    width: 36,
                                    height: 36,
                                    padding: 0,
                                    justifyContent: 'center',
                                    fontWeight: isSelected ? 900 : 600,
                                    fontSize: 14,
                                    borderRadius: 'var(--radius-sm, 6px)',
                                    background: isSelected ? color : 'var(--surface)',
                                    color: isSelected ? '#ffffff' : 'var(--text)',
                                    borderColor: isSelected ? color : 'var(--border)',
                                    boxShadow: isSelected
                                      ? `0 2px 8px color-mix(in srgb, ${color} 40%, transparent)`
                                      : 'none',
                                  }}
                                  title={`${name} (${grade})`}
                                  onClick={() => {
                                    setGrades((prev) => {
                                      if (prev[sub.code] === grade) {
                                        const next = { ...prev };
                                        delete next[sub.code];
                                        return next;
                                      }
                                      return { ...prev, [sub.code]: grade };
                                    });
                                  }}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Calendar Export Hub Modal */}
      <CalendarExportModal
        open={calModalOpen}
        onClose={() => setCalModalOpen(false)}
        initialScope="exams"
      />
    </div>
  );
}
