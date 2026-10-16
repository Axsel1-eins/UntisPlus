import { describe, expect, it } from 'vitest';
import { ElementType, type Lesson, type TimeGridSlot } from '@untisplus/shared';
import { SchoolIndexer } from './school_index.js';
import type { WebUntisClient } from './client.js';

describe('SchoolIndexer', () => {
  it('harvests teachers and rooms from class schedules and reconstructs teacher timetables', async () => {
    const indexer = new SchoolIndexer();

    const mockLesson1: Lesson = {
      id: 'l1',
      date: '2026-10-14',
      startMin: 480,
      endMin: 530,
      status: 'REGULAR',
      klassen: [{ id: 1, name: '3BHIF' }],
      teachers: [{ id: 101, name: 'STAN', longName: 'STANEK' }],
      rooms: [{ id: 201, name: 'N306', longName: 'EDV 1' }],
      subjects: [{ id: 7, name: 'AM' }],
    };

    const mockLesson2: Lesson = {
      id: 'l2',
      date: '2026-10-14',
      startMin: 535,
      endMin: 585,
      status: 'REGULAR',
      klassen: [{ id: 2, name: '4AHIT' }],
      teachers: [{ id: 102, name: 'WEIX', longName: 'WEIXLBAUM' }],
      rooms: [{ id: 201, name: 'N306', longName: 'EDV 1' }],
      subjects: [{ id: 8, name: 'WMC' }],
    };

    const mockClient = {
      getTimetable: async (target: { id: number; type: number }) => {
        if (target.id === 1) return [mockLesson1];
        if (target.id === 2) return [mockLesson2];
        return [];
      },
    } as unknown as WebUntisClient;

    const klassen = [
      { id: 1, name: '3BHIF' },
      { id: 2, name: '4AHIT' },
    ];

    await indexer.harvest(mockClient, klassen, { start: '2026-10-14', end: '2026-10-14' });

    // Verify discovered teachers
    const teachers = indexer.getTeachers();
    expect(teachers.length).toBe(2);
    expect(teachers[0]?.name).toBe('STAN');
    expect(teachers[1]?.name).toBe('WEIX');

    // Verify discovered rooms
    const rooms = indexer.getRooms();
    expect(rooms.length).toBe(1);
    expect(rooms[0]?.name).toBe('N306');

    // Verify teacher timetable lookup for STAN (id 101)
    const stanLessons = indexer.getTeacherLessons(101, '2026-10-14', '2026-10-14');
    expect(stanLessons.length).toBe(1);
    expect(stanLessons[0]?.id).toBe('l1');

    // Verify room occupancy calculation
    const grid: TimeGridSlot[] = [
      { name: '1', startMin: 480, endMin: 530 },
      { name: '2', startMin: 535, endMin: 585 },
      { name: '3', startMin: 605, endMin: 655 },
    ];

    const occs = indexer.getRoomOccupancy('2026-10-14', rooms, grid, 500);
    expect(occs.length).toBe(1);
    const n306 = occs[0]!;
    expect(n306.room.name).toBe('N306');
    expect(n306.slots[0]?.occupied).toBe(true);
    expect(n306.slots[1]?.occupied).toBe(true);
    expect(n306.slots[2]?.occupied).toBe(false);
  });
});
