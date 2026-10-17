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
 * Built-in default color palette for common DACH / Austrian school subjects.
 * Provides instant, recognizable, and distinct colors across all views.
 */
export const DEFAULT_SUBJECT_COLORS: Record<string, string> = {
  // Languages & Humanities
  D: '#ef4444',        // Red / Crimson (Deutsch)
  DEUTSCH: '#ef4444',
  E: '#f59e0b',        // Amber (Englisch)
  E1: '#f59e0b',
  ENGLISCH: '#f59e0b',
  ENG: '#f59e0b',
  F: '#0ea5e9',        // Sky Blue (Französisch)
  FRANZÖSISCH: '#0ea5e9',
  ITA: '#10b981',      // Emerald (Italienisch)
  SP: '#f97316',       // Orange (Spanisch)
  L: '#8b5cf6',        // Purple (Latein)

  // Mathematics & Science
  M: '#2563eb',        // Blue (Mathematik)
  AM: '#2563eb',       // Blue (Angewandte Mathematik)
  MATH: '#2563eb',
  MATHEMATIK: '#2563eb',
  PH: '#0284c7',       // Cyan / Light Blue (Physik)
  PHYSIK: '#0284c7',
  CH: '#84cc16',       // Lime (Chemie)
  CHEMIE: '#84cc16',
  BIO: '#15803d',      // Forest Green (Biologie)
  BIOLOGIE: '#15803d',
  NW: '#06b6d4',       // Cyan / Teal (Naturwissenschaften / Netzwerke)
  NW2: '#06b6d4',
  NWT: '#06b6d4',

  // Computer Science & Technology
  POS: '#10b981',      // Emerald Green (Programmieren / Softwareentwicklung)
  POS1: '#10b981',
  SEW: '#10b981',      // Softwareentwicklung
  PRG: '#10b981',      // Programmierung
  INF: '#059669',      // Informatik
  INFORMATIK: '#059669',
  DBI: '#f97316',      // Vivid Orange (Datenbanken)
  DBI_1: '#f97316',
  DATENBANKEN: '#f97316',
  NSCS: '#6366f1',     // Indigo / Electric (Netzwerksicherheit & Cloud)
  NSCS_1: '#6366f1',
  SYT: '#6366f1',      // Systemtechnik
  SYS: '#6366f1',
  WMC: '#14b8a6',      // Teal (Web & Mobile Computing)
  WMC_1: '#14b8a6',
  MEDT: '#14b8a6',     // Medientechnik
  SYP: '#8b5cf6',      // Purple (Systemplanung & Projektentwicklung)
  SYP1: '#8b5cf6',
  PRE: '#8b5cf6',      // Projektentwicklung

  // Economics & Social Studies
  BWM: '#eab308',      // Gold / Yellow (Betriebswirtschaft)
  BWM_1: '#eab308',
  BWM_2: '#ca8a04',    // Dark Gold
  BW: '#eab308',
  BWL: '#eab308',
  RW: '#d97706',       // Rechnungswesen
  GGP: '#ec4899',      // Pink / Rose (Geschichte & Politische Bildung)
  GPB: '#ec4899',
  GS: '#ec4899',
  GW: '#0d9488',       // Geografie
  GWK: '#0d9488',

  // Sports, Religion & Arts
  BSP: '#22c55e',      // Bright Green (Bewegung und Sport)
  BSPK: '#22c55e',
  BSPM: '#16a34a',
  SPORT: '#22c55e',
  RK: '#a855f7',       // Violet (Religion katholisch)
  EV: '#a855f7',       // Religion evangelisch
  REL: '#a855f7',
  ETH: '#9333ea',      // Ethik
  ME: '#e11d48',       // Musikerziehung
  BE: '#f43f5e',       // Bildnerische Erziehung
};

/**
 * Deterministic, pleasant colour per subject/element id,
 * with priority given to user-customized subject colors, followed by
 * standard subject defaults, and finally wide-spectrum golden-angle hashing.
 */
export function subjectColor(id: number | undefined, name?: string): string {
  if (name) {
    const custom = getCustomization().subjectColors;
    const clean = name.trim().toUpperCase();
    if (custom[clean]) return custom[clean];
    // Strip suffixes like "D1", "M-GK", "BIO_2"
    const base = clean.replace(/[-_0-9].*$/, '').trim();
    if (base && custom[base]) return custom[base];

    // Check built-in standard subjects
    if (DEFAULT_SUBJECT_COLORS[clean]) return DEFAULT_SUBJECT_COLORS[clean];
    if (base && DEFAULT_SUBJECT_COLORS[base]) return DEFAULT_SUBJECT_COLORS[base];

    // Wide-spectrum golden-angle hashing based on clean subject name
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
      hash = ((hash << 5) - hash) + clean.charCodeAt(i);
      hash |= 0;
    }
    const hue = Math.round((Math.abs(hash) * 137.508) % 360);
    return `hsl(${hue} 68% 48%)`;
  }
  if (id !== undefined && id > 0) {
    const hue = Math.round((id * 137.508) % 360);
    return `hsl(${hue} 68% 48%)`;
  }
  return 'hsl(215 68% 50%)';
}

/**
 * Calculates a contrasting text color (white or dark slate)
 * for a given subject background color according to WCAG luminance.
 * Supports #hex, rgb(...) and hsl(...).
 */
export function subjectTextColor(bgColor: string): string {
  if (!bgColor) return '#ffffff';
  const str = bgColor.trim();
  if (str.startsWith('#')) {
    let hex = str.slice(1);
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
  const hslMatch = str.match(/hsl\(\s*(\d+)(?:deg)?\s+(\d+)%\s+(\d+)%\s*\)/i);
  if (hslMatch) {
    const h = Number(hslMatch[1]);
    const l = Number(hslMatch[3]);
    if (l >= 65 || (h >= 40 && h <= 80 && l >= 45)) return '#0f172a';
    return '#ffffff';
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

const LOCALE_MAP: Record<string, string> = {
  de: 'de-AT',
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  tr: 'tr-TR',
  bs: 'bs-BA',
  uk: 'uk-UA',
  ru: 'ru-RU',
  ar: 'ar-SA',
};

export function dowShort(iso: string, lang: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  try {
    const locale = LOCALE_MAP[lang] ?? (lang === 'en' ? 'en-GB' : 'de-AT');
    const s = date.toLocaleDateString(locale, { weekday: 'short' });
    return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, '') : (lang === 'en' ? DOW_EN : DOW_DE)[date.getDay()]!;
  } catch {
    return (lang === 'en' ? DOW_EN : DOW_DE)[date.getDay()]!;
  }
}

export function formatDay(iso: string, lang: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const locale = LOCALE_MAP[lang] ?? (lang === 'en' ? 'en-GB' : 'de-AT');
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
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
