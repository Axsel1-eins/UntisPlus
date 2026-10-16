import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, minutesToTime, type Lesson } from '@untisplus/shared';
import { useApp } from '../store.js';
import { useEffectiveTarget, useWeekLessons } from '../data.js';
import { applySubstitutionTransforms, useModsVersion } from '../mods.js';
import {
  dowShort,
  formatDay,
  names,
  primarySubject,
  subjectColor,
  subjectLabel,
  toSubstitutions,
  todayIso,
} from '../lib.js';
import { LessonDetail } from '../components/LessonDetail.js';
import { TargetPicker } from '../components/TargetPicker.js';
import { Dialog, EmptyState, ErrorState, Icon, Segmented, Skeleton } from '../components/primitives.js';

export function SubstitutionsView() {
  const { t, i18n } = useTranslation();
  const { role, setTarget } = useApp();
  const [anchor, setAnchor] = useState<string>(todayIso());
  const [viewMode, setViewMode] = useState<'week' | 'day'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      return 'day';
    }
    return 'week';
  });
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    const dow = new Date().getDay();
    return dow === 0 || dow === 6 ? 0 : dow - 1;
  });
  const [detail, setDetail] = useState<Lesson | null>(null);

  const { lessons, loading, error, reload, weekStart, target } = useWeekLessons(anchor);
  const effectiveTarget = useEffectiveTarget();

  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const selectedDay = days[Math.min(selectedDayIndex, days.length - 1)] ?? days[0]!;

  const modsVersion = useModsVersion();
  const items = useMemo(
    () => applySubstitutionTransforms(toSubstitutions(lessons)),
    [lessons, modsVersion],
  );

  const cancelledCount = items.filter((i) => i.lesson.status === 'CANCELLED').length;
  const substCount = items.filter(
    (i) => i.lesson.status === 'IRREGULAR' || (i.lesson.substText && i.lesson.status !== 'CANCELLED'),
  ).length;

  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const arr = map.get(item.lesson.date);
      if (arr) arr.push(item);
      else map.set(item.lesson.date, [item]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const dayItems = useMemo(() => {
    return items.filter((i) => i.lesson.date === selectedDay);
  }, [items, selectedDay]);

  return (
    <div>
      {/* Title & Controls Bar */}
      <div className="row wrap" style={{ gap: 12, marginBottom: 14 }}>
        <h1 className="page-title">{t('subs.title')}</h1>
        <div className="spacer" />
        <TargetPicker onChange={setTarget} />
      </div>

      {/* Week Navigator & View Mode Toggle */}
      <div
        className="card pad col"
        style={{ gap: 10, marginBottom: 16, background: 'var(--surface-2)' }}
      >
        <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <button
              className="btn ghost icon sm"
              aria-label={t('timetable.prevWeek')}
              onClick={() => setAnchor(addDays(anchor, -7))}
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <button
              className="btn sm"
              onClick={() => {
                setAnchor(todayIso());
                const dow = new Date().getDay();
                setSelectedDayIndex(dow === 0 || dow === 6 ? 0 : dow - 1);
              }}
            >
              {t('timetable.thisWeek')}
            </button>
            <button
              className="btn ghost icon sm"
              aria-label={t('timetable.nextWeek')}
              onClick={() => setAnchor(addDays(anchor, 7))}
            >
              <Icon name="chevronRight" size={16} />
            </button>
            <input
              type="date"
              className="date-picker-input"
              value={anchor}
              onChange={(e) => e.target.value && setAnchor(e.target.value)}
              aria-label="Datum wählen"
            />
          </div>

          <div className="small muted" style={{ fontWeight: 600 }}>
            {formatDay(days[0]!, i18n.language)} – {formatDay(days[days.length - 1]!, i18n.language)}
            {target?.label ? ` · ${target.label}` : ''}
          </div>

          <div className="spacer" />

          {/* Mode Switcher: Woche vs Tag */}
          <Segmented
            label="Ansicht"
            value={viewMode}
            onChange={(v) => setViewMode(v as 'week' | 'day')}
            options={[
              { value: 'week', label: t('timetable.week') },
              { value: 'day', label: t('timetable.day') },
            ]}
          />
        </div>

        {/* Weekly Stats Summary Bar */}
        <div className="row wrap" style={{ gap: 8, paddingTop: 4 }}>
          <span className="badge small danger" style={{ fontWeight: 700 }}>
            ⚠️ {cancelledCount} Entfall / Entfälle
          </span>
          <span className="badge small warn" style={{ fontWeight: 700 }}>
            🔄 {substCount} Vertretung(en) / Verlegung(en)
          </span>
          <span className="badge small ok" style={{ fontWeight: 700 }}>
            📚 {items.length} Änderungen gesamt
          </span>
        </div>
      </div>

      {!effectiveTarget && !loading && <ErrorState message={t('timetable.chooseClass')} />}
      {loading && (
        <div className="col">
          <Skeleton height={72} />
          <Skeleton height={72} />
        </div>
      )}
      {error ? <ErrorState message={t('common.error')} onRetry={reload} retryLabel={t('common.retry')} /> : null}

      {/* Week View: All grouped days */}
      {!loading && !error && viewMode === 'week' && (
        <>
          {items.length === 0 ? (
            <EmptyState icon="check" title={t('subs.none')} />
          ) : (
            grouped.map(([date, list]) => (
              <div className="section" key={date}>
                <h2>
                  {dowShort(date, i18n.language)} · {formatDay(date, i18n.language)}
                  {date === todayIso() ? ` · ${t('common.today')}` : ''}
                  <span className="badge small" style={{ marginLeft: 8 }}>
                    {list.length}
                  </span>
                </h2>
                <div className="day-list">
                  {list.map(({ lesson, kind }, idx) => (
                    <SubCard
                      key={`${lesson.id}-${idx}`}
                      lesson={lesson}
                      kind={kind}
                      role={role}
                      onClick={setDetail}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* Day View: Specific day tabs and listing */}
      {!loading && !error && viewMode === 'day' && (
        <div className="col" style={{ gap: 14 }}>
          <div className="tabs">
            {days.map((day, i) => {
              const daySubs = items.filter((it) => it.lesson.date === day);
              const isActive = i === selectedDayIndex;
              return (
                <button
                  key={day}
                  type="button"
                  className="btn sm"
                  onClick={() => setSelectedDayIndex(i)}
                  style={{
                    flex: '1 1 0',
                    minWidth: 0,
                    padding: '6px 2px',
                    ...(isActive
                      ? {
                          background: 'var(--accent)',
                          borderColor: 'var(--accent)',
                          color: 'var(--accent-ink)',
                        }
                      : {}),
                  }}
                >
                  <span>
                    {dowShort(day, i18n.language)} {Number(day.slice(-2))}
                  </span>
                  {daySubs.length > 0 && (
                    <span
                      className={`badge small ${isActive ? 'ok' : 'warn'}`}
                      style={{ marginLeft: 4, padding: '1px 5px', fontSize: 10 }}
                    >
                      {daySubs.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <h2 className="section" style={{ marginTop: 0 }}>
            {formatDay(selectedDay, i18n.language)}
            {selectedDay === todayIso() ? ` · ${t('common.today')}` : ''}
          </h2>

          {dayItems.length === 0 ? (
            <EmptyState icon="check" title={`Keine Vertretungen am ${dowShort(selectedDay, i18n.language)} 🎉`} />
          ) : (
            <div className="day-list">
              {dayItems.map(({ lesson, kind }, idx) => (
                <SubCard
                  key={`${lesson.id}-${idx}`}
                  lesson={lesson}
                  kind={kind}
                  role={role}
                  onClick={setDetail}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={t('subs.title')}>
        {detail && <LessonDetail lesson={detail} role={role} />}
      </Dialog>
    </div>
  );
}

function SubCard({
  lesson,
  kind,
  role,
  onClick,
}: {
  lesson: Lesson;
  kind: string;
  role: 'student' | 'teacher';
  onClick: (l: Lesson) => void;
}) {
  const { t } = useTranslation();
  const subj = primarySubject(lesson);
  const color = subjectColor(subj?.id, subj?.name);
  const isCancelled = lesson.status === 'CANCELLED';
  const note = lesson.substText || lesson.info || lesson.substitution?.text;

  return (
    <button
      className={`lesson clickable ${isCancelled ? 'cancelled' : 'irregular'}`}
      style={{ ['--subj' as string]: color }}
      onClick={() => onClick(lesson)}
      type="button"
    >
      <div className="time">
        <span className="start">{minutesToTime(lesson.startMin)}</span>
        <span className="end">{minutesToTime(lesson.endMin)}</span>
      </div>
      <div className="body">
        <div className="subject nowrap">{subjectLabel(lesson)}</div>
        <div className="meta">
          {role === 'teacher' ? (
            lesson.klassen.length > 0 && (
              <span>
                <Icon name="user" size={13} /> {names(lesson.klassen)}
              </span>
            )
          ) : (
            lesson.teachers.length > 0 && (
              <span>
                <Icon name="user" size={13} /> {names(lesson.teachers)}
              </span>
            )
          )}
          {lesson.rooms.length > 0 && (
            <span>
              <Icon name="mapPin" size={13} /> {names(lesson.rooms)}
            </span>
          )}
        </div>
        {note && (
          <div className={`subst-highlight-box ${isCancelled ? 'danger' : 'warn'}`}>
            <Icon name={isCancelled ? 'alert' : 'refresh'} size={13} />
            <span>{note}</span>
          </div>
        )}
      </div>
      <div className="side">
        <span className={`badge ${isCancelled ? 'cancelled' : 'irregular'}`} style={{ fontWeight: 800 }}>
          {isCancelled ? `⚠️ ${t('today.cancelled')}` : `🔄 ${kind || t('today.irregular')}`}
        </span>
      </div>
    </button>
  );
}
