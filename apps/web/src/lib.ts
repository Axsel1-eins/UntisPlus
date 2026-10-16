import {
  minutesToTime,
  type Lesson,
  type LessonStatus,
  type Ref,
  type SubstitutionItem,
  type SubstitutionKind,
} from '@untisplus/shared';
import { getCustomization } from './customization.js';

export type { SubstitutionItem };

export function nowMinutes(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Deterministic, pleasant colour per subject/element id,
 * with priority given to user-customized subject colors.
 */
export function subjectColor(id: number | undefined, name?: string): string {
  if (name) {
    const custom = getCustomization().subjectColors;
    const clean = name.trim().toUpperCase();
    if (custom[clean]) return custom[clean];
    // Strip suffixes like "D1", "M-GK", "BIO_2"
    const base = clean.replace(/[-_0-9].*$/, '').trim();
    if (base && custom[base]) return custom[base];
  }
  const hue = id === undefined ? 232 : (id * 47) % 360;
  return `hsl(${hue} 62% 52%)`;
}

/**
 * Calculates a contrasting text color (white or dark slate)
 * for a given subject background color according to WCAG luminance.
 */
export function subjectTextColor(bgColor: string): string {
  if (!bgColor) return '#ffffff';
  let hex = bgColor.trim();
  if (hex.startsWith('#')) {
    hex = hex.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return lum > 155 ? '#0f172a' : '#ffffff';
      }
    }
  }
  return '#ffffff';
}

export function primarySubject(lesson: Lesson): Ref | undefined {
  return lesson.subjects[0];
}

export function subjectLabel(lesson: Lesson): string {
  if (lesson.subjects.length === 0) {
    return lesson.activityType ?? '—';
  }
  const customization = getCustomization();
  const mode = customization.subjectDisplayMode ?? 'code';
  const aliases = customization.subjectAliases ?? {};

  return lesson.subjects
    .map((s) => {
      const code = s.name;
      const cleanUpper = code.toUpperCase();
      // Check custom user alias first (e.g. BSP -> Sport)
      if (aliases[cleanUpper]) {
        return aliases[cleanUpper];
      }

      const longName = s.longName && s.longName.trim() !== '' ? s.longName : undefined;
      if (mode === 'name') {
        return longName ?? code;
      }
      if (mode === 'both') {
        return longName ? `${code} · ${longName}` : code;
      }
      return code;
    })
    .join(' / ');
}

export function subjectLongLabel(lesson: Lesson): string {
  const first = lesson.subjects[0];
  if (!first) return '';
  const aliases = getCustomization().subjectAliases ?? {};
  const alias = aliases[first.name.toUpperCase()];
  if (alias) return alias;
  return first.longName ?? first.name ?? '';
}

export function names(refs: Ref[]): string {
  return refs.map((r) => r.name).join(', ');
}

export function timeRange(lesson: Lesson): string {
  return `${minutesToTime(lesson.startMin)}–${minutesToTime(lesson.endMin)}`;
}

export function statusBadgeKey(status: LessonStatus): 'cancelled' | 'irregular' | 'exam' | null {
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'IRREGULAR') return 'irregular';
  if (status === 'EXAM') return 'exam';
  return null;
}

export function isChanged(lesson: Lesson): boolean {
  return lesson.status !== 'REGULAR' || Boolean(lesson.substText);
}

/** Lessons that belong to a given ISO day, sorted by start time. */
export function lessonsForDay(lessons: Lesson[], iso: string): Lesson[] {
  return lessons
    .filter((l) => l.date === iso)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

/** The lesson happening right now (any status). */
export function currentLesson(lessons: Lesson[], d = new Date()): Lesson | undefined {
  const iso = todayIso(d);
  const m = nowMinutes(d);
  return lessons.find((l) => l.date === iso && l.startMin <= m && m < l.endMin);
}

/** The next non-cancelled lesson starting later today. */
export function nextLesson(lessons: Lesson[], d = new Date()): Lesson | undefined {
  const iso = todayIso(d);
  const m = nowMinutes(d);
  return lessonsForDay(lessons, iso)
    .filter((l) => l.startMin >= m && l.status !== 'CANCELLED')
    .sort((a, b) => a.startMin - b.startMin)[0];
}

/** The next lesson regardless of status (used to show "cancelled" up front). */
export function nextAnyLesson(lessons: Lesson[], d = new Date()): Lesson | undefined {
  const iso = todayIso(d);
  const m = nowMinutes(d);
  return lessonsForDay(lessons, iso).find((l) => l.endMin >= m);
}

export interface SubstitutionItem_ {
  lesson: Lesson;
  kind: SubstitutionKind;
}

/** Derive the substitution list from timetable lessons carrying change markers. */
export function toSubstitutions(lessons: Lesson[]): SubstitutionItem[] {
  return lessons
    .filter(isChanged)
    .map((lesson) => ({ lesson, kind: inferKind(lesson) }))
    .sort((a, b) => a.lesson.date.localeCompare(b.lesson.date) || a.lesson.startMin - b.lesson.startMin);
}

function inferKind(lesson: Lesson): SubstitutionKind {
  if (lesson.status === 'CANCELLED') return 'CANCELLED';
  const t = (lesson.substText ?? '').toLowerCase();
  if (/raum|room|saal/.test(t)) return 'ROOM_CHANGE';
  if (/lehrer|teacher|prof|vertretung durch|supply/.test(t)) return 'TEACHER_CHANGE';
  if (/fach|subject/.test(t)) return 'SUBJECT_CHANGE';
  return 'OTHER';
}

const DOW_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dowShort(iso: string, lang: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const idx = new Date(y, m - 1, d).getDay();
  return (lang === 'en' ? DOW_EN : DOW_DE)[idx]!;
}

export function formatDay(iso: string, lang: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-AT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatTime(min: number): string {
  return minutesToTime(min);
}

/** Deterministic short label for a substitution kind, for chips. */
export function substitutionKindKey(kind: SubstitutionKind): string {
  return `subs.kind.${kind}`;
}
