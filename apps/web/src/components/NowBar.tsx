import { useTranslation } from 'react-i18next';
import { minutesToTime, type Lesson } from '@untisplus/shared';
import { currentLesson, names, nextAnyLesson, subjectLabel } from '../lib.js';
import { Icon } from './primitives.js';

interface Props {
  lessons: Lesson[];
  now: Date;
}

/**
 * The persistent "what's happening now / next" strip. For teachers this is the key feature:
 * it always shows the current period and the next room, so moving between rooms needs no
 * navigation.
 */
export function NowBar({ lessons, now }: Props) {
  const { t } = useTranslation();
  const current = currentLesson(lessons, now);
  const next = current ? undefined : nextAnyLesson(lessons, now);
  const lesson = current ?? next;

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
  return (
    <div className="nowbar">
      <div className="col" style={{ gap: 0, alignItems: 'center' }}>
        <span className="clock">{clock}</span>
        <span className="tiny" style={{ opacity: 0.85 }}>
          {isCurrent ? t('today.now') : minutesToTime(lesson.startMin)}
        </span>
      </div>
      <div className="what" style={{ flex: 1 }}>
        <div className="t">
          {subjectLabel(lesson)}
          {lesson.rooms.length > 0 && ` · ${names(lesson.rooms)}`}
        </div>
        <div className="s">
          {lesson.klassen.length > 0 && `${names(lesson.klassen)} · `}
          {minutesToTime(lesson.startMin)}–{minutesToTime(lesson.endMin)}
        </div>
      </div>
    </div>
  );
}
