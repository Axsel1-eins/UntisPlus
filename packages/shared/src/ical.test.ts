import { describe, expect, it } from 'vitest';
import {
  buildICalendar,
  escapeICalText,
  foldICalLine,
  formatICalDateTime,
  formatICalUtc,
} from './ical.js';
import type { Exam, Holiday, Lesson } from './types.js';

describe('iCalendar generator', () => {
  it('escapes special characters properly for RFC 5545', () => {
    expect(escapeICalText('Math, Physics; Lab\\Room\nNotes')).toBe(
      'Math\\, Physics\\; Lab\\\\Room\\nNotes',
    );
  });

  it('formats dates and minutes into RFC 5545 local datetime', () => {
    expect(formatICalDateTime('2026-10-15', 480)).toBe('20261015T080000');
    expect(formatICalDateTime('2026-10-15', 815)).toBe('20261015T133500');
  });

  it('formats Date into RFC 5545 UTC timestamp', () => {
    const fixed = new Date('2026-10-15T12:30:00Z');
    expect(formatICalUtc(fixed)).toBe('20261015T123000Z');
  });

  it('folds lines exceeding 75 characters', () => {
    const shortLine = 'SUMMARY:Mathematics';
    expect(foldICalLine(shortLine)).toBe(shortLine);

    const longLine =
      'DESCRIPTION:This is a very long description that goes well beyond the 75 character limit set by the RFC 5545 specification for calendar data feeds';
    const folded = foldICalLine(longLine);
    expect(folded).toContain('\r\n ');
    const lines = folded.split('\r\n');
    expect(lines[0]!.length).toBeLessThanOrEqual(75);
    expect(lines[1]!.startsWith(' ')).toBe(true);
  });

  it('generates a valid VCALENDAR feed with regular, cancelled, and exam lessons', () => {
    const lessons: Lesson[] = [
      {
        id: 'lesson-1',
        date: '2026-10-15',
        startMin: 480, // 08:00
        endMin: 530, // 08:50
        subjects: [{ id: 1, name: 'M', longName: 'Mathematik' }],
        teachers: [{ id: 10, name: 'MUE', longName: 'Müller' }],
        rooms: [{ id: 100, name: 'C5.06' }],
        klassen: [{ id: 50, name: '5AHIT' }],
        status: 'REGULAR',
      },
      {
        id: 'lesson-2',
        date: '2026-10-15',
        startMin: 535, // 08:55
        endMin: 585, // 09:45
        subjects: [{ id: 2, name: 'D', longName: 'Deutsch' }],
        teachers: [{ id: 11, name: 'HUB', longName: 'Huber' }],
        rooms: [{ id: 100, name: 'C5.06' }],
        klassen: [{ id: 50, name: '5AHIT' }],
        status: 'CANCELLED',
        substText: 'Entfällt wegen Konferenz',
      },
      {
        id: 'lesson-3',
        date: '2026-10-16',
        startMin: 600, // 10:00
        endMin: 700, // 11:40
        subjects: [{ id: 3, name: 'E', longName: 'Englisch' }],
        teachers: [{ id: 12, name: 'SCH', longName: 'Schmidt' }],
        rooms: [{ id: 101, name: 'EDV3' }],
        klassen: [{ id: 50, name: '5AHIT' }],
        status: 'REGULAR',
        isExam: true,
      },
    ];

    const ics = buildICalendar({
      calendarName: 'Untis+ Stundenplan',
      lessons,
      ttlMinutes: 15,
      schoolName: 'HTL Wien',
      now: new Date('2026-10-15T07:00:00Z'),
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('X-WR-CALNAME:Untis+ Stundenplan');
    expect(ics).toContain('X-PUBLISHED-TTL:PT15M');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT15M');

    // Check regular lesson
    expect(ics).toContain('UID:lesson-1@untisplus');
    expect(ics).toContain('DTSTART;TZID=Europe/Vienna:20261015T080000');
    expect(ics).toContain('DTEND;TZID=Europe/Vienna:20261015T085000');
    expect(ics).toContain('SUMMARY:M (C5.06)');
    expect(ics).toContain('LOCATION:C5.06');
    expect(ics).toContain('STATUS:CONFIRMED');

    // Check cancelled lesson
    expect(ics).toContain('UID:lesson-2@untisplus');
    expect(ics).toContain('SUMMARY:[ENTFALL] D (C5.06)');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics.replace(/\r\n[ \t]/g, '')).toContain('Vertretungstext: Entfällt wegen Konferenz');

    // Check exam lesson
    expect(ics).toContain('UID:lesson-3@untisplus');
    expect(ics).toContain('SUMMARY:[PRÜFUNG] E (EDV3)');
    expect(ics).toContain('LOCATION:EDV3');

    expect(ics).toContain('END:VCALENDAR');
  });

  it('generates exam events with RFC 5545 details and VALARM reminder', () => {
    const exams: Exam[] = [
      {
        id: 8001,
        date: '2026-10-20',
        startMin: 480, // 08:00
        endMin: 530, // 08:50
        subject: { id: 23, name: 'AM', longName: 'Angewandte Mathematik' },
        teachers: [{ id: 14, name: 'NOV', longName: 'Novak' }],
        rooms: [{ id: 31, name: 'A101' }],
        type: 'Schularbeit',
        text: '1. Schularbeit (Kapitel 1–3)',
      },
    ];

    const ics = buildICalendar({
      calendarName: 'Untis+ Prüfungen',
      exams,
      includeAlarms: true,
      now: new Date('2026-10-15T07:00:00Z'),
    });

    const unfolded = ics.replace(/\r?\n /g, '');
    expect(unfolded).toContain('BEGIN:VEVENT');
    expect(unfolded).toContain('UID:exam-8001@untisplus');
    expect(unfolded).toContain('DTSTART;TZID=Europe/Vienna:20261020T080000');
    expect(unfolded).toContain('DTEND;TZID=Europe/Vienna:20261020T085000');
    expect(unfolded).toContain('SUMMARY:[PRÜFUNG] AM: 1. Schularbeit (Kapitel 1–3) (A101)');
    expect(unfolded).toContain('LOCATION:A101');
    expect(unfolded).toContain('Fach: Angewandte Mathematik');
    expect(unfolded).toContain('Lehrkraft: NOV');
    expect(unfolded).toContain('Raum: A101');
    expect(unfolded).toContain('Art: Schularbeit');
    expect(unfolded).toContain('Notizen: 1. Schularbeit (Kapitel 1–3)');
    expect(unfolded).toContain('STATUS:CONFIRMED');

    // Verify VALARM block
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('ACTION:DISPLAY');
    expect(ics).toContain('DESCRIPTION:Erinnerung an Prüfung');
    expect(ics).toContain('END:VALARM');
  });

  it('supports includeAlarms: false to omit VALARM reminders from exams', () => {
    const exams: Exam[] = [
      {
        id: 8002,
        date: '2026-10-25',
        startMin: 600,
        endMin: 650,
        subject: { id: 24, name: 'INF', longName: 'Informatik' },
        teachers: [{ id: 13, name: 'BER', longName: 'Berger' }],
        rooms: [{ id: 33, name: 'LAB1' }],
        type: 'Test',
      },
    ];

    const ics = buildICalendar({
      calendarName: 'Untis+ Prüfungen',
      exams,
      includeAlarms: false,
      now: new Date('2026-10-15T07:00:00Z'),
    });

    expect(ics).toContain('UID:exam-8002@untisplus');
    expect(ics).not.toContain('BEGIN:VALARM');
    expect(ics).not.toContain('TRIGGER:-P1D');
  });

  it('generates holiday all-day events with non-inclusive end date and TRANSP:TRANSPARENT', () => {
    const holidays: Holiday[] = [
      {
        id: 1,
        name: 'Herbstferien',
        longName: 'Herbstferien 2026',
        startDate: '2026-10-26',
        endDate: '2026-10-31',
      },
      {
        id: 2,
        name: 'Staatsfeiertag',
        longName: 'Staatsfeiertag (1. Mai)',
        startDate: '2027-05-01',
        endDate: '2027-05-01',
      },
    ];

    const ics = buildICalendar({
      calendarName: 'Untis+ Ferien',
      holidays,
      now: new Date('2026-10-15T07:00:00Z'),
    });

    // Multi-day holiday: 2026-10-26 to 2026-10-31 -> non-inclusive end date is 2026-11-01
    expect(ics).toContain('UID:holiday-1@untisplus');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261026');
    expect(ics).toContain('DTEND;VALUE=DATE:20261101');
    expect(ics).toContain('SUMMARY:Ferien: Herbstferien');
    expect(ics).toContain('DESCRIPTION:Herbstferien 2026');
    expect(ics).toContain('TRANSP:TRANSPARENT');

    // Single-day holiday: 2027-05-01 to 2027-05-01 -> non-inclusive end date is 2027-05-02
    expect(ics).toContain('UID:holiday-2@untisplus');
    expect(ics).toContain('DTSTART;VALUE=DATE:20270501');
    expect(ics).toContain('DTEND;VALUE=DATE:20270502');
    expect(ics).toContain('SUMMARY:Ferien: Staatsfeiertag');
    expect(ics).toContain('TRANSP:TRANSPARENT');
  });

  it('filters events based on scope (all, timetable, exams, holidays)', () => {
    const lessons: Lesson[] = [
      {
        id: 'lesson-10',
        date: '2026-10-15',
        startMin: 480,
        endMin: 530,
        subjects: [{ id: 1, name: 'M' }],
        teachers: [{ id: 10, name: 'MUE' }],
        rooms: [{ id: 100, name: 'C5.06' }],
        klassen: [{ id: 50, name: '5AHIT' }],
        status: 'REGULAR',
      },
    ];
    const exams: Exam[] = [
      {
        id: 9001,
        date: '2026-10-20',
        startMin: 480,
        endMin: 530,
        subject: { id: 2, name: 'D' },
        teachers: [{ id: 11, name: 'HUB' }],
        rooms: [{ id: 100, name: 'C5.06' }],
      },
    ];
    const holidays: Holiday[] = [
      {
        id: 101,
        name: 'Osterferien',
        startDate: '2027-03-27',
        endDate: '2027-04-05',
      },
    ];

    const baseOptions = {
      calendarName: 'Untis+ Combined',
      lessons,
      exams,
      holidays,
      now: new Date('2026-10-15T07:00:00Z'),
    };

    // Scope 'all'
    const icsAll = buildICalendar({ ...baseOptions, scope: 'all' });
    expect(icsAll).toContain('UID:lesson-10@untisplus');
    expect(icsAll).toContain('UID:exam-9001@untisplus');
    expect(icsAll).toContain('UID:holiday-101@untisplus');

    // Scope 'timetable'
    const icsTimetable = buildICalendar({ ...baseOptions, scope: 'timetable' });
    expect(icsTimetable).toContain('UID:lesson-10@untisplus');
    expect(icsTimetable).not.toContain('UID:exam-9001@untisplus');
    expect(icsTimetable).not.toContain('UID:holiday-101@untisplus');

    // Scope 'exams'
    const icsExams = buildICalendar({ ...baseOptions, scope: 'exams' });
    expect(icsExams).not.toContain('UID:lesson-10@untisplus');
    expect(icsExams).toContain('UID:exam-9001@untisplus');
    expect(icsExams).not.toContain('UID:holiday-101@untisplus');

    // Scope 'holidays'
    const icsHolidays = buildICalendar({ ...baseOptions, scope: 'holidays' });
    expect(icsHolidays).not.toContain('UID:lesson-10@untisplus');
    expect(icsHolidays).not.toContain('UID:exam-9001@untisplus');
    expect(icsHolidays).toContain('UID:holiday-101@untisplus');
  });
});
