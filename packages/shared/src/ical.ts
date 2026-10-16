import type { Exam, Holiday, Lesson } from './types.js';
import { addDays } from './dates.js';

export type CalendarScope = 'all' | 'timetable' | 'exams' | 'holidays';

export interface ICalendarOptions {
  /** Name of the calendar displayed in calendar clients (e.g. "Untis+ Timetable - Alex"). */
  calendarName: string;
  /** Lessons to include in the feed. */
  lessons?: Lesson[];
  /** Exams to include in the feed. */
  exams?: Exam[];
  /** Holidays to include in the feed. */
  holidays?: Holiday[];
  /** Scope filter for what events to include ('all' | 'timetable' | 'exams' | 'holidays'). Default: 'all'. */
  scope?: CalendarScope;
  /** Whether to include VALARM reminders for exams. Default: true. */
  includeAlarms?: boolean;
  /** Refresh interval hint in minutes. Default: 15. */
  ttlMinutes?: number;
  /** School name or description. */
  schoolName?: string;
  /** Timezone identifier (default: "Europe/Vienna"). */
  timezone?: string;
  /** Fixed timestamp for DTSTAMP (useful for deterministic tests). */
  now?: Date;
}

/**
 * Escapes characters for RFC 5545 text values.
 */
export function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Formats date and minutes-since-midnight into an RFC 5545 local datetime string.
 * Example: date="2026-10-15", min=480 (08:00) -> "20261015T080000"
 */
export function formatICalDateTime(dateStr: string, min: number): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const h = Math.floor(min / 60);
  const m = min % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${cleanDate}T${pad(h)}${pad(m)}00`;
}

/**
 * Formats a Date object into an RFC 5545 UTC timestamp (e.g. "20261015T144500Z").
 */
export function formatICalUtc(date: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

/**
 * Folds lines longer than 75 characters using CRLF and a single leading space according to RFC 5545.
 */
export function foldICalLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  parts.push(line.slice(0, 75));
  let remaining = line.slice(75);
  while (remaining.length > 74) {
    parts.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  if (remaining.length > 0) {
    parts.push(` ${remaining}`);
  }
  return parts.join('\r\n');
}

/**
 * Generates an RFC 5545 compliant iCalendar string (.ics) for Untis lessons, exams, and holidays.
 */
export function buildICalendar(options: ICalendarOptions): string {
  const {
    calendarName,
    lessons = [],
    exams = [],
    holidays = [],
    scope = 'all',
    includeAlarms = true,
    ttlMinutes = 15,
    schoolName,
    timezone = 'Europe/Vienna',
    now = new Date(),
  } = options;

  const dtstamp = formatICalUtc(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UntisPlus//Untis+ Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICalText(calendarName)}`,
    `X-WR-TIMEZONE:${escapeICalText(timezone)}`,
    `X-PUBLISHED-TTL:PT${ttlMinutes}M`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${ttlMinutes}M`,
  ];

  if (schoolName) {
    lines.push(`X-WR-CALDESC:${escapeICalText(`Untis+ Timetable for ${schoolName}`)}`);
  }

  const includeTimetable = scope === 'all' || scope === 'timetable';
  const includeExams = scope === 'all' || scope === 'exams';
  const includeHolidays = scope === 'all' || scope === 'holidays';

  if (includeTimetable) {
    for (const lesson of lessons) {
      const isCancelled = lesson.status === 'CANCELLED';
      const subjNames = lesson.subjects.map((s) => s.name).join(', ') || lesson.activityType || 'Unterricht';
      const roomNames = lesson.rooms.map((r) => r.name).join(', ');
      const teacherNames = lesson.teachers.map((t) => t.name).join(', ');
      const classNames = lesson.klassen.map((k) => k.name).join(', ');

      let summary = subjNames;
      if (isCancelled) {
        summary = `[ENTFALL] ${subjNames}`;
      } else if (lesson.isExam) {
        summary = `[PRÜFUNG] ${subjNames}`;
      }
      if (roomNames) {
        summary += ` (${roomNames})`;
      }

      const descParts: string[] = [];
      if (lesson.subjects.length > 0 && lesson.subjects[0]?.longName) {
        descParts.push(`Fach: ${lesson.subjects.map((s) => s.longName || s.name).join(', ')}`);
      }
      if (teacherNames) descParts.push(`Lehrkraft: ${teacherNames}`);
      if (classNames) descParts.push(`Klasse: ${classNames}`);
      if (roomNames) descParts.push(`Raum: ${roomNames}`);
      if (lesson.substText) descParts.push(`Vertretungstext: ${lesson.substText}`);
      if (lesson.info) descParts.push(`Info: ${lesson.info}`);
      if (isCancelled) descParts.push(`STATUS: Unterricht entfällt!`);

      const startDt = formatICalDateTime(lesson.date, lesson.startMin);
      const endDt = formatICalDateTime(lesson.date, lesson.endMin);

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${lesson.id}@untisplus`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;TZID=${timezone}:${startDt}`);
      lines.push(`DTEND;TZID=${timezone}:${endDt}`);
      lines.push(`SUMMARY:${escapeICalText(summary)}`);
      if (roomNames) {
        lines.push(`LOCATION:${escapeICalText(roomNames)}`);
      }
      if (descParts.length > 0) {
        lines.push(`DESCRIPTION:${escapeICalText(descParts.join('\\n'))}`);
      }
      lines.push(`STATUS:${isCancelled ? 'CANCELLED' : 'CONFIRMED'}`);
      lines.push('END:VEVENT');
    }
  }

  if (includeExams) {
    for (const exam of exams) {
      const roomNames = exam.rooms.map((r) => r.name).join(', ');
      const teacherNames = exam.teachers.map((t) => t.name).join(', ');
      const subjName = exam.subject?.name || exam.subject?.longName || '';
      const detail = exam.text || exam.type || '';
      const baseTitle = subjName && detail ? `${subjName}: ${detail}` : (subjName || detail || 'Prüfung');
      let summary = baseTitle.startsWith('[PRÜFUNG]') ? baseTitle : `[PRÜFUNG] ${baseTitle}`;
      if (roomNames) {
        summary += ` (${roomNames})`;
      }

      const descParts: string[] = [];
      if (exam.subject) {
        descParts.push(`Fach: ${exam.subject.longName || exam.subject.name}`);
      }
      if (teacherNames) {
        descParts.push(`Lehrkraft: ${teacherNames}`);
      }
      if (roomNames) {
        descParts.push(`Raum: ${roomNames}`);
      }
      if (exam.type) {
        descParts.push(`Art: ${exam.type}`);
      }
      if (exam.text) {
        descParts.push(`Notizen: ${exam.text}`);
      }

      const startDt = formatICalDateTime(exam.date, exam.startMin);
      const endDt = formatICalDateTime(exam.date, exam.endMin);

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:exam-${exam.id}@untisplus`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;TZID=${timezone}:${startDt}`);
      lines.push(`DTEND;TZID=${timezone}:${endDt}`);
      lines.push(`SUMMARY:${escapeICalText(summary)}`);
      if (roomNames) {
        lines.push(`LOCATION:${escapeICalText(roomNames)}`);
      }
      if (descParts.length > 0) {
        lines.push(`DESCRIPTION:${escapeICalText(descParts.join('\\n'))}`);
      }
      lines.push('STATUS:CONFIRMED');

      if (includeAlarms) {
        lines.push('BEGIN:VALARM');
        lines.push('TRIGGER:-P1D');
        lines.push('ACTION:DISPLAY');
        lines.push('DESCRIPTION:Erinnerung an Prüfung');
        lines.push('END:VALARM');
      }

      lines.push('END:VEVENT');
    }
  }

  if (includeHolidays) {
    for (const holiday of holidays) {
      const startClean = holiday.startDate.replace(/-/g, '');
      const endPlusOne = addDays(holiday.endDate, 1);
      const endClean = endPlusOne.replace(/-/g, '');

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:holiday-${holiday.id}@untisplus`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${startClean}`);
      lines.push(`DTEND;VALUE=DATE:${endClean}`);
      lines.push(`SUMMARY:${escapeICalText(`Ferien: ${holiday.name}`)}`);
      if (holiday.longName && holiday.longName !== holiday.name) {
        lines.push(`DESCRIPTION:${escapeICalText(holiday.longName)}`);
      }
      lines.push('TRANSP:TRANSPARENT');
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');

  // RFC 5545 requires CRLF line endings and line folding.
  return lines.map(foldICalLine).join('\r\n') + '\r\n';
}
