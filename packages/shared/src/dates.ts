/**
 * Date and time helpers for WebUntis' quirky formats.
 *
 * WebUntis represents dates as `yyyymmdd` integers and times as minutes-since-midnight
 * integers. There is NO timezone information in the API — everything is school-local.
 * These helpers therefore operate on plain calendar values and never apply a timezone.
 */

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** A Date or an ISO-ish date string ("YYYY-MM-DD" or a Date). */
export type DateInput = Date | string;

/** Convert a Date (or "YYYY-MM-DD" string) to WebUntis' `yyyymmdd` integer. */
export function dateToInt(input: DateInput): number {
  if (typeof input === 'string') {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(input.trim());
    if (m) {
      const [, y, mo, d] = m as unknown as [string, string, string, string];
      return Number(y) * 10000 + Number(mo) * 100 + Number(d);
    }
    const digits = input.replace(/\D/g, '');
    if (digits.length >= 8) return Number(digits.slice(0, 8));
    throw new Error(`Unrecognized date: ${input}`);
  }
  return input.getFullYear() * 10000 + (input.getMonth() + 1) * 100 + input.getDate();
}

/** Convert a WebUntis `yyyymmdd` integer (or string) to an ISO date "YYYY-MM-DD". */
export function intToIsoDate(value: number | string): string {
  const s = String(value).padStart(8, '0');
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** Convert a WebUntis `yyyymmdd` integer to a Date at local midnight. */
export function intToDate(value: number | string): Date {
  const iso = intToIsoDate(value);
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** Format a Date as a local ISO date "YYYY-MM-DD". */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Convert a WebUntis time (minutes since midnight) to "HH:MM". */
export function minutesToTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** Convert "HH:MM" (or "H:MM") to minutes since midnight. */
export function timeToMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) throw new Error(`Unrecognized time: ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Convert a WebUntis raw time to minutes since midnight.
 *
 * WebUntis serializes times as *packed* `HMM` integers, not minutes-since-midnight:
 * `710` = 07:10, `800` = 08:00, `1045` = 10:45. (Confirmed against python-webuntis,
 * which parses with `%H%M`, and the JS `webuntis` client, which parses with `Hmm`.)
 *
 * A leading `T` (as seen in the master-data time grid, e.g. "T07:10") is tolerated.
 */
export function untisTimeToMinutes(raw: number | string): number {
  const s = String(raw).replace(/^T/, '').replace(':', '');
  const digits = s.padStart(4, '0');
  if (!/^\d{3,4}$/.test(digits)) throw new Error(`Unrecognized WebUntis time: ${raw}`);
  const padded = digits.padStart(4, '0');
  return Number(padded.slice(0, padded.length - 2)) * 60 + Number(padded.slice(-2));
}

/** Convert minutes since midnight to WebUntis' packed `HMM` integer. */
export function minutesToUntisTime(minutes: number): number {
  const m = ((minutes % 1440) + 1440) % 1440;
  return Math.floor(m / 60) * 100 + (m % 60);
}

/** Add `days` to an ISO date, returning an ISO date. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + days);
  return isoDate(dt);
}

/** Day of week for an ISO date: 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay();
}

/** The Monday of the week containing `iso`. */
export function mondayOf(iso: string): string {
  const dow = dayOfWeek(iso); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(iso, diff);
}

/** Monday..Sunday (or Mon..Fri) range for the week containing `iso`. */
export function weekRange(iso: string, includeWeekend = false): { start: string; end: string } {
  const start = mondayOf(iso);
  return { start, end: addDays(start, includeWeekend ? 6 : 4) };
}

/** True for Saturday/Sunday. */
export function isWeekend(iso: string): boolean {
  const dow = dayOfWeek(iso);
  return dow === 0 || dow === 6;
}

/** Inclusive list of ISO dates between start and end. */
export function isoRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  // Guard against a runaway loop.
  for (let i = 0; i < 400 && cur <= end; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/**
 * Return ISO 8601 calendar week and year for an ISO date string.
 * In ISO 8601, week 1 is the week with the year's first Thursday (or contains 4 Jan).
 * Weeks start on Monday.
 */
export function getCalendarWeekYear(iso: string): { year: number; week: number } {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1, d));
  // ISO day of week: Monday=1 ... Sunday=7
  const dayNr = ((target.getUTCDay() + 6) % 7) + 1;
  // Set to nearest Thursday: current date + 4 - current day number
  target.setUTCDate(target.getUTCDate() + 4 - dayNr);
  const year = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year, week: weekNo };
}

/** Return the ISO 8601 calendar week number (1–53) for an ISO date. */
export function getCalendarWeek(iso: string): number {
  return getCalendarWeekYear(iso).week;
}

/** Format as "KW 42" (German) or "CW 42" (English). */
export function formatCalendarWeek(iso: string, locale = 'de'): string {
  const { week } = getCalendarWeekYear(iso);
  const prefix = locale.startsWith('de') ? 'KW' : 'CW';
  return `${prefix} ${week}`;
}
