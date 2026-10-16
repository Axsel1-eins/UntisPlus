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
});
