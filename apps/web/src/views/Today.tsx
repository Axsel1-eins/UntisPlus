import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, deduplicateExams, isExamForLesson, type Exam, type Holiday, type Lesson } from '@untisplus/shared';
import { api } from '../api.js';
import { useApp } from '../store.js';
import { useEffectiveTarget, useModule, useWeekLessons } from '../data.js';
import { useNow } from '../hooks.js';
import { dowShort, formatDay, formatTime, lessonsForDay, todayIso } from '../lib.js';
import { LessonCard } from '../components/LessonCard.js';
import { LessonDetail } from '../components/LessonDetail.js';
import { DayExamBanner } from '../components/DayExamBanner.js';
import { NowBar } from '../components/NowBar.js';
import { TargetPicker } from '../components/TargetPicker.js';
import { CalendarExportModal } from '../components/CalendarExportModal.js';
import { Dialog, EmptyState, ErrorState, Icon, Skeleton } from '../components/primitives.js';
import { navigate } from '../router.js';
import { useCustomization } from '../customization.js';

const GAP_MIN = 10;

function daysDifference(dateIso1: string, dateIso2: string): number {
  const [y1, m1, d1] = dateIso1.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = dateIso2.split('-').map(Number) as [number, number, number];
  const t1 = new Date(y1, m1 - 1, d1).getTime();
  const t2 = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((t1 - t2) / 86_400_000);
}

function holidayEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('herbst')) return '🍂';
  if (n.includes('weihnacht') || n.includes('winter') || n.includes('neujahr')) return '🎄';
  if (n.includes('semester') || n.includes('schnee') || n.includes('ski')) return '⛷️';
  if (n.includes('oster')) return '🐰';
  if (n.includes('pfingst') || n.includes('frühling') || n.includes('mai')) return '🌸';
  if (n.includes('sommer')) return '☀️';
  if (n.includes('national') || n.includes('staatsfeiertag')) return '🇦🇹';
  return '🏖️';
}

function formatShortRange(startIso: string, endIso: string, lang: string): string {
  const [, sm, sd] = startIso.split('-');
  const [, em, ed] = endIso.split('-');
  return `${sd}.${sm}. – ${ed}.${em}.`;
}

export function TodayView() {
  const { t, i18n } = useTranslation();
  const { role, setTarget, master } = useApp();
  const customization = useCustomization();
  const now = useNow(30_000);
  const [anchor, setAnchor] = useState(todayIso());
  const [selectedDay, setSelectedDay] = useState(todayIso());
  const [detail, setDetail] = useState<Lesson | null>(null);
  const [calModalOpen, setCalModalOpen] = useState(false);

  const handleWeekChange = (offsetDays: number) => {
    setAnchor((prev) => addDays(prev, offsetDays));
    setSelectedDay((prev) => addDays(prev, offsetDays));
  };

  const { lessons, loading, error, reload, weekStart } = useWeekLessons(anchor);
  const effectiveTarget = useEffectiveTarget();

  const examsMod = useModule<Exam>(
    () => api.exams(addDays(weekStart, -7), addDays(weekStart, 14)),
    [weekStart],
  );
  const cleanExams = useMemo(() => deduplicateExams(examsMod.items), [examsMod.items]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const visibleDays = weekDays.filter((d) => !isWeekendIso(d));
  const showWeekend = customization.showWeekend || isWeekendIso(selectedDay);
  const days = showWeekend ? weekDays : (visibleDays.length ? visibleDays : weekDays);

  const dayLessons = useMemo(() => lessonsForDay(lessons, selectedDay), [lessons, selectedDay]);
  const selectedDayExams = useMemo(
    () => cleanExams.filter((e) => e.date === selectedDay),
    [cleanExams, selectedDay],
  );

  const cancelledToday = useMemo(() => dayLessons.filter((l) => l.status === 'CANCELLED'), [dayLessons]);
  const irregularToday = useMemo(
    () => dayLessons.filter((l) => (l.status === 'IRREGULAR' || Boolean(l.substText)) && l.status !== 'CANCELLED'),
    [dayLessons],
  );
  const changesCount = cancelledToday.length + irregularToday.length;

  const today = todayIso();

  // Find next upcoming holiday or active holiday
  const holidayInfo = useMemo(() => {
    if (!master?.holidays || master.holidays.length === 0) return null;

    // Check if a holiday is currently active
    const active = master.holidays.find((h) => h.startDate <= today && today <= h.endDate);
    if (active) {
      const remainingDays = daysDifference(active.endDate, today);
      return {
        holiday: active,
        isActive: true,
        daysText: remainingDays <= 0 ? t('today.today') : t('today.daysLeft', { count: remainingDays }),
        dateRange: formatShortRange(active.startDate, active.endDate, i18n.language),
        emoji: holidayEmoji(active.name),
      };
    }

    // Find next upcoming holiday
    const future = master.holidays
      .filter((h) => h.startDate > today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

    if (!future) return null;

    const diff = daysDifference(future.startDate, today);
    const daysText =
      diff === 1 ? t('today.tomorrow') : t('today.inDays', { count: diff });

    return {
      holiday: future,
      isActive: false,
      daysText,
      dateRange: formatShortRange(future.startDate, future.endDate, i18n.language),
      emoji: holidayEmoji(future.name),
    };
  }, [master?.holidays, today, t, i18n.language]);

  // Build a timeline that includes breaks and free gaps between lessons.
  const timeline = useMemo(() => {
    const items: (
      | { kind: 'lesson'; lesson: Lesson }
      | { kind: 'gap'; from: number; to: number; duration: number; label: string }
    )[] = [];
    const minGap = customization.breakMinMinutes ?? 5;
    let cursor: number | undefined;
    for (const lesson of dayLessons) {
      if (cursor !== undefined && lesson.startMin - cursor >= minGap) {
        const gap = lesson.startMin - cursor;
        let label = customization.breakShortLabel?.trim() || t('timetable.break');
        if (gap >= 25) {
          label = customization.breakLunchLabel?.trim() || t('timetable.lunchBreak');
        } else if (gap >= 10) {
          label = customization.breakLongLabel?.trim() || t('timetable.longBreak');
        }
        items.push({ kind: 'gap', from: cursor, to: lesson.startMin, duration: gap, label });
      }
      items.push({ kind: 'lesson', lesson });
      cursor = Math.max(cursor ?? 0, lesson.endMin);
    }
    return items;
  }, [dayLessons, customization.breakMinMinutes, customization.breakShortLabel, customization.breakLongLabel, customization.breakLunchLabel, t]);

  return (
    <div>
      <div className="row wrap" style={{ gap: 12, marginBottom: 14 }}>
        <h1 className="page-title">{t('today.title')}</h1>
        <div className="spacer" />
        <TargetPicker onChange={setTarget} />
      </div>

      {!effectiveTarget && !loading && (
        <ErrorState message={t('timetable.chooseClass')} />
      )}

      {/* Upcoming Holidays Countdown Banner */}
      {holidayInfo && (
        <div
          className="card pad row wrap"
          style={{
            gap: 12,
            marginBottom: 14,
            background: holidayInfo.isActive
              ? 'color-mix(in srgb, var(--ok-soft) 40%, var(--surface))'
              : 'color-mix(in srgb, var(--accent) 10%, var(--surface))',
            border: holidayInfo.isActive ? '1px solid var(--ok)' : '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>{holidayInfo.emoji}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
                {holidayInfo.isActive
                  ? `${t('today.holidayActive')}: ${holidayInfo.holiday.name}`
                  : `${holidayInfo.holiday.name} ${holidayInfo.daysText}`}
              </div>
              <div className="small muted">
                {holidayInfo.dateRange} · {holidayInfo.holiday.longName || t('today.holidaySubtitle')}
              </div>
            </div>
          </div>
          <div className="spacer" />
          <button
            type="button"
            className="btn sm"
            onClick={() => setCalModalOpen(true)}
            style={{ gap: 6 }}
            title={t('calendar.exportButton')}
          >
            <Icon name="calendar" size={14} />
            <span>{t('calendar.exportButton')}</span>
          </button>
        </div>
      )}

      {/* Day strip */}
      <div className="row" style={{ gap: 6, marginBottom: 12, justifyContent: 'space-between' }}>
        <button
          className="btn ghost icon"
          aria-label={t('timetable.prevWeek')}
          onClick={() => handleWeekChange(-7)}
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <div className="row" style={{ gap: 6, flex: 1, justifyContent: 'center' }}>
          {days.map((day) => {
            const active = day === selectedDay;
            const isToday = day === today;
            const dayHasExams = cleanExams.some((e) => e.date === day);
            return (
              <button
                key={day}
                className="btn sm"
                type="button"
                onClick={() => setSelectedDay(day)}
                style={{
                  flexDirection: 'column',
                  flex: '1 1 0',
                  minWidth: 0,
                  maxWidth: 68,
                  minHeight: 54,
                  padding: '4px 2px',
                  gap: 0,
                  background: active ? 'var(--accent)' : 'var(--surface)',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  color: active ? 'var(--accent-ink)' : 'var(--text)',
                  position: 'relative',
                }}
              >
                <span className="tiny" style={{ opacity: 0.8 }}>
                  {dowShort(day, i18n.language)}
                </span>
                <span style={{ fontWeight: 800, fontSize: 17 }}>
                  {Number(day.slice(-2))}
                </span>
                <div className="row" style={{ gap: 3, alignItems: 'center', height: 10 }}>
                  {isToday && (
                    <span
                      className="tiny"
                      style={{ opacity: 0.9, textDecoration: active ? 'none' : 'underline' }}
                    >
                      •
                    </span>
                  )}
                  {dayHasExams && (
                    <span
                      title={t('today.examsOnDay')}
                      style={{
                        fontSize: 9,
                        color: active ? 'var(--accent-ink)' : '#ef4444',
                        fontWeight: 900,
                        lineHeight: 1,
                      }}
                    >
                      ●
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <button
          className="btn ghost icon"
          aria-label={t('timetable.nextWeek')}
          onClick={() => handleWeekChange(7)}
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      {selectedDay === today && <NowBar lessons={lessons} now={now} />}

      <div className="section">
        <h2>{formatDay(selectedDay, i18n.language)}</h2>
        {loading && (
          <div className="col">
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        )}
        {error ? <ErrorState message={t('common.error')} onRetry={reload} retryLabel={t('common.retry')} /> : null}

        {!loading && !error && (
          <DayExamBanner
            exams={selectedDayExams}
            selectedDay={selectedDay}
            dayLessons={dayLessons}
            onSelectLesson={setDetail}
          />
        )}

        {!loading && !error && dayLessons.length === 0 && (
          <EmptyState icon="check" title={t('today.noLessons')} />
        )}
        {!loading && !error && dayLessons.length > 0 && (
          <>
            {changesCount > 0 && (
              <div
                className="card pad row wrap"
                style={{
                  gap: 12,
                  marginBottom: 14,
                  background: 'color-mix(in srgb, var(--warn-soft) 40%, var(--surface))',
                  border: '1px solid var(--warn)',
                  borderRadius: 'var(--radius)',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>⚠️</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
                      {t('today.changesAlert', { count: changesCount })}
                    </div>
                    <div className="small muted">
                      {cancelledToday.length > 0 && `${cancelledToday.length}× ${t('today.cancelled')} `}
                      {irregularToday.length > 0 && `${irregularToday.length}× ${t('today.irregular')}`}
                    </div>
                  </div>
                </div>
                <div className="spacer" />
                <button
                  type="button"
                  className="btn sm"
                  style={{ background: 'var(--warn)', color: '#fff', borderColor: 'var(--warn)' }}
                  onClick={() => navigate('subs')}
                >
                  <Icon name="bell" size={14} />
                  <span>{t('subs.title')}</span>
                </button>
              </div>
            )}

            <div className="day-list">
              {timeline.map((item, idx) =>
                item.kind === 'gap' ? (
                  <div className="free-gap" key={`gap-${idx}`}>
                    <span>
                      {item.duration >= 25 ? '🍽️ ' : item.duration >= 10 ? '☕ ' : '⏸️ '}
                      {item.label} ({formatTime(item.from)}–{formatTime(item.to)})
                    </span>
                  </div>
                ) : (() => {
                  const matching = cleanExams.filter((e) => isExamForLesson(item.lesson, e));
                  return (
                    <LessonCard
                      key={`${item.lesson.id}-${idx}`}
                      lesson={
                        matching.length > 0
                          ? { ...item.lesson, isExam: true }
                          : item.lesson
                      }
                      linkedExams={matching}
                      role={role}
                      onClick={setDetail}
                    />
                  );
                })(),
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={t('today.title')}>
        {detail && (
          <LessonDetail
            lesson={detail}
            role={role}
            linkedExams={cleanExams.filter((e) => isExamForLesson(detail, e))}
            onClose={() => setDetail(null)}
          />
        )}
      </Dialog>

      {/* Calendar Export Hub Modal */}
      <CalendarExportModal
        open={calModalOpen}
        onClose={() => setCalModalOpen(false)}
        initialScope="holidays"
      />
    </div>
  );
}

function isWeekendIso(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}
