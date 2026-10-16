import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateToInt,
  dayOfWeek,
  formatCalendarWeek,
  getCalendarWeek,
  getCalendarWeekYear,
  intToIsoDate,
  isoDate,
  isoRange,
  isWeekend,
  minutesToTime,
  minutesToUntisTime,
  mondayOf,
  timeToMinutes,
  untisTimeToMinutes,
  weekRange,
} from './dates.js';

describe('date/time conversion', () => {
  it('dateToInt round-trips with intToIsoDate', () => {
    expect(dateToInt('2026-10-14')).toBe(20261014);
    expect(intToIsoDate(20261014)).toBe('2026-10-14');
    expect(dateToInt(new Date(2026, 9, 14))).toBe(20261014);
  });

  it('pads single-digit months and days', () => {
    expect(dateToInt('2026-01-05')).toBe(20260105);
    expect(intToIsoDate(20260105)).toBe('2026-01-05');
  });

  it('accepts a Date or a string', () => {
    expect(dateToInt(new Date(2025, 0, 1))).toBe(20250101);
    expect(dateToInt('2025-1-1')).toBe(20250101);
  });

  it('converts minutes-since-midnight to HH:MM', () => {
    expect(minutesToTime(915)).toBe('15:15');
    expect(minutesToTime(750)).toBe('12:30');
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(720)).toBe('12:00');
  });

  it('converts HH:MM to minutes', () => {
    expect(timeToMinutes('09:15')).toBe(555);
    expect(timeToMinutes('7:50')).toBe(470);
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('round-trips time', () => {
    for (const t of [0, 60, 470, 555, 720, 1005, 1439]) {
      expect(timeToMinutes(minutesToTime(t))).toBe(t);
    }
  });

  it('converts WebUntis packed HMM times to minutes', () => {
    expect(untisTimeToMinutes(710)).toBe(430); // 07:10
    expect(untisTimeToMinutes(800)).toBe(480); // 08:00
    expect(untisTimeToMinutes(915)).toBe(555); // 09:15
    expect(untisTimeToMinutes(1045)).toBe(645); // 10:45
    expect(untisTimeToMinutes('T07:10')).toBe(430); // master-data time grid format
    expect(untisTimeToMinutes('750')).toBe(470); // 07:50
  });

  it('converts minutes back to WebUntis packed HMM', () => {
    expect(minutesToUntisTime(430)).toBe(710);
    expect(minutesToUntisTime(480)).toBe(800);
    expect(minutesToUntisTime(645)).toBe(1045);
    for (const m of [430, 470, 555, 645, 720, 1005]) {
      expect(untisTimeToMinutes(minutesToUntisTime(m))).toBe(m);
    }
  });
});

describe('calendar math', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-14', 3)).toBe('2026-10-17');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('computes the Monday of a week (2026-10-14 is a Wednesday)', () => {
    expect(dayOfWeek('2026-10-14')).toBe(3);
    expect(mondayOf('2026-10-14')).toBe('2026-10-12');
    // Sunday belongs to the week that started the previous Monday.
    expect(mondayOf('2026-10-18')).toBe('2026-10-12');
  });

  it('returns the work-week range', () => {
    expect(weekRange('2026-10-14')).toEqual({ start: '2026-10-12', end: '2026-10-16' });
    expect(weekRange('2026-10-14', true)).toEqual({ start: '2026-10-12', end: '2026-10-18' });
  });

  it('detects weekends', () => {
    expect(isWeekend('2026-10-17')).toBe(true);
    expect(isWeekend('2026-10-18')).toBe(true);
    expect(isWeekend('2026-10-14')).toBe(false);
  });

  it('enumerates an inclusive ISO range', () => {
    expect(isoRange('2026-10-12', '2026-10-16')).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
  });

  it('formats a Date to local ISO', () => {
    expect(isoDate(new Date(2026, 9, 4))).toBe('2026-10-04');
  });

  describe('calendar week (KW / CW)', () => {
    it('computes ISO week for normal in-year dates', () => {
      // 2026-10-15 is Thursday in KW 42
      expect(getCalendarWeek('2026-10-15')).toBe(42);
      expect(getCalendarWeekYear('2026-10-15')).toEqual({ year: 2026, week: 42 });
      expect(formatCalendarWeek('2026-10-15', 'de')).toBe('KW 42');
      expect(formatCalendarWeek('2026-10-15', 'en')).toBe('CW 42');
    });

    it('handles year start and end boundaries according to ISO 8601', () => {
      // 2026-01-01 is Thursday -> KW 1 of 2026
      expect(getCalendarWeekYear('2026-01-01')).toEqual({ year: 2026, week: 1 });

      // 2023-01-01 is Sunday -> part of KW 52 of 2022
      expect(getCalendarWeekYear('2023-01-01')).toEqual({ year: 2022, week: 52 });

      // 2021-01-01 is Friday -> KW 53 of 2020
      expect(getCalendarWeekYear('2021-01-01')).toEqual({ year: 2020, week: 53 });

      // 2024-01-01 is Monday -> KW 1 of 2024
      expect(getCalendarWeekYear('2024-01-01')).toEqual({ year: 2024, week: 1 });
    });
  });
});
