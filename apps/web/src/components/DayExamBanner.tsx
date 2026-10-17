import { useTranslation } from 'react-i18next';
import {
  getExamTypeBadge,
  isExamForLesson,
  minutesToTime,
  type Exam,
  type Lesson,
} from '@untisplus/shared';
import { names, subjectColor, subjectTextColor, todayIso } from '../lib.js';
import { Icon } from './primitives.js';
import { navigate } from '../router.js';

interface DayExamBannerProps {
  exams: Exam[];
  selectedDay: string;
  dayLessons?: Lesson[];
  onSelectLesson?: (lesson: Lesson) => void;
}

/**
 * Prominent banner displayed in day views (Today & Timetable day mode)
 * highlighting all exams and tests taking place on that date.
 */
export function DayExamBanner({
  exams,
  selectedDay,
  dayLessons = [],
  onSelectLesson,
}: DayExamBannerProps) {
  const { t } = useTranslation();
  if (!exams || exams.length === 0) return null;

  const isToday = selectedDay === todayIso();
  const alertTitle = isToday
    ? t('today.examsAlertToday', { count: exams.length })
    : t('today.examsAlert', { count: exams.length });

  return (
    <div
      className="day-exam-banner card pad col"
      style={{
        gap: 12,
        marginBottom: 14,
        background: 'color-mix(in srgb, #f59e0b 9%, var(--surface))',
        border: '1px solid color-mix(in srgb, #f59e0b 45%, var(--border))',
        borderRadius: 'var(--radius)',
      }}
    >
      <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>🎓</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--text)' }}>
              {alertTitle}
            </div>
            <div className="small muted">
              {t('exams.title')}
            </div>
          </div>
        </div>

        <div className="spacer" />

        <button
          type="button"
          className="btn sm ghost"
          onClick={() => navigate('exams')}
          style={{ gap: 6 }}
          title={t('today.viewExams')}
        >
          <span>{t('today.viewExams')}</span>
          <Icon name="chevronRight" size={14} />
        </button>
      </div>

      <div className="day-exam-list col" style={{ gap: 8 }}>
        {exams.map((ex, idx) => {
          const typeBadge = getExamTypeBadge(ex.type);
          const color = subjectColor(ex.subject?.id, ex.subject?.name);
          const textColor = subjectTextColor(color);
          const matchedLesson = dayLessons.find((l) => isExamForLesson(l, ex));
          const examKey = ex.id ? `day-exam-${ex.id}-${idx}` : `day-exam-${ex.date}-${ex.startMin}-${idx}`;

          const content = (
            <>
              {/* Type Badge */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontWeight: 800,
                  background: `color-mix(in srgb, ${typeBadge.color} 16%, var(--surface))`,
                  color: typeBadge.color,
                  border: `1px solid color-mix(in srgb, ${typeBadge.color} 40%, transparent)`,
                  flexShrink: 0,
                }}
              >
                <span>{typeBadge.icon}</span>
                <span>{typeBadge.label}</span>
              </span>

              {/* Subject pill */}
              <span
                style={{
                  background: color,
                  color: textColor,
                  fontWeight: 800,
                  fontSize: 13,
                  padding: '2px 8px',
                  borderRadius: 6,
                  flexShrink: 0,
                }}
              >
                {ex.subject?.name ?? '—'}
              </span>

              {/* Time */}
              <span
                className="small"
                style={{
                  fontWeight: 750,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--text)',
                  whiteSpace: 'nowrap',
                }}
              >
                ⏱️ {minutesToTime(ex.startMin)} – {minutesToTime(ex.endMin)}
              </span>

              {/* Subject longName / info text */}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {ex.text ? (
                  <span style={{ fontWeight: 600 }}>{ex.text}</span>
                ) : ex.subject?.longName && ex.subject.longName !== ex.subject.name ? (
                  <span className="muted">{ex.subject.longName}</span>
                ) : null}
              </div>

              {/* Teacher & Room metadata */}
              <div className="row wrap" style={{ gap: 8, fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>
                {(ex.rooms ?? []).length > 0 && (
                  <span>
                    <Icon name="mapPin" size={12} /> {names(ex.rooms ?? [])}
                  </span>
                )}
                {(ex.teachers ?? []).length > 0 && (
                  <span>
                    <Icon name="user" size={12} /> {names(ex.teachers ?? [])}
                  </span>
                )}
              </div>

              {/* Unmatched indicator or Click prompt */}
              {!matchedLesson && (
                <span className="tiny muted" style={{ fontStyle: 'italic', flexShrink: 0 }}>
                  ({t('today.unmatchedExam')})
                </span>
              )}
            </>
          );

          if (matchedLesson && onSelectLesson) {
            return (
              <button
                key={examKey}
                type="button"
                className="day-exam-item clickable"
                onClick={() => onSelectLesson({ ...matchedLesson, isExam: true })}
                title={t('timetable.title')}
              >
                {content}
              </button>
            );
          }

          return (
            <button
              key={examKey}
              type="button"
              className="day-exam-item clickable"
              onClick={() => navigate('exams')}
              title={t('nav.exams')}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
