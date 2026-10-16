import { useTranslation } from 'react-i18next';
import { minutesToTime, type Lesson } from '@untisplus/shared';
import { currentLesson, names, nextAnyLesson, subjectLabel } from '../lib.js';
import { Icon } from './primitives.js';

interface Props {
  lessons: Lesson[];
  now: Date;
}

/**
 * The persistent "what's happening now / next" strip. For teachers and students this is the key feature:
 * it always shows the current period, remaining minutes countdown, and the next upcoming room/lesson.
 */
export function NowBar({ lessons, now }: Props) {
  const { t } = useTranslation();
  const current = currentLesson(lessons, now);
  const next = current ? undefined : nextAnyLesson(lessons, now);
  const lesson = current ?? next;

  const currentMin = now.getHours() * 60 + now.getMinutes();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (!lesson) {
    return (
      <div className="nowbar" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
        <Icon name="clock" size={22} />
        <div className="what">
          <div className="t">{t('today.now')} · {clock}</div>
          <div className="s muted">{t('today.noLessons')}</div>
        </div>
      </div>
    );
  }

  const isCurrent = Boolean(current);
  const minsLeft = isCurrent ? lesson.endMin - currentMin : lesson.startMin - currentMin;

  // If in a current lesson, find next upcoming lesson
  const nextUpcoming = isCurrent
    ? lessons
        .filter((l) => l.date === lesson.date && l.startMin >= lesson.endMin && l.id !== lesson.id)
        .sort((a, b) => a.startMin - b.startMin)[0]
    : undefined;

  return (
    <div className="nowbar">
      <div className="col" style={{ gap: 0, alignItems: 'center' }}>
        <span className="clock">{clock}</span>
        <span className="tiny" style={{ opacity: 0.85 }}>
          {isCurrent ? t('today.now') : minutesToTime(lesson.startMin)}
        </span>
      </div>
      <div className="what" style={{ flex: 1 }}>
        <div className="t" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>
            {subjectLabel(lesson)}
            {lesson.rooms.length > 0 && ` · ${names(lesson.rooms)}`}
          </span>
          {minsLeft > 0 && (
            <span
              className={`badge small ${isCurrent ? 'ok' : 'subst'}`}
              style={{ fontSize: 11, padding: '1px 6px', fontWeight: 700 }}
            >
              {isCurrent ? `noch ${minsLeft} Min.` : `in ${minsLeft} Min.`}
            </span>
          )}
        </div>
        <div className="s">
          {lesson.klassen.length > 0 && `${names(lesson.klassen)} · `}
          {minutesToTime(lesson.startMin)}–{minutesToTime(lesson.endMin)}
          {nextUpcoming && (
            <span style={{ marginLeft: 6, opacity: 0.85 }}>
              · {t('today.next') || 'Danach'}: {subjectLabel(nextUpcoming)}
              {nextUpcoming.rooms.length > 0 && ` (${names(nextUpcoming.rooms)})`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
