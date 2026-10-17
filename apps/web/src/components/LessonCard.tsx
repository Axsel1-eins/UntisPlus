import { useTranslation } from 'react-i18next';
import { getExamTypeBadge, minutesToTime, type Exam, type Lesson } from '@untisplus/shared';
import type { Role } from '../store.js';
import { Icon } from './primitives.js';
import { names, primarySubject, subjectColor, subjectLabel } from '../lib.js';
import { useCustomization } from '../customization.js';

interface Props {
  lesson: Lesson;
  role: Role;
  onClick?: (lesson: Lesson) => void;
  compact?: boolean;
  linkedExams?: Exam[];
}

/** A single lesson row — the core building block of Today, Timetable and Substitutions. */
export function LessonCard({ lesson, role, onClick, compact, linkedExams }: Props) {
  const { t } = useTranslation();
  const customization = useCustomization();
  const cancelled = lesson.status === 'CANCELLED';
  const irregular = lesson.status === 'IRREGULAR' || Boolean(lesson.substText && !cancelled);
  const isExam = lesson.status === 'EXAM' || Boolean(lesson.isExam) || Boolean(linkedExams && linkedExams.length > 0);

  if (cancelled && customization.cancellationStyle === 'hidden') {
    return null;
  }
  const cls = [
    'lesson',
    cancelled ? 'cancelled' : '',
    irregular ? 'irregular' : '',
    isExam ? 'exam' : '',
    onClick ? 'clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const tag = primarySubject(lesson);
  const style = { ['--subj' as string]: subjectColor(tag?.id, tag?.name) };

  const content = (
    <>
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
          {role === 'teacher' && lesson.teachers.length > 0 && !compact && (
            <span className="nowrap">
              <Icon name="user" size={13} /> {names(lesson.teachers)}
            </span>
          )}
        </div>
        {lesson.substText && (
          <div className={`subst-highlight-box ${cancelled ? 'danger' : 'warn'}`}>
            <Icon name={cancelled ? 'alert' : 'refresh'} size={13} />
            {customization.substitutionStyle === 'replaced' && /durch|statt|->|→/i.test(lesson.substText) ? (
              <span>
                <del className="diff-orig">{lesson.substText.split(/durch|statt|->|→/i)[0]?.trim()}</del>
                <span> ➔ </span>
                <ins className="new-subst">{lesson.substText.split(/durch|statt|->|→/i)[1]?.trim()}</ins>
              </span>
            ) : (
              <span>{lesson.substText}</span>
            )}
          </div>
        )}
        {!compact && lesson.info && (
          <div className="small muted nowrap" title={lesson.info}>
            {lesson.info}
          </div>
        )}
        {!compact && linkedExams && linkedExams[0]?.text && (!lesson.info || !lesson.info.includes(linkedExams[0].text)) && (
          <div className="small muted nowrap" style={{ color: 'var(--accent)', fontWeight: 600 }} title={linkedExams[0].text}>
            📝 {linkedExams[0].text}
          </div>
        )}
      </div>
      <div className="side">
        {cancelled && (
          <span className="badge cancelled" style={{ fontWeight: 800 }}>
            ⚠️ {t('today.cancelled')}
          </span>
        )}
        {irregular && (
          <span className="badge irregular" style={{ fontWeight: 800 }}>
            🔄 {t('today.irregular')}
          </span>
        )}
        {isExam && (() => {
          const badge = linkedExams?.[0] ? getExamTypeBadge(linkedExams[0].type) : null;
          return (
            <span
              className="badge exam"
              style={{
                fontWeight: 800,
                ...(badge
                  ? {
                      color: badge.color,
                      background: `color-mix(in srgb, ${badge.color} 15%, var(--surface))`,
                      border: `1px solid color-mix(in srgb, ${badge.color} 35%, transparent)`,
                    }
                  : {}),
              }}
            >
              {badge ? `${badge.icon} ${badge.label}` : `🎓 ${t('today.exam')}`}
            </span>
          );
        })()}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button className={cls} style={style} onClick={() => onClick(lesson)} type="button">
        {content}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      {content}
    </div>
  );
}
