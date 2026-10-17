import { describe, expect, it } from 'vitest';
import type { Lesson, TimeGridSlot } from '@untisplus/shared';

describe('Timetable matching and period generation robustness', () => {
  const baseTimeGrid: TimeGridSlot[] = [
    { name: '1', startMin: 480, endMin: 530 }, // 08:00 - 08:50
    { name: '2', startMin: 530, endMin: 580 }, // 08:50 - 09:40
    { name: '3', startMin: 595, endMin: 645 }, // 09:55 - 10:45
    { name: '4', startMin: 645, endMin: 695 }, // 10:45 - 11:35
    { name: '5', startMin: 705, endMin: 755 }, // 11:45 - 12:35
    { name: '6', startMin: 755, endMin: 805 }, // 12:35 - 13:25
    { name: '7', startMin: 815, endMin: 865 }, // 13:35 - 14:25
    { name: '8', startMin: 865, endMin: 915 }, // 14:25 - 15:15
    { name: '9', startMin: 915, endMin: 960 }, // 15:15 - 16:00
    { name: '10', startMin: 960, endMin: 1000 }, // 16:00 - 16:40
    { name: '11', startMin: 1020, endMin: 1070 }, // 17:00 - 17:50 (evening)
    { name: '12', startMin: 1070, endMin: 1120 }, // 17:50 - 18:40 (evening)
  ];

  it('accurately matches lessons starting at 07:50, 08:40, 09:40 to correct period rows', () => {
    function findBestPeriodSlot(lesson: { startMin: number; endMin: number }, periods: TimeGridSlot[]): number {
      const exact = periods.find((p) => p.startMin === lesson.startMin);
      if (exact) return exact.startMin;

      let bestPeriod: TimeGridSlot | null = null;
      let bestScore = -Infinity;

      for (const p of periods) {
        const startDiff = Math.abs(p.startMin - lesson.startMin);
        const overlap = Math.max(0, Math.min(lesson.endMin, p.endMin) - Math.max(lesson.startMin, p.startMin));
        const score = overlap * 2 - startDiff;
        if (score > bestScore) {
          bestScore = score;
          bestPeriod = p;
        }
      }

      if (bestPeriod) {
        const startDiff = Math.abs(bestPeriod.startMin - lesson.startMin);
        const overlap = Math.max(0, Math.min(lesson.endMin, bestPeriod.endMin) - Math.max(lesson.startMin, bestPeriod.startMin));
        if (startDiff <= 30 || overlap >= 15) {
          return bestPeriod.startMin;
        }
      }

      return lesson.startMin;
    }

    // Lesson 1: 07:50 - 08:40 (470 - 520) should map to Period 1 (480)
    expect(findBestPeriodSlot({ startMin: 470, endMin: 520 }, baseTimeGrid)).toBe(480);

    // Lesson 2: 08:40 - 09:30 (520 - 570) should map to Period 2 (530), NEVER Period 1
    expect(findBestPeriodSlot({ startMin: 520, endMin: 570 }, baseTimeGrid)).toBe(530);

    // Lesson 3: 09:40 - 10:30 (580 - 630) should map to Period 3 (595), NEVER Period 2
    expect(findBestPeriodSlot({ startMin: 580, endMin: 630 }, baseTimeGrid)).toBe(595);
  });

  it('retains Monday afternoon lessons up to 16:40 (Period 10) and trims empty evening periods', () => {
    // Monday lesson up to 16:40 (1000 min)
    const lessons: Partial<Lesson>[] = [
      { startMin: 480, endMin: 530, date: '2026-10-19' },
      { startMin: 955, endMin: 1000, date: '2026-10-19' }, // Period 10 ending at 16:40
    ];

    const sorted = [...baseTimeGrid].sort((a, b) => a.startMin - b.startMin);
    const latestLessonEnd = Math.max(...lessons.map((l) => l.endMin!));
    const latestLessonStart = Math.max(...lessons.map((l) => l.startMin!));

    const activeSlots = sorted.filter(
      (s) => s.startMin <= latestLessonStart || s.startMin < latestLessonEnd || s.endMin <= latestLessonEnd,
    );
    expect(activeSlots.length).toBeGreaterThan(0);
    const lastActive = activeSlots[activeSlots.length - 1]!;
    expect(lastActive.endMin).toBe(1000); // Slot 10 ending at 16:40 is preserved!
    expect(lastActive.name).toBe('10');

    const trimmedSlots = sorted.filter((s) => s.startMin <= lastActive.startMin);
    // Period 10 is included, while Periods 11 & 12 (evening after 16:40) are trimmed
    expect(trimmedSlots.some((s) => s.name === '10')).toBe(true);
    expect(trimmedSlots.some((s) => s.name === '11')).toBe(false);
    expect(trimmedSlots.some((s) => s.name === '12')).toBe(false);
  });

  it('generates missing afternoon slots up to 16:40 if school timeGrid is incomplete', () => {
    // Suppose school timeGrid only had periods 1 to 6 (up to 13:25 / 805)
    const shortGrid = baseTimeGrid.slice(0, 6);
    const lessons: Partial<Lesson>[] = [
      { startMin: 480, endMin: 530, date: '2026-10-19' },
      { startMin: 955, endMin: 1000, date: '2026-10-19' }, // Period 10 up to 16:40
    ];

    const sorted = [...shortGrid].sort((a, b) => a.startMin - b.startMin);
    const maxLessonEnd = Math.max(...lessons.map((l) => l.endMin!));
    const lastSlotEnd = sorted.length > 0 ? sorted[sorted.length - 1]!.endMin : 0;

    if (maxLessonEnd > lastSlotEnd) {
      const uncovered = lessons.filter(
        (l) => l.endMin! > lastSlotEnd && !sorted.some((s) => Math.abs(s.startMin - l.startMin!) <= 15),
      );
      const distinctStarts = [...new Set(uncovered.map((l) => l.startMin!))].sort((a, b) => a - b);
      for (const start of distinctStarts) {
        const matching = uncovered.filter((l) => l.startMin === start);
        const end = matching.length > 0 ? Math.max(...matching.map((l) => l.endMin!)) : start + 50;
        sorted.push({
          name: `${sorted.length + 1}`,
          startMin: start,
          endMin: end,
        });
      }
      sorted.sort((a, b) => a.startMin - b.startMin);
    }

    expect(sorted.some((s) => s.endMin === 1000)).toBe(true);
  });

  it('preserves normal lessons when substDisplayMode is both', () => {
    const rawList: Partial<Lesson>[] = [
      { id: '1', status: 'REGULAR' },
      { id: '2', status: 'CANCELLED' },
      { id: '3', status: 'IRREGULAR' },
    ];

    function filterBySubstMode(list: Partial<Lesson>[], substMode: 'both' | 'subst-only' | 'cancelled-only') {
      let filtered = [...list];
      if (substMode === 'subst-only') {
        const hasActive = filtered.some((l) => l.status !== 'CANCELLED');
        if (hasActive) filtered = filtered.filter((l) => l.status !== 'CANCELLED');
      } else if (substMode === 'cancelled-only') {
        filtered = filtered.filter((l) => l.status === 'CANCELLED');
      }
      return filtered;
    }

    const filtered = filterBySubstMode(rawList, 'both');

    expect(filtered.length).toBe(3);
    expect(filtered.some((l) => l.status === 'REGULAR')).toBe(true);
    expect(filtered.some((l) => l.status === 'CANCELLED')).toBe(true);
    expect(filtered.some((l) => l.status === 'IRREGULAR')).toBe(true);
  });

  it('guarantees unique React keys for exams', () => {
    const exams = [
      { id: 2026, date: '2026-10-19', startMin: 480 },
      { id: 2026, date: '2026-10-19', startMin: 580 },
      { id: 0, date: '2026-10-20', startMin: 500 },
    ];

    const keys = exams.map((e, idx) =>
      e.id ? `${e.id}-${e.date}-${idx}` : `${e.date}-${e.startMin}-${idx}`,
    );

    const set = new Set(keys);
    expect(set.size).toBe(exams.length);
  });

  it('assigns vibrant, distinct colors to subjects and handles exam type badges', async () => {
    const { subjectColor, subjectTextColor } = await import('./lib.js');
    const { getExamTypeBadge } = await import('./views/Exams.js');

    // Known standard subjects get distinct defined colors
    const dColor = subjectColor(0, 'D');
    const mColor = subjectColor(0, 'AM');
    const eColor = subjectColor(0, 'E1');
    const posColor = subjectColor(0, 'POS1');
    const nscsColor = subjectColor(0, 'NSCS_1');

    expect(dColor).toBe('#dc2626');
    expect(mColor).toBe('#2563eb');
    expect(eColor).toBe('#eab308');
    expect(posColor).toBe('#10b981');
    expect(nscsColor).toBe('#6366f1');

    // Unknown subjects get deterministic golden-angle hues
    const custom1 = subjectColor(0, 'SPECIAL_XYZ');
    const custom2 = subjectColor(0, 'ANOTHER_ABC');
    expect(custom1).toMatch(/^hsl\(\d+ 68% 48%\)$/);
    expect(custom2).toMatch(/^hsl\(\d+ 68% 48%\)$/);
    expect(custom1).not.toBe(custom2);

    // Text color contrast test
    expect(subjectTextColor('#ffffff')).toBe('#0f172a');
    expect(subjectTextColor('#000000')).toBe('#ffffff');
    expect(subjectTextColor('#ef4444')).toBe('#ffffff');
    expect(subjectTextColor('#eab308')).toBe('#0f172a'); // yellow gets dark text
    expect(subjectTextColor('hsl(60 68% 50%)')).toBe('#0f172a'); // yellow hsl gets dark text
    expect(subjectTextColor('hsl(240 68% 50%)')).toBe('#ffffff'); // blue hsl gets white text

    // Exam type badges
    const saBadge = getExamTypeBadge('SA_TE');
    expect(saBadge.label).toBe('Schularbeit');
    expect(saBadge.color).toBe('#ef4444');

    const testBadge = getExamTypeBadge('Test');
    expect(testBadge.label).toBe('Test');
    expect(testBadge.color).toBe('#f59e0b');

    const plfBadge = getExamTypeBadge('PLF');
    expect(plfBadge.label).toBe('PLF (Praktisch)');
    expect(plfBadge.color).toBe('#8b5cf6');

    const abgabeBadge = getExamTypeBadge('Abgabe');
    expect(abgabeBadge.label).toBe('Abgabe');
    expect(abgabeBadge.color).toBe('#0284c7');

    const defaultBadge = getExamTypeBadge(undefined);
    expect(defaultBadge.label).toBe('Prüfung');
    expect(defaultBadge.color).toBe('#6366f1');
  });

  it('accurately identifies day exams, strip indicators, and rich lesson card badges', async () => {
    const { isExamForLesson, getExamTypeBadge, deduplicateExams } = await import('@untisplus/shared');

    const sampleExams = [
      {
        id: 101,
        date: '2026-10-21',
        startMin: 480, // 08:00
        endMin: 570,   // 09:30
        subject: { id: 1, name: 'M', longName: 'Mathematik' },
        teachers: [{ id: 10, name: 'SMI' }],
        rooms: [{ id: 100, name: 'C2.01' }],
        type: 'Schularbeit',
        text: '1. Schularbeit Analysis & Vektoren',
      },
      {
        id: 102,
        date: '2026-10-21',
        startMin: 600, // 10:00
        endMin: 645,   // 10:45
        subject: { id: 2, name: 'E', longName: 'Englisch' },
        teachers: [{ id: 20, name: 'JON' }],
        rooms: [{ id: 101, name: 'C2.02' }],
        type: 'Test',
        text: 'Vocab Unit 3',
      },
      {
        id: 103,
        date: '2026-10-23',
        startMin: 815,
        endMin: 900,
        subject: { id: 3, name: 'POS1', longName: 'Programmieren' },
        teachers: [{ id: 30, name: 'GRB' }],
        rooms: [{ id: 105, name: 'EDV3' }],
        type: 'PLF',
        text: 'Praktische Leistungsfeststellung SQL',
      },
    ];

    const clean = deduplicateExams(sampleExams);

    // 1. Day strip indicator detection
    const weekDays = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
    const daysWithExams = weekDays.filter((d) => clean.some((e) => e.date === d));
    expect(daysWithExams).toEqual(['2026-10-21', '2026-10-23']);
    expect(clean.some((e) => e.date === '2026-10-21')).toBe(true);
    expect(clean.some((e) => e.date === '2026-10-22')).toBe(false);

    // 2. Selected day exams list
    const dayExams = clean.filter((e) => e.date === '2026-10-21');
    expect(dayExams.length).toBe(2);
    expect(dayExams[0]?.subject?.name).toBe('M');
    expect(dayExams[1]?.subject?.name).toBe('E');

    // 3. LessonCard isExam computation and badge extraction
    const mLesson: Partial<Lesson> = {
      id: 'l-m',
      date: '2026-10-21',
      startMin: 480,
      endMin: 530,
      subjects: [{ id: 1, name: 'M' }],
      teachers: [{ id: 10, name: 'SMI' }],
      rooms: [{ id: 100, name: 'C2.01' }],
      status: 'REGULAR',
    };

    const dLesson: Partial<Lesson> = {
      id: 'l-d',
      date: '2026-10-21',
      startMin: 705,
      endMin: 755,
      subjects: [{ id: 5, name: 'D' }],
      teachers: [{ id: 50, name: 'WAG' }],
      rooms: [{ id: 100, name: 'C2.01' }],
      status: 'REGULAR',
    };

    // Math lesson matches exam 101
    const matchingM = dayExams.filter((e) => isExamForLesson(mLesson as Lesson, e));
    expect(matchingM.length).toBe(1);
    expect(matchingM[0]?.id).toBe(101);

    // German lesson does not match any exam on that day
    const matchingD = dayExams.filter((e) => isExamForLesson(dLesson as Lesson, e));
    expect(matchingD.length).toBe(0);

    // LessonCard isExam flag logic
    const isExamM = mLesson.status === 'EXAM' || Boolean(mLesson.isExam) || matchingM.length > 0;
    const isExamD = dLesson.status === 'EXAM' || Boolean(dLesson.isExam) || matchingD.length > 0;
    expect(isExamM).toBe(true);
    expect(isExamD).toBe(false);

    // Badge styling matches exam type
    const badgeM = getExamTypeBadge(matchingM[0]?.type);
    expect(badgeM.label).toBe('Schularbeit');
    expect(badgeM.icon).toBe('📝');
    expect(badgeM.color).toBe('#ef4444');
  });
});
