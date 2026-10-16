import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElementType, type Lesson } from '@untisplus/shared';
import {
  getCachedWeekLessons,
  prefetchSurroundingWeeks,
  setCachedWeekLessons,
} from './timetable_cache.js';
import { api } from './api.js';

describe('timetable_cache module', () => {
  const fakeTarget = { id: 14356, type: ElementType.Student, label: 'Test Student' };
  const fakeLessons: Lesson[] = [
    {
      id: 'l1',
      date: '2026-10-19',
      startMin: 480,
      endMin: 530,
      subjects: [{ id: 1, name: 'M' }],
      teachers: [{ id: 10, name: 'SCHM' }],
      rooms: [{ id: 100, name: 'R101' }],
      klassen: [{ id: 501, name: '4AHIT' }],
      status: 'REGULAR',
    },
  ];

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('stores and retrieves cached week lessons synchronously (0ms render)', () => {
    expect(getCachedWeekLessons(fakeTarget, '2026-10-19')).toBeNull();

    setCachedWeekLessons(fakeTarget, '2026-10-19', fakeLessons);

    const cached = getCachedWeekLessons(fakeTarget, '2026-10-19');
    expect(cached).not.toBeNull();
    expect(cached?.length).toBe(1);
    expect(cached?.[0]?.id).toBe('l1');
    expect(cached?.[0]?.subjects[0]?.name).toBe('M');
  });

  it('prefetches previous week (W-1) and next week (W+1) in background', async () => {
    const timetableSpy = vi.spyOn(api, 'timetable').mockResolvedValue({ lessons: fakeLessons });

    prefetchSurroundingWeeks(fakeTarget, '2026-10-19');

    // Expected surrounding weeks:
    // W-1: 2026-10-12
    // W+1: 2026-10-26
    expect(timetableSpy).toHaveBeenCalledWith('2026-10-12', '2026-10-18', {
      id: fakeTarget.id,
      type: 'student',
    });
    expect(timetableSpy).toHaveBeenCalledWith('2026-10-26', '2026-11-01', {
      id: fakeTarget.id,
      type: 'student',
    });

    timetableSpy.mockRestore();
  });
});
