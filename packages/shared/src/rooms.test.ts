import { describe, expect, it } from 'vitest';
import {
  classifyRoom,
  computeRoomOccupancy,
  type RoomCategory,
} from './rooms.js';
import type { Lesson, Ref, TimeGridSlot } from './types.js';

describe('Room classification & occupancy', () => {
  it('correctly categorizes rooms into computer labs, gyms, special, and regular', () => {
    expect(classifyRoom({ id: 1, name: 'EDV1' })).toBe<RoomCategory>('computer');
    expect(classifyRoom({ id: 2, name: 'LAB-INF', longName: 'Informatik Labor' })).toBe<RoomCategory>('computer');
    expect(classifyRoom({ id: 3, name: 'TH1', longName: 'Turnhalle groß' })).toBe<RoomCategory>('gym');
    expect(classifyRoom({ id: 4, name: 'PHY', longName: 'Physiksaal' })).toBe<RoomCategory>('special');
    expect(classifyRoom({ id: 5, name: 'C5.06', longName: 'Standardklasse 5A' })).toBe<RoomCategory>('regular');
  });

  it('computes free and occupied slots and current status for rooms', () => {
    const rooms: Ref[] = [
      { id: 10, name: 'A101', longName: 'Classroom A101' },
      { id: 20, name: 'EDV3', longName: 'Computer Lab 3' },
    ];

    const timeGrid: TimeGridSlot[] = [
      { name: '1', startMin: 480, endMin: 530 }, // 08:00 - 08:50
      { name: '2', startMin: 535, endMin: 585 }, // 08:55 - 09:45
      { name: '3', startMin: 605, endMin: 655 }, // 10:05 - 10:55
    ];

    const lessons: Lesson[] = [
      {
        id: 'l1',
        date: '2026-10-15',
        startMin: 480,
        endMin: 530,
        subjects: [{ id: 1, name: 'M' }],
        teachers: [{ id: 2, name: 'MUE' }],
        rooms: [{ id: 10, name: 'A101' }],
        klassen: [{ id: 5, name: '3AHIT' }],
        status: 'REGULAR',
      },
      // Cancelled lesson should NOT mark room as occupied
      {
        id: 'l2',
        date: '2026-10-15',
        startMin: 535,
        endMin: 585,
        subjects: [{ id: 2, name: 'D' }],
        teachers: [{ id: 3, name: 'HUB' }],
        rooms: [{ id: 10, name: 'A101' }],
        klassen: [{ id: 5, name: '3AHIT' }],
        status: 'CANCELLED',
      },
      {
        id: 'l3',
        date: '2026-10-15',
        startMin: 605,
        endMin: 655,
        subjects: [{ id: 3, name: 'INF' }],
        teachers: [{ id: 4, name: 'SCH' }],
        rooms: [{ id: 20, name: 'EDV3' }],
        klassen: [{ id: 5, name: '3AHIT' }],
        status: 'REGULAR',
      },
    ];

    // At 08:30 (min 510)
    const occAt830 = computeRoomOccupancy(rooms, timeGrid, lessons, 510);
    const a101 = occAt830.find((r) => r.room.id === 10)!;
    const edv3 = occAt830.find((r) => r.room.id === 20)!;

    // A101 should be occupied in period 1, free in period 2 (cancelled) and 3
    expect(a101.occupiedNow).toBe(true);
    expect(a101.isFreeNow).toBe(false);
    expect(a101.currentLesson?.subject).toBe('M');
    expect(a101.slots[0]?.occupied).toBe(true);
    expect(a101.slots[1]?.occupied).toBe(false); // cancelled, so free
    expect(a101.slots[2]?.occupied).toBe(false);

    // EDV3 should be free at 08:30, but occupied in period 3 (free until 10:05)
    expect(edv3.occupiedNow).toBe(false);
    expect(edv3.isFreeNow).toBe(true);
    expect(edv3.freeUntilFormatted).toBe('10:05');
    expect(edv3.slots[0]?.occupied).toBe(false);
    expect(edv3.slots[1]?.occupied).toBe(false);
    expect(edv3.slots[2]?.occupied).toBe(true);
  });
});
