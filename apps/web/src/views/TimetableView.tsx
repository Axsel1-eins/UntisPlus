import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ElementType,
  addDays,
  deduplicateExams,
  formatCalendarWeek,
  getCalendarWeek,
  isExamForLesson,
  minutesToTime,
  mondayOf,
  type Exam,
  type Homework,
  type Lesson,
  type TimeGridSlot,
} from '@untisplus/shared';
import { api } from '../api.js';
import { useApp } from '../store.js';
import { updateCustomization, useCustomization } from '../customization.js';
import { useEffectiveTarget, useModule, useWeekLessons } from '../data.js';
import {
  dowShort,
  formatDay,
  formatTime,
  lessonsForDay,
  primarySubject,
  subjectColor,
  subjectLabel,
  subjectTextColor,
  todayIso,
} from '../lib.js';
import { LessonCard } from '../components/LessonCard.js';
import { LessonDetail } from '../components/LessonDetail.js';
import { DayExamBanner } from '../components/DayExamBanner.js';
import { TargetPicker } from '../components/TargetPicker.js';
import { TargetModal } from '../components/TargetModal.js';
import { CalendarExportModal } from '../components/CalendarExportModal.js';
import { Dialog, EmptyState, ErrorState, Icon, Segmented, Skeleton } from '../components/primitives.js';

type Mode = 'week' | 'day';

interface PeriodRow {
  type: 'period';
  key: string;
  name: string;
  startMin: number;
  endMin: number;
}

interface BreakRow {
  type: 'break';
  key: string;
  label: string;
  startMin: number;
  endMin: number;
  duration: number;
}

type TimetableRow = PeriodRow | BreakRow;

export function TimetableView() {
  const { t, i18n } = useTranslation();
  const { role, target, setTarget, master } = useApp();
  const customization = useCustomization();
  const {
    showWeekend,
    showFreePeriods,
    showBreaks,
    weekLayout,
    showPeriodNumber,
    showPeriodTimes,
    showRoomInWeek,
    showTeacherInWeek,
  } = customization;

  const [anchor, setAnchor] = useState(todayIso());
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      return 'day';
    }
    return 'week';
  });
  const [dayIndex, setDayIndex] = useState(() => {
    const dow = new Date().getDay();
    return dow === 0 || dow === 6 ? 0 : dow - 1;
  });
  const [detail, setDetail] = useState<Lesson | null>(null);
  const [targetExplorerOpen, setTargetExplorerOpen] = useState(false);
  const [calModalOpen, setCalModalOpen] = useState(false);
  const weekScrollRef = useRef<HTMLDivElement>(null);

  const { lessons, loading, error, reload, weekStart } = useWeekLessons(anchor);
  const effectiveTarget = useEffectiveTarget();

  const examsMod = useModule<Exam>(
    () => api.exams(addDays(weekStart, -7), addDays(weekStart, 21)),
    [weekStart],
  );
  const hwMod = useModule<Homework>(
    () => api.homework(addDays(weekStart, -7), addDays(weekStart, 21)),
    [weekStart],
  );

  const cleanExams = useMemo(() => deduplicateExams(examsMod.items), [examsMod.items]);

  const detailExams = useMemo(() => {
    if (!detail) return [];
    return cleanExams.filter((e) => isExamForLesson(detail, e));
  }, [detail, cleanExams]);

  const detailHomework = useMemo(() => {
    if (!detail) return [];
    const subj = primarySubject(detail);
    const sName = (subj?.name || '').trim().toUpperCase();
    return hwMod.items.filter((h) => {
      const isDue = h.dueDate === detail.date || h.date === detail.date;
      if (!isDue) return false;
      if (!subj) return true;
      if (h.subject?.id && subj.id && h.subject.id === subj.id) return true;
      const hName = (h.subject?.name || '').trim().toUpperCase();
      if (hName && sName && (hName === sName || hName.includes(sName) || sName.includes(hName))) return true;
      return false;
    });
  }, [detail, hwMod.items]);

  const daysCount = showWeekend ? 7 : 5;
  const days = useMemo(
    () => Array.from({ length: daysCount }, (_, i) => addDays(weekStart, i)),
    [weekStart, daysCount],
  );

  const selectedDay = days[Math.min(dayIndex, days.length - 1)] ?? days[0]!;
  const selectedDayExams = useMemo(
    () => cleanExams.filter((e) => e.date === selectedDay),
    [cleanExams, selectedDay],
  );
  const dayLessons = useMemo(() => {
    let list = lessonsForDay(lessons, selectedDay);
    if (customization.cancellationStyle === 'hidden') {
      list = list.filter((l) => l.status !== 'CANCELLED');
    }
    const substMode = customization.substDisplayMode ?? 'both';
    if (substMode === 'subst-only') {
      const hasActive = list.some((l) => l.status !== 'CANCELLED');
      if (hasActive) {
        list = list.filter((l) => l.status !== 'CANCELLED');
      }
    } else if (substMode === 'cancelled-only') {
      list = list.filter((l) => l.status === 'CANCELLED');
    }
    return list;
  }, [lessons, selectedDay, customization.cancellationStyle, customization.substDisplayMode]);

  const isCurrentWeek = useMemo(() => {
    return mondayOf(anchor) === mondayOf(todayIso());
  }, [anchor]);

  // Base period definitions from school time grid or lesson start times
  const basePeriods = useMemo(() => {
    const timeGrid = master?.timeGrid;
    const periods: Array<{ name: string; startMin: number; endMin: number }> = [];

    // Collect all slots from timeGrid or derive from lessons
    const sorted: Array<{ name?: string; startMin: number; endMin: number }> = [];
    if (timeGrid && timeGrid.length > 0) {
      sorted.push(...[...timeGrid].sort((a, b) => a.startMin - b.startMin));
    }

    // Ensure any afternoon/evening lessons (e.g. Monday lessons running up to 16:40 / Period 10)
    // that extend beyond or aren't covered by timeGrid are included in sorted slots!
    if (lessons.length > 0) {
      const maxLessonEnd = Math.max(...lessons.map((l) => l.endMin));
      const lastSlotEnd = sorted.length > 0 ? sorted[sorted.length - 1]!.endMin : 0;
      if (maxLessonEnd > lastSlotEnd || sorted.length === 0) {
        const uncovered = lessons.filter(
          (l) => l.endMin > lastSlotEnd && !sorted.some((s) => Math.abs(s.startMin - l.startMin) <= 15),
        );
        const distinctStarts = [...new Set(uncovered.map((l) => l.startMin))].sort((a, b) => a - b);
        for (const start of distinctStarts) {
          const matching = uncovered.filter((l) => l.startMin === start);
          const end = matching.length > 0 ? Math.max(...matching.map((l) => l.endMin)) : start + 50;
          sorted.push({
            name: `${sorted.length + 1}`,
            startMin: start,
            endMin: end,
          });
        }
        sorted.sort((a, b) => a.startMin - b.startMin);
      }
    }

    if (sorted.length > 0) {
      // Determine cutoff: if trimEmptyPeriods is enabled, don't show trailing empty evening periods
      // but ensure active school hours (up to 16:40 or latest lesson end) are NOT cut off prematurely!
      let maxAllowedStart = Infinity;
      if (customization.trimEmptyPeriods !== false && lessons.length > 0) {
        const latestLessonEnd = Math.max(...lessons.map((l) => l.endMin));
        const latestLessonStart = Math.max(...lessons.map((l) => l.startMin));
        // Keep any slot that contains, overlaps, or starts before/at latest lesson
        const activeSlots = sorted.filter(
          (s) => s.startMin <= latestLessonStart || s.startMin < latestLessonEnd || s.endMin <= latestLessonEnd,
        );
        if (activeSlots.length > 0) {
          const lastActive = activeSlots[activeSlots.length - 1]!;
          maxAllowedStart = lastActive.startMin;
        }
      }

      sorted.forEach((slot, idx) => {
        if (slot.startMin > maxAllowedStart) return;
        // Respect explicit slot names from WebUntis (e.g. "0", "1", "2"...)
        const hasName = slot.name !== undefined && slot.name !== null && String(slot.name).trim() !== '';
        // If slot starts before 07:45 or has name "0", it represents period 0
        const name = hasName ? String(slot.name).trim() : (slot.startMin < 465 ? '0' : `${idx + 1}`);
        periods.push({ name, startMin: slot.startMin, endMin: slot.endMin });
      });
    } else {
      // Fallback: derive distinct periods from lessons across the week
      const startTimes = [...new Set(lessons.map((l) => l.startMin))].sort((a, b) => a - b);
      const hasZeroPeriod = startTimes.length > 0 && startTimes[0]! < 465; // Before 07:45 (e.g. 07:00 / 07:15)
      startTimes.forEach((start, idx) => {
        const matching = lessons.filter((l) => l.startMin === start);
        const end = matching.length > 0 ? Math.max(...matching.map((l) => l.endMin)) : start + 50;
        const name = hasZeroPeriod ? String(idx) : String(idx + 1);
        periods.push({ name, startMin: start, endMin: end });
      });
    }
    return periods;
  }, [master?.timeGrid, lessons, customization.trimEmptyPeriods]);

  // Holiday detection for the week and individual days
  const holidays = useMemo(() => master?.holidays ?? [], [master?.holidays]);
  const getDayHoliday = (day: string) => {
    return holidays.find((h) => h.startDate <= day && day <= h.endDate);
  };
  const fullWeekHoliday = useMemo(() => {
    if (days.length === 0 || holidays.length === 0) return null;
    const weekdays = days.slice(0, 5);
    const firstH = getDayHoliday(weekdays[0]!);
    if (!firstH) return null;
    const allMatch = weekdays.every((d) => {
      const h = getDayHoliday(d);
      return h && (h.id === firstH.id || h.name === firstH.name);
    });
    return allMatch ? firstH : null;
  }, [days, holidays]);

  // Build grid slot rows (periods + optional break rows)
  const rows: TimetableRow[] = useMemo(() => {
    if (basePeriods.length === 0) return [];

    const result: TimetableRow[] = [];
    for (let i = 0; i < basePeriods.length; i++) {
      const p = basePeriods[i]!;
      result.push({
        type: 'period',
        key: `period-${p.startMin}-${i}`,
        name: p.name,
        startMin: p.startMin,
        endMin: p.endMin,
      });

      // Insert break row if there is a gap between consecutive periods
      if (showBreaks && i < basePeriods.length - 1) {
        const next = basePeriods[i + 1]!;
        const gap = next.startMin - p.endMin;
        const minGap = customization.breakMinMinutes ?? 5;
        if (gap >= minGap) {
          let label = customization.breakShortLabel?.trim() || t('timetable.break');
          if (gap >= 25) {
            label = customization.breakLunchLabel?.trim() || t('timetable.lunchBreak');
          } else if (gap >= 10) {
            label = customization.breakLongLabel?.trim() || t('timetable.longBreak');
          }
          result.push({
            type: 'break',
            key: `break-${p.endMin}-${next.startMin}-${i}`,
            label,
            startMin: p.endMin,
            endMin: next.startMin,
            duration: gap,
          });
        }
      }
    }

    return result;
  }, [basePeriods, showBreaks, customization.breakMinMinutes, customization.breakShortLabel, customization.breakLongLabel, customization.breakLunchLabel, t]);

  const cellLessons = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const l of lessons) {
      if (customization.cancellationStyle === 'hidden' && l.status === 'CANCELLED') {
        continue;
      }
      let slotStart = l.startMin;
      if (basePeriods.length > 0) {
        // 1. Exact startMin match
        const exact = basePeriods.find((p) => p.startMin === l.startMin);
        if (exact) {
          slotStart = exact.startMin;
        } else {
          // 2. Score candidate periods based on overlap and start proximity
          // (e.g. 07:50 -> Period 1 at 08:00, 08:40 -> Period 2 at 08:50, 09:40 -> Period 3 at 09:55)
          let bestPeriod: PeriodRow | { startMin: number; endMin: number } | null = null;
          let bestScore = -Infinity;

          for (const p of basePeriods) {
            const startDiff = Math.abs(p.startMin - l.startMin);
            const overlap = Math.max(0, Math.min(l.endMin, p.endMin) - Math.max(l.startMin, p.startMin));
            const score = overlap * 2 - startDiff;
            if (score > bestScore) {
              bestScore = score;
              bestPeriod = p;
            }
          }

          if (bestPeriod) {
            const startDiff = Math.abs(bestPeriod.startMin - l.startMin);
            const overlap = Math.max(0, Math.min(l.endMin, bestPeriod.endMin) - Math.max(l.startMin, bestPeriod.startMin));
            if (startDiff <= 30 || overlap >= 15) {
              slotStart = bestPeriod.startMin;
            }
          }
        }
      }
      const key = `${l.date}|${slotStart}`;
      const arr = map.get(key);
      if (arr) arr.push(l);
      else map.set(key, [l]);
    }
    return map;
  }, [lessons, basePeriods, customization.cancellationStyle]);

  // Compute breaks for Day view with running cursor to avoid false breaks on overlapping lessons
  const dayItemsWithBreaks = useMemo(() => {
    if (!showBreaks || dayLessons.length === 0) return dayLessons.map((l) => ({ type: 'lesson' as const, lesson: l }));
    const sorted = [...dayLessons].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const combined: Array<
      | { type: 'lesson'; lesson: Lesson }
      | { type: 'break'; startMin: number; endMin: number; duration: number; label: string }
    > = [];

    const minGap = customization.breakMinMinutes ?? 5;
    let cursor: number | undefined;

    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i]!;
      if (cursor !== undefined && cur.startMin - cursor >= minGap) {
        const gap = cur.startMin - cursor;
        let label = customization.breakShortLabel?.trim() || t('timetable.break');
        if (gap >= 25) label = customization.breakLunchLabel?.trim() || t('timetable.lunchBreak');
        else if (gap >= 10) label = customization.breakLongLabel?.trim() || t('timetable.longBreak');
        combined.push({
          type: 'break',
          startMin: cursor,
          endMin: cur.startMin,
          duration: gap,
          label,
        });
      }
      combined.push({ type: 'lesson', lesson: cur });
      cursor = Math.max(cursor ?? 0, cur.endMin);
    }
    return combined;
  }, [dayLessons, showBreaks, customization.breakMinMinutes, customization.breakShortLabel, customization.breakLongLabel, customization.breakLunchLabel, t]);

  function scrollToDay(index: number) {
    setDayIndex(index);
    if (!weekScrollRef.current) return;
    const colWidth = 140;
    weekScrollRef.current.scrollTo({
      left: Math.max(0, index * colWidth - 20),
      behavior: 'smooth',
    });
  }

  return (
    <div>
      {/* Page Title & Controls Bar */}
      <div className="row wrap" style={{ gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <h1 className="page-title">{t('timetable.title')}</h1>
        <div className="spacer" />

        {/* Prominent Teacher & Class Explorer Button */}
        <button
          type="button"
          className="btn sm primary"
          onClick={() => setTargetExplorerOpen(true)}
          style={{ gap: 6 }}
          title={t('timetable.targetExplorer')}
        >
          <Icon name="search" size={15} />
          <span>{t('timetable.targetExplorer')}</span>
        </button>

        {/* Calendar Export & Sync Button */}
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

        <TargetPicker onChange={setTarget} />
      </div>

      {/* Prominent Active Target Badge Banner */}
      {target && (
        <div
          className="card pad row wrap"
          style={{
            gap: 12,
            marginBottom: 12,
            background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
            borderColor: 'var(--accent)',
            borderRadius: 'var(--radius)',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 24 }}>
            {target.type === ElementType.Teacher
              ? '👨‍🏫'
              : target.type === ElementType.Room
                ? '🏛️'
                : '👥'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              {target.type === ElementType.Teacher
                ? t('timetable.viewingTeacher', { name: target.label || target.id })
                : target.type === ElementType.Room
                  ? t('timetable.viewingRoom', { name: target.label || target.id })
                  : t('timetable.viewingClass', { name: target.label || target.id })}
            </div>
            <div className="tiny muted">{t('timetable.viewingTargetHint')}</div>
          </div>
          <button
            type="button"
            className="btn sm"
            onClick={() => setTarget(null)}
            title={t('timetable.backToMyPlan')}
          >
            <Icon name="close" size={14} />
            <span>{t('timetable.backToMyPlan')}</span>
          </button>
        </div>
      )}

      {/* Calendar Week Banner & Navigator */}
      <div className="kw-banner">
        <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
          <div className="kw-badge">
            <span>{formatCalendarWeek(anchor, i18n.language)}</span>
            {isCurrentWeek && <span className="kw-pill">{t('timetable.currentWeek')}</span>}
          </div>
          <div className="small muted" style={{ fontWeight: 600 }}>
            {formatDay(days[0]!, i18n.language)} – {formatDay(days[days.length - 1]!, i18n.language)}
            {target?.label ? ` · ${target.label}` : ''}
          </div>

          <div className="spacer" />

          {/* Week Navigation Controls */}
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <button
              className="btn ghost icon"
              aria-label={t('timetable.prevWeek')}
              title={t('timetable.prevWeek')}
              onClick={() => setAnchor(addDays(anchor, -7))}
            >
              <Icon name="chevronLeft" size={18} />
            </button>

            <button
              className={isCurrentWeek ? 'btn sm' : 'btn sm primary'}
              onClick={() => {
                setAnchor(todayIso());
                const dow = new Date().getDay();
                setDayIndex(dow === 0 || dow === 6 ? 0 : dow - 1);
              }}
              title={t('timetable.thisWeek')}
            >
              {t('timetable.thisWeek')}
            </button>

            <button
              className="btn ghost icon"
              aria-label={t('timetable.nextWeek')}
              title={t('timetable.nextWeek')}
              onClick={() => setAnchor(addDays(anchor, 7))}
            >
              <Icon name="chevronRight" size={18} />
            </button>

            {/* Direct date picker */}
            <input
              type="date"
              className="date-picker-input"
              value={anchor}
              onChange={(e) => e.target.value && setAnchor(e.target.value)}
              title={t('today.pickDay')}
              aria-label={t('today.pickDay')}
            />
          </div>
        </div>

        {/* View Mode & Quick Layout Toggles */}
        <div className="row wrap" style={{ gap: 10, alignItems: 'center', paddingTop: 4 }}>
          <Segmented
            label={t('timetable.viewAs')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'week', label: t('timetable.week') },
              { value: 'day', label: t('timetable.day') },
            ]}
          />

          <div className="spacer" />

          {mode === 'week' && (
            <div className="row" style={{ gap: 6 }}>
              {/* Toggle Break rows on the fly */}
              <button
                type="button"
                className={`btn sm ${showBreaks ? 'ghost' : ''}`}
                style={showBreaks ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                onClick={() => updateCustomization({ showBreaks: !showBreaks })}
                title={t('customize.showBreaksHint')}
              >
                <span>☕ {t('timetable.break')}</span>
              </button>

              {/* Toggle Week Layout: Scroll vs Fit */}
              <button
                type="button"
                className="btn sm ghost"
                onClick={() =>
                  updateCustomization({
                    weekLayout: weekLayout === 'fit' ? 'scroll' : 'fit',
                  })
                }
                title={t('customize.weekLayoutHint')}
              >
                <span>{weekLayout === 'fit' ? t('timetable.layoutScroll') : t('timetable.layoutFit')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {!effectiveTarget && !loading && <ErrorState message={t('timetable.chooseClass')} />}

      {loading && (
        <div className="col">
          <Skeleton height={240} />
        </div>
      )}

      {error ? <ErrorState message={t('common.error')} onRetry={reload} retryLabel={t('common.retry')} /> : null}

      {!loading && !error && lessons.length === 0 && mode === 'week' && (
        fullWeekHoliday ? (
          <div className="holiday-week-hero">
            <div className="holiday-hero-badge">🍂 {fullWeekHoliday.name}</div>
            <div className="holiday-hero-icon">🌴</div>
            <h2 className="holiday-hero-title">{fullWeekHoliday.name}</h2>
            <p className="holiday-hero-subtitle">
              {formatDay(fullWeekHoliday.startDate, i18n.language)} –{' '}
              {formatDay(fullWeekHoliday.endDate, i18n.language)}
            </p>
            <div className="holiday-hero-hint">
              {t('timetable.enjoyHolidaysMessage')}
            </div>
          </div>
        ) : (
          <EmptyState icon="calendar" title={t('timetable.noEntries')} />
        )
      )}

      {/* Week Timetable View */}
      {!loading && !error && lessons.length > 0 && mode === 'week' && (
        <div>
          {/* Mobile Day Strip for quick navigation */}
          <div className="mobile-day-strip show-on-mobile">
            {days.map((day, i) => {
              const isToday = day === todayIso();
              return (
                <button
                  key={day}
                  type="button"
                  className={`mobile-day-pill ${isToday ? 'active' : ''}`}
                  onClick={() => scrollToDay(i)}
                >
                  {dowShort(day, i18n.language)} {Number(day.slice(-2))}
                </button>
              );
            })}
          </div>

          <div className="week-scroll" ref={weekScrollRef} role="region" aria-label={t('timetable.title')}>
            <div className="week" style={{ ['--days' as string]: days.length }}>
              {/* Top-left empty corner */}
              <div className="head" aria-hidden="true" />

              {/* Day column headers */}
              {days.map((day) => (
                <div key={day} className={day === todayIso() ? 'head today' : 'head'}>
                  <div className="dow">{dowShort(day, i18n.language)}</div>
                  <div className="num">{Number(day.slice(-2))}</div>
                </div>
              ))}

              {/* Period & Break Rows */}
              {rows.map((row) => {
                if (row.type === 'break') {
                  return (
                    <BreakRowView
                      key={row.key}
                      row={row}
                      daysCount={days.length}
                      showDuration={customization.showBreakDuration}
                      style={customization.breakStyle}
                    />
                  );
                }

                return (
                  <PeriodRowView
                    key={row.key}
                    row={row}
                    days={days}
                    map={cellLessons}
                    onPick={setDetail}
                    showFreePeriods={showFreePeriods}
                    showPeriodNumber={showPeriodNumber}
                    showPeriodTimes={showPeriodTimes}
                    showRoomInWeek={showRoomInWeek}
                    showTeacherInWeek={showTeacherInWeek}
                    exams={cleanExams}
                    homework={hwMod.items}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Day Timetable View */}
      {!loading && !error && mode === 'day' && (
        <div>
          <div className="tabs" style={{ marginBottom: 14 }}>
            {days.map((day, i) => {
              const dayHoliday = getDayHoliday(day);
              const dayHasExams = cleanExams.some((e) => e.date === day);
              return (
                <button
                  key={day}
                  className="btn sm"
                  onClick={() => setDayIndex(i)}
                  style={{
                    flex: '1 1 0',
                    minWidth: 0,
                    padding: '6px 2px',
                    ...(i === dayIndex
                      ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--accent-ink)' }
                      : {}),
                  }}
                >
                  {dowShort(day, i18n.language)} {Number(day.slice(-2))}
                  {dayHoliday && (
                    <span title={dayHoliday.name} style={{ marginLeft: 3, fontSize: '0.8rem' }}>
                      🍂
                    </span>
                  )}
                  {dayHasExams && (
                    <span
                      title={t('today.examsOnDay')}
                      style={{
                        marginLeft: 3,
                        fontSize: '0.75rem',
                        color: i === dayIndex ? 'inherit' : '#ef4444',
                        fontWeight: 900,
                      }}
                    >
                      ●
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <h2 className="section" style={{ marginTop: 0 }}>
            {formatDay(selectedDay, i18n.language)}
          </h2>

          <DayExamBanner
            exams={selectedDayExams}
            selectedDay={selectedDay}
            dayLessons={dayLessons}
            onSelectLesson={setDetail}
          />

          {(() => {
            const selectedHoliday = getDayHoliday(selectedDay);
            return (
              <>
                {selectedHoliday && (
                  <div
                    className="holiday-week-hero"
                    style={{ padding: '24px 18px', margin: '12px 0 16px' }}
                  >
                    <div className="holiday-hero-badge">🍂 {selectedHoliday.name}</div>
                    <div className="holiday-hero-icon" style={{ fontSize: '2.4rem' }}>🌴</div>
                    <h3 className="holiday-hero-title" style={{ fontSize: '1.25rem', margin: '4px 0' }}>
                      {selectedHoliday.name}
                    </h3>
                    <p className="holiday-hero-subtitle" style={{ fontSize: '0.85rem' }}>
                      {t('timetable.schoolFreeDay')} · {formatDay(selectedDay, i18n.language)}
                    </p>
                    {dayLessons.length === 0 && (
                      <div className="holiday-hero-hint" style={{ marginTop: 8 }}>
                        {t('timetable.enjoyHolidaysMessage')}
                      </div>
                    )}
                  </div>
                )}

                {dayLessons.length === 0 && !selectedHoliday && (
                  <EmptyState icon="check" title={t('today.noLessons')} />
                )}
              </>
            );
          })()}

          {dayLessons.length > 0 && (
            <div className="day-list">
              {dayItemsWithBreaks.map((item, idx) => {
                if (item.type === 'break') {
                  return (
                    <div
                      key={`day-break-${idx}`}
                      className={`break-card-day break-style-${customization.breakStyle ?? 'bar'}`}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{item.duration >= 25 ? '🍽️' : item.duration >= 10 ? '☕' : '⏸️'}</span>
                        <span>{item.label}</span>
                      </span>
                      {customization.showBreakDuration && (
                        <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>
                          {minutesToTime(item.startMin)} – {minutesToTime(item.endMin)} ({item.duration} Min.)
                        </span>
                      )}
                    </div>
                  );
                }

                const matching = cleanExams.filter((e) => isExamForLesson(item.lesson, e));
                return (
                  <LessonCard
                    key={item.lesson.id}
                    lesson={matching.length > 0 ? { ...item.lesson, isExam: true } : item.lesson}
                    linkedExams={matching}
                    role={role}
                    onClick={setDetail}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={t('timetable.title')}>
        {detail && (
          <LessonDetail
            lesson={detail}
            role={role}
            linkedExams={detailExams}
            linkedHomework={detailHomework}
            onClose={() => setDetail(null)}
          />
        )}
      </Dialog>

      {/* Target Explorer Modal */}
      <TargetModal
        open={targetExplorerOpen}
        onClose={() => setTargetExplorerOpen(false)}
        currentTarget={target}
        onSelectTarget={setTarget}
      />

      {/* Calendar Export Hub Modal */}
      <CalendarExportModal
        open={calModalOpen}
        onClose={() => setCalModalOpen(false)}
        initialScope="all"
      />
    </div>
  );
}

function BreakRowView({
  row,
  daysCount,
  showDuration = true,
  style = 'bar',
}: {
  row: BreakRow;
  daysCount: number;
  showDuration?: boolean;
  style?: 'bar' | 'minimal' | 'card';
}) {
  const icon = row.duration >= 25 ? '🍽️' : row.duration >= 10 ? '☕' : '⏸️';
  return (
    <div className="slotrow" style={{ display: 'contents' }}>
      <div className="slot-label" style={{ opacity: 0.7 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
      </div>
      <div className={`break-row break-style-${style}`} style={{ gridColumn: `2 / span ${daysCount}` }}>
        <div className="tag">
          <span>{icon}</span>
          <span>{row.label}</span>
        </div>
        {showDuration && (
          <div style={{ fontVariantNumeric: 'tabular-nums' }}>
            {minutesToTime(row.startMin)} – {minutesToTime(row.endMin)} ({row.duration} Min.)
          </div>
        )}
      </div>
    </div>
  );
}

function PeriodRowView({
  row,
  days,
  map,
  onPick,
  showFreePeriods,
  showPeriodNumber,
  showPeriodTimes,
  showRoomInWeek,
  showTeacherInWeek,
  exams = [],
  homework = [],
}: {
  row: PeriodRow;
  days: string[];
  map: Map<string, Lesson[]>;
  onPick: (l: Lesson) => void;
  showFreePeriods?: boolean;
  showPeriodNumber?: boolean;
  showPeriodTimes?: boolean;
  showRoomInWeek?: boolean;
  showTeacherInWeek?: boolean;
  exams?: Exam[];
  homework?: Homework[];
}) {
  const { t, i18n } = useTranslation();
  const customization = useCustomization();

  return (
    <div className="slotrow" style={{ display: 'contents' }}>
      <div className="slot-label">
        {showPeriodNumber && <div className="period-idx">{row.name}.</div>}
        {showPeriodTimes && (
          <div className="period-time">
            <span>{minutesToTime(row.startMin)}</span>
            {customization.periodTimeFormat !== 'start-only' && (
              <span className="period-time-end">– {minutesToTime(row.endMin)}</span>
            )}
          </div>
        )}
      </div>

      {days.map((day) => {
        const rawList = map.get(`${day}|${row.startMin}`) ?? [];

        let filtered = [...rawList];
        const substMode = customization.substDisplayMode ?? 'both';
        if (substMode === 'subst-only') {
          const hasActive = filtered.some((l) => l.status !== 'CANCELLED');
          if (hasActive) {
            filtered = filtered.filter((l) => l.status !== 'CANCELLED');
          }
        } else if (substMode === 'cancelled-only') {
          filtered = filtered.filter((l) => l.status === 'CANCELLED');
        }

        // Sort multiple lessons: subst-first (Vertretung links, Entfall rechts) vs cancelled-first
        const list = filtered.sort((a, b) => {
          const aCanc = a.status === 'CANCELLED';
          const bCanc = b.status === 'CANCELLED';
          if (aCanc !== bCanc) {
            if (customization.splitSubstOrder === 'cancelled-first') {
              return aCanc ? -1 : 1;
            }
            // 'subst-first' default: active/subst left (first), cancelled right (second)
            return aCanc ? 1 : -1;
          }
          return 0;
        });

        const renderLesson = (l: Lesson, isSplit: boolean) => {
          const subj = primarySubject(l);
          const color = subjectColor(subj?.id, subj?.name);
          const textColor = subjectTextColor(color);
          const isCancelled = l.status === 'CANCELLED';
          const isIrregular = l.status === 'IRREGULAR' || Boolean(l.substText && !isCancelled);
          const hasInfo = Boolean(l.info || l.substText);
          const hasExam = l.status === 'EXAM' || l.isExam || exams.some((e) => isExamForLesson(l, e));
          const sName = (subj?.name || '').trim().toUpperCase();
          const hasHw = homework.some((h) => {
            const isDue = h.dueDate === l.date || h.date === l.date;
            if (!isDue) return false;
            if (h.subject?.id && subj?.id && h.subject.id === subj.id) return true;
            const hName = (h.subject?.name || '').trim().toUpperCase();
            if (hName && sName && (hName === sName || hName.includes(sName) || sName.includes(hName))) return true;
            return false;
          });
          const examHighlightClass = hasExam
            ? `has-exam exam-${customization.examHighlight ?? 'pulse-glow'}`
            : '';

          return (
            <button
              key={l.id}
              className={`tlesson ${isCancelled ? `cancelled subst-${customization.cancellationStyle ?? 'strikethrough'}` : ''} ${isIrregular ? `irregular subst-${customization.substitutionStyle ?? 'highlight'}` : ''} ${examHighlightClass} ${isSplit ? 'split-card' : ''}`.trim()}
              style={{ background: color, color: textColor }}
              onClick={() => onPick(l)}
              title={`${formatTime(l.startMin)}–${formatTime(l.endMin)} · ${subjectLabel(l)}`}
              aria-label={`${dowShort(day, i18n.language)}, ${formatTime(l.startMin)}–${formatTime(l.endMin)}: ${subjectLabel(l)}${isCancelled ? ` (${t('today.cancelled')})` : ''}`}
              type="button"
            >
              <div className="tlesson-top">
                <span className="s">{subjectLabel(l)}</span>
                {customization.showLessonBadges !== false && (
                  <div className="tlesson-icons">
                    {hasExam && (
                      <span className="ticon exam" title={t('today.exam')}>
                        {customization.iconExam || '🎓'}
                      </span>
                    )}
                    {hasHw && (
                      <span className="ticon hw" title={t('homework.title')}>
                        {customization.iconHomework || '📝'}
                      </span>
                    )}
                    {hasInfo && (
                      <span className="ticon info" title={l.info || l.substText || 'Info'}>
                        {customization.iconInfo || 'ℹ️'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {isCancelled && (
                <span className="tlesson-badge danger">⚠️ {t('today.cancelled')}</span>
              )}
              {isIrregular && (
                <span className="tlesson-badge warn">
                  {customization.substitutionStyle === 'replaced' && l.substText && /durch|statt|->|→/i.test(l.substText) ? (
                    <span>
                      <del className="diff-orig">{l.substText.split(/durch|statt|->|→/i)[0]?.trim()}</del>
                      <span>➔</span>
                      <ins className="new-subst">{l.substText.split(/durch|statt|->|→/i)[1]?.trim()}</ins>
                    </span>
                  ) : (
                    <span>🔄 {l.substText || t('today.irregular')}</span>
                  )}
                </span>
              )}

              <div className="tlesson-bottom">
                {showRoomInWeek && l.rooms.length > 0 && (
                  <span className="r">🏛️ {l.rooms.map((r) => r.name).join(', ')}</span>
                )}
                {showTeacherInWeek && l.teachers.length > 0 && (
                  <span className="t">
                    {customization.substitutionStyle === 'replaced' && isIrregular && l.substText ? (
                      <span>
                        <del style={{ opacity: 0.7 }}>{l.teachers.map((t) => t.name).join(', ')}</del>
                        {' ➔ '}
                        <span style={{ fontWeight: 800 }}>
                          {l.substText.replace(/^(Vertretung|Statt)\s*(durch)?\s*/i, '')}
                        </span>
                      </span>
                    ) : (
                      `👤 ${l.teachers.map((t) => t.name).join(', ')}`
                    )}
                  </span>
                )}
              </div>
            </button>
          );
        };

        return (
          <div className="cell" key={day}>
            {list.length === 0 && showFreePeriods && (
              <div
                style={{
                  height: '100%',
                  minHeight: 38,
                  borderRadius: 6,
                  border: '1px dashed var(--border)',
                  opacity: 0.35,
                }}
              />
            )}
            {list.length === 1 && renderLesson(list[0]!, false)}
            {list.length > 1 && (
              <div className={`slot-split-pair layout-${customization.parallelLessonLayout ?? 'side-by-side'}`}>
                {list.map((l) => renderLesson(l, true))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
