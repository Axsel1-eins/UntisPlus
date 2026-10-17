import { describe, expect, it } from 'vitest';
import type { Exam, Lesson } from './types.js';
import { areExamsDuplicate, deduplicateExams, isExamForLesson, mergeExams } from './exams.js';

describe('Exam deduplication and merging', () => {
  const examA: Exam = {
    id: 101,
    date: '2026-10-20',
    startMin: 480, // 08:00
    endMin: 530,
    subject: { id: 0, name: 'AM', longName: 'Angewandte Mathematik' },
    teachers: [{ id: 1, name: 'MÜL' }],
    rooms: [{ id: 10, name: 'R101' }],
    type: 'SA_TE',
    text: '1. Schularbeit',
  };

  const examADuplicate: Exam = {
    id: 102,
    date: '2026-10-20',
    startMin: 480,
    endMin: 530,
    subject: { id: 0, name: 'AM' },
    teachers: [{ id: 2, name: 'BAU' }],
    rooms: [{ id: 11, name: 'R102' }],
    type: 'Schularbeit',
    text: '1. Schularbeit Gruppe 2',
  };

  const examB: Exam = {
    id: 201,
    date: '2026-10-20',
    startMin: 740, // 12:20
    endMin: 790,
    subject: { id: 0, name: 'NW2' },
    teachers: [],
    rooms: [],
    type: 'SA_TE',
    text: 'NW2 Test',
  };

  const examBDuplicate: Exam = {
    id: 0,
    date: '2026-10-20',
    startMin: 740,
    endMin: 790,
    subject: { id: 0, name: 'NW2' },
    teachers: [{ id: 3, name: 'HUB' }],
    rooms: [],
    type: 'Test',
    text: 'NW2 Test',
  };

  const examDifferentDay: Exam = {
    id: 301,
    date: '2026-10-21',
    startMin: 480,
    endMin: 530,
    subject: { id: 0, name: 'AM' },
    teachers: [{ id: 1, name: 'MÜL' }],
    rooms: [{ id: 10, name: 'R101' }],
    type: 'Schularbeit',
    text: 'Wiederholung',
  };

  it('identifies identical exams on the same day and hour as duplicates', () => {
    expect(areExamsDuplicate(examA, examADuplicate)).toBe(true);
    expect(areExamsDuplicate(examB, examBDuplicate)).toBe(true);
  });

  it('does not flag exams on different days or different hours as duplicates', () => {
    // Different day
    expect(areExamsDuplicate(examA, examDifferentDay)).toBe(false);
    // Same day but different hours (08:00 vs 12:20)
    expect(areExamsDuplicate(examA, examB)).toBe(false);
  });

  it('merges duplicate exams combining teachers and rooms', () => {
    const merged = mergeExams(examA, examADuplicate);
    expect(merged.id).toBe(101);
    expect(merged.date).toBe('2026-10-20');
    expect(merged.teachers.length).toBe(2);
    expect(merged.teachers.map((t) => t.name)).toEqual(['MÜL', 'BAU']);
    expect(merged.rooms.length).toBe(2);
    expect(merged.rooms.map((r) => r.name)).toEqual(['R101', 'R102']);
    expect(merged.subject?.longName).toBe('Angewandte Mathematik');
    expect(merged.type).toBe('Schularbeit');
  });

  it('deduplicates a list of exams down to unique entries', () => {
    const list = [examA, examADuplicate, examB, examBDuplicate, examDifferentDay];
    const deduplicated = deduplicateExams(list);

    expect(deduplicated.length).toBe(3);
    expect(deduplicated.some((e) => e.subject?.name === 'AM' && e.date === '2026-10-20')).toBe(true);
    expect(deduplicated.some((e) => e.subject?.name === 'NW2' && e.date === '2026-10-20')).toBe(true);
    expect(deduplicated.some((e) => e.subject?.name === 'AM' && e.date === '2026-10-21')).toBe(true);
  });

  describe('isExamForLesson', () => {
    const lessonMathPeriod1: Lesson = {
      id: '2026-10-20-480-1-10',
      date: '2026-10-20',
      startMin: 470, // 07:50 - 08:40 (Period 1)
      endMin: 520,
      subjects: [{ id: 1, name: 'AM', longName: 'Angewandte Mathematik' }],
      teachers: [{ id: 1, name: 'MÜL' }],
      rooms: [{ id: 10, name: 'R101' }],
      klassen: [{ id: 100, name: '3BHIF' }],
      status: 'REGULAR',
    };

    const lessonGermanPeriod2: Lesson = {
      id: '2026-10-20-520-2-10',
      date: '2026-10-20',
      startMin: 520, // 08:40 - 09:30 (Period 2)
      endMin: 570,
      subjects: [{ id: 2, name: 'D', longName: 'Deutsch' }],
      teachers: [{ id: 5, name: 'HUB' }],
      rooms: [{ id: 10, name: 'R101' }],
      klassen: [{ id: 100, name: '3BHIF' }],
      status: 'REGULAR',
    };

    const lessonMathPeriod6: Lesson = {
      id: '2026-10-20-740-1-10',
      date: '2026-10-20',
      startMin: 740, // 12:20 - 13:10 (Period 6)
      endMin: 790,
      subjects: [{ id: 1, name: 'AM', longName: 'Angewandte Mathematik' }],
      teachers: [{ id: 1, name: 'MÜL' }],
      rooms: [{ id: 10, name: 'R101' }],
      klassen: [{ id: 100, name: '3BHIF' }],
      status: 'REGULAR',
    };

    const lessonMathNextWeek: Lesson = {
      id: '2026-10-27-480-1-10',
      date: '2026-10-27',
      startMin: 470,
      endMin: 520,
      subjects: [{ id: 1, name: 'AM', longName: 'Angewandte Mathematik' }],
      teachers: [{ id: 1, name: 'MÜL' }],
      rooms: [{ id: 10, name: 'R101' }],
      klassen: [{ id: 100, name: '3BHIF' }],
      status: 'REGULAR',
    };

    it('matches an exam taking place during that exact lesson period', () => {
      // examA is AM on 2026-10-20 at 08:00-08:50 (Period 1)
      expect(isExamForLesson(lessonMathPeriod1, examA)).toBe(true);
    });

    it('NEVER matches an exam on the same day when scheduled at a different hour', () => {
      // German lesson at 08:40 should NOT link to Math exam at 08:00
      expect(isExamForLesson(lessonGermanPeriod2, examA)).toBe(false);

      // Afternoon Math lesson at 12:20 should NOT link to Morning Math exam at 08:00
      expect(isExamForLesson(lessonMathPeriod6, examA)).toBe(false);
    });

    it('NEVER matches an exam on a different date even if subject and hour match', () => {
      // Lesson on 2026-10-27 should NOT link to exam on 2026-10-20
      expect(isExamForLesson(lessonMathNextWeek, examA)).toBe(false);
    });

    it('matches an afternoon exam only to the afternoon lesson of that subject', () => {
      // examB is NW2 at 12:20-13:10
      const lessonNW2Period6: Lesson = {
        id: '2026-10-20-740-99-10',
        date: '2026-10-20',
        startMin: 740,
        endMin: 790,
        subjects: [{ id: 99, name: 'NW2' }],
        teachers: [{ id: 3, name: 'HUB' }],
        rooms: [],
        klassen: [],
        status: 'REGULAR',
      };
      expect(isExamForLesson(lessonNW2Period6, examB)).toBe(true);
      expect(isExamForLesson(lessonMathPeriod1, examB)).toBe(false);
    });

    it('NEVER matches single-letter subject abbreviations (e.g. E) to unrelated subjects like Deutsch or Chemie', () => {
      const lessonDeutsch: Lesson = {
        id: 'lesson-d-1',
        date: '2026-10-20',
        startMin: 470,
        endMin: 520,
        subjects: [{ id: 2, name: 'D', longName: 'Deutsch' }],
        teachers: [{ id: 5, name: 'HUB' }],
        rooms: [{ id: 10, name: 'R101' }],
        klassen: [{ id: 100, name: '3BHIF' }],
        status: 'REGULAR',
      };

      const examEnglish: Exam = {
        id: 777,
        date: '2026-10-20',
        startMin: 470,
        endMin: 520,
        subject: { id: 3, name: 'E', longName: 'Englisch' },
        teachers: [{ id: 5, name: 'HUB' }],
        rooms: [{ id: 10, name: 'R101' }],
        type: 'Schularbeit',
        text: 'Schularbeit Unit 1',
      };

      // Even though 'DEUTSCH' contains the letter 'E', and 'Schularbeit' contains 'E',
      // an English exam must NEVER match a German lesson!
      expect(isExamForLesson(lessonDeutsch, examEnglish)).toBe(false);
    });

    it('matches a short 15-minute quiz completely contained inside a 50-minute period', () => {
      const shortQuiz: Exam = {
        id: 888,
        date: '2026-10-20',
        startMin: 485, // 08:05 - 08:20 (15 min test during 07:50 - 08:40 period)
        endMin: 500,
        subject: { id: 1, name: 'AM', longName: 'Angewandte Mathematik' },
        teachers: [{ id: 1, name: 'MÜL' }],
        rooms: [{ id: 10, name: 'R101' }],
        type: 'Test',
        text: 'Kurztest Vektoren',
      };

      expect(isExamForLesson(lessonMathPeriod1, shortQuiz)).toBe(true);
    });
  });

  describe('areExamsDuplicate subject conflict guard', () => {
    it('NEVER merges two different exams in the same room at the same time', () => {
      const examMathAula: Exam = {
        id: 501,
        date: '2026-10-20',
        startMin: 480,
        endMin: 570,
        subject: { id: 1, name: 'M', longName: 'Mathematik' },
        teachers: [{ id: 1, name: 'MÜL' }],
        rooms: [{ id: 99, name: 'Aula' }],
        type: 'Schularbeit',
      };

      const examEnglishAula: Exam = {
        id: 502,
        date: '2026-10-20',
        startMin: 480,
        endMin: 570,
        subject: { id: 2, name: 'E', longName: 'Englisch' },
        teachers: [{ id: 2, name: 'BAU' }],
        rooms: [{ id: 99, name: 'Aula' }], // Shared room!
        type: 'Schularbeit',
      };

      // Sharing a room must NOT cause two different subjects to be merged as duplicates
      expect(areExamsDuplicate(examMathAula, examEnglishAula)).toBe(false);
    });
  });
});
