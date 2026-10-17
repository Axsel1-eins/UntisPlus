import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ElementType,
  getExamTypeBadge,
  minutesToTime,
  type Exam,
  type Homework,
  type Lesson,
} from '@untisplus/shared';
import { useApp, type Role } from '../store.js';
import {
  formatDay,
  formatTime,
  primarySubject,
  subjectColor,
  subjectLabel,
  todayIso,
} from '../lib.js';
import { useLocalSet } from '../hooks.js';
import { Icon } from './primitives.js';

interface LessonDetailProps {
  lesson: Lesson;
  role: Role;
  linkedExams?: Exam[];
  linkedHomework?: Homework[];
  onClose?: () => void;
}

/** Detailed, interactive view of a single lesson with rich metadata and 1-click jumps. */
export function LessonDetail({
  lesson,
  role,
  linkedExams = [],
  linkedHomework = [],
  onClose,
}: LessonDetailProps) {
  const { t, i18n } = useTranslation();
  const { setTarget } = useApp();
  const doneHw = useLocalSet('up.hw.done');

  const cancelled = lesson.status === 'CANCELLED';
  const irregular = lesson.status === 'IRREGULAR' || Boolean(lesson.substText && !cancelled);
  const isExam = lesson.status === 'EXAM' || linkedExams.length > 0;

  const subj = primarySubject(lesson);
  const color = subjectColor(subj?.id, subj?.name);
  const durationMin = lesson.endMin - lesson.startMin;

  // Check if lesson is currently running today
  const isToday = lesson.date === todayIso();
  const currentMinutesNow = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, []);

  const isLiveNow = isToday && currentMinutesNow >= lesson.startMin && currentMinutesNow < lesson.endMin;
  const remainingLiveMin = isLiveNow ? lesson.endMin - currentMinutesNow : 0;

  // Single-event iCal download
  function exportSingleIcs() {
    const pad = (n: number) => String(n).padStart(2, '0');
    const [y, m, d] = lesson.date.split('-');
    const dtStart = `${y}${m}${d}T${pad(Math.floor(lesson.startMin / 60))}${pad(lesson.startMin % 60)}00`;
    const dtEnd = `${y}${m}${d}T${pad(Math.floor(lesson.endMin / 60))}${pad(lesson.endMin % 60)}00`;
    const summary = `${subjectLabel(lesson)}${cancelled ? ' (ENTFALL)' : ''}`;
    const location = lesson.rooms.map((r) => r.name).join(', ');
    const desc = [
      lesson.teachers.length > 0 ? `Lehrkraft: ${lesson.teachers.map((t) => t.name).join(', ')}` : '',
      lesson.klassen.length > 0 ? `Klasse: ${lesson.klassen.map((k) => k.name).join(', ')}` : '',
      lesson.substText ? `Vertretung: ${lesson.substText}` : '',
      lesson.info ? `Notiz: ${lesson.info}` : '',
    ]
      .filter(Boolean)
      .join('\\n');

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Untis+//Lesson Export//DE',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:untisplus-lesson-${lesson.id}-${lesson.date}@untisplus`,
      `DTSTAMP:${y}${m}${d}T000000Z`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      location ? `LOCATION:${location}` : '',
      desc ? `DESCRIPTION:${desc}` : '',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Erinnerung an Unterrichtsstunde',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lesson.date}-${subjectLabel(lesson)}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      {/* Header with Subject Color Bar */}
      <div
        className="card pad"
        style={{
          background: `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 75%, #000) 100%)`,
          color: '#ffffff',
          borderRadius: 'var(--radius)',
        }}
      >
        <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span
            style={{
              fontWeight: 900,
              fontSize: 22,
              letterSpacing: '-0.02em',
            }}
          >
            {subjectLabel(lesson)}
          </span>
          <div className="spacer" />
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
          {isExam && (
            <span className="badge exam" style={{ fontWeight: 800 }}>
              🎓 {t('today.exam')}
            </span>
          )}
        </div>

        {subj?.longName && subj.longName !== subj.name && (
          <div style={{ fontSize: 14, opacity: 0.95, fontWeight: 500 }}>{subj.longName}</div>
        )}
      </div>

      {/* Date, Time & Live Indicator */}
      <div
        className="card pad row wrap"
        style={{
          gap: 12,
          alignItems: 'center',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <div className="col" style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontWeight: 750, fontSize: 15 }}>
            {formatDay(lesson.date, i18n.language)}
          </div>
          <div className="small muted">
            {formatTime(lesson.startMin)} – {formatTime(lesson.endMin)} ({durationMin} Min.)
          </div>
        </div>

        {isLiveNow && (
          <div
            className="row"
            style={{
              gap: 6,
              alignItems: 'center',
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              padding: '6px 12px',
              borderRadius: 999,
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            <span style={{ animation: 'pulse 1.5s infinite' }}>🔴</span>
            <span>Läuft jetzt · noch {remainingLiveMin} Min.</span>
          </div>
        )}
      </div>

      {/* Substitution Alert Box */}
      {lesson.substText && (
        <div
          className={`card pad ${cancelled ? 'alert danger' : 'alert warn'}`}
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Icon name={cancelled ? 'alert' : 'refresh'} size={18} />
          <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>
            {lesson.substText}
          </div>
        </div>
      )}

      {/* Teacher Section (with 1-click schedule jump) */}
      {lesson.teachers.length > 0 && (
        <div
          className="card pad col"
          style={{
            gap: 8,
            background: 'var(--surface)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div className="tiny muted uppercase" style={{ fontWeight: 800 }}>
            👨‍🏫 {t('targetModal.tabTeachers')}
          </div>
          {lesson.teachers.map((te) => (
            <div key={te.id} className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 750 }}>{te.name}</span>
                {te.longName && te.longName !== te.name && (
                  <span className="small muted"> · {te.longName}</span>
                )}
              </div>
              <button
                type="button"
                className="btn sm ghost"
                style={{ fontSize: 12, gap: 4 }}
                onClick={() => {
                  setTarget({ id: te.id, type: ElementType.Teacher, label: te.name });
                  onClose?.();
                }}
                title={t('timetable.viewingTeacher', { name: te.name })}
              >
                <Icon name="calendar" size={13} />
                <span>Stundenplan</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Room Section (with 1-click schedule jump) */}
      {lesson.rooms.length > 0 && (
        <div
          className="card pad col"
          style={{
            gap: 8,
            background: 'var(--surface)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div className="tiny muted uppercase" style={{ fontWeight: 800 }}>
            🏛️ {t('targetModal.tabRooms')}
          </div>
          {lesson.rooms.map((ro) => (
            <div key={ro.id} className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 750 }}>{ro.name}</span>
                {ro.longName && ro.longName !== ro.name && (
                  <span className="small muted"> · {ro.longName}</span>
                )}
              </div>
              <button
                type="button"
                className="btn sm ghost"
                style={{ fontSize: 12, gap: 4 }}
                onClick={() => {
                  setTarget({ id: ro.id, type: ElementType.Room, label: ro.name });
                  onClose?.();
                }}
                title={t('timetable.viewingRoom', { name: ro.name })}
              >
                <Icon name="search" size={13} />
                <span>Raumplan</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Classes Section */}
      {lesson.klassen.length > 0 && (
        <div
          className="card pad col"
          style={{
            gap: 8,
            background: 'var(--surface)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div className="tiny muted uppercase" style={{ fontWeight: 800 }}>
            👥 {t('targetModal.tabClasses')}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {lesson.klassen.map((kl) => (
              <button
                key={kl.id}
                type="button"
                className="chip"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setTarget({ id: kl.id, type: ElementType.Class, label: kl.name });
                  onClose?.();
                }}
                title={t('timetable.viewingClass', { name: kl.name })}
              >
                <Icon name="user" size={13} />
                <span>{kl.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Linked Exams (if any) */}
      {linkedExams.length > 0 && (
        <div
          className="card pad col"
          style={{
            gap: 10,
            background: 'color-mix(in srgb, var(--warn) 12%, var(--surface))',
            borderColor: 'var(--warn)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="tiny uppercase" style={{ fontWeight: 800, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🎓</span>
              <span>{t('today.exam')} ({linkedExams.length})</span>
            </div>
            {lesson.date && (
              <span className="tiny muted">{formatDay(lesson.date, i18n.language)}</span>
            )}
          </div>
          {linkedExams.map((ex) => {
            const badge = getExamTypeBadge(ex.type);
            const exSubj = ex.subject || subj;
            const exColor = subjectColor(exSubj?.id, exSubj?.name);
            return (
              <div
                key={ex.id}
                className="card pad col"
                style={{
                  gap: 6,
                  background: 'var(--surface)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: `4px solid ${badge.color}`,
                }}
              >
                <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
                  <span
                    className="badge"
                    style={{
                      background: badge.color,
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {badge.icon} {badge.label}
                  </span>
                  {exSubj && (
                    <span
                      style={{
                        fontWeight: 750,
                        fontSize: 14,
                        color: exColor,
                      }}
                    >
                      {exSubj.name}
                      {exSubj.longName && exSubj.longName !== exSubj.name && (
                        <span className="small muted"> · {exSubj.longName}</span>
                      )}
                    </span>
                  )}
                  <div className="spacer" />
                  <span className="tiny muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ⏱️ {minutesToTime(ex.startMin)} – {minutesToTime(ex.endMin)}
                  </span>
                </div>
                {ex.text && (
                  <div style={{ fontSize: 13, color: 'var(--text)', opacity: 0.9 }}>
                    {ex.text}
                  </div>
                )}
                {(ex.rooms ?? []).length > 0 && (
                  <div className="tiny muted">
                    🏛️ Raum: {(ex.rooms ?? []).map((r) => r.name).join(', ')}
                  </div>
                )}
                {(ex.teachers ?? []).length > 0 && (
                  <div className="tiny muted">
                    👨‍🏫 Lehrkraft: {(ex.teachers ?? []).map((t) => t.name).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Linked Homework (if any) */}
      {linkedHomework.length > 0 && (
        <div
          className="card pad col"
          style={{
            gap: 8,
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div className="tiny muted uppercase" style={{ fontWeight: 800 }}>
            📝 {t('homework.title')} ({linkedHomework.length})
          </div>
          {linkedHomework.map((hw) => {
            const isDone = hw.completed || doneHw.has(hw.id);
            return (
              <div
                key={hw.id}
                className="row"
                style={{
                  gap: 10,
                  alignItems: 'flex-start',
                  opacity: isDone ? 0.6 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => doneHw.toggle(hw.id)}
                  style={{ marginTop: 3 }}
                />
                <div className="col" style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 650,
                      fontSize: 13.5,
                      textDecoration: isDone ? 'line-through' : 'none',
                    }}
                  >
                    {hw.text || t('homework.title')}
                  </div>
                  {hw.dueDate && (
                    <div className="tiny muted">Fällig: {formatDay(hw.dueDate, i18n.language)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lesson Notes / Info */}
      {lesson.info && (
        <div
          className="card pad col"
          style={{
            gap: 4,
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div className="tiny muted uppercase" style={{ fontWeight: 800 }}>
            ℹ️ {t('today.note')}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{lesson.info}</div>
        </div>
      )}

      {/* Quick Action: Export single event */}
      <button
        type="button"
        className="btn primary sm"
        onClick={exportSingleIcs}
        style={{ gap: 6, justifyContent: 'center' }}
      >
        <Icon name="calendar" size={15} />
        <span>📅 In Kalender exportieren (.ics)</span>
      </button>
    </div>
  );
}
