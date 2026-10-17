import { describe, expect, it } from 'vitest';
import { diffLessons } from './changes.js';
import type { Lesson, Ref } from './types.js';

const ref = (id: number, name: string): Ref => ({ id, name });

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    date: '2026-10-14',
    startMin: 480,
    endMin: 530,
    subjects: [{ id: 21, name: 'D' }],
    teachers: [{ id: 11, name: 'MUE' }],
    rooms: [{ id: 31, name: 'A101' }],
    klassen: [{ id: 1, name: '3A' }],
    status: 'REGULAR',
    ...over,
  };
}

describe('diffLessons', () => {
  it('reports no changes for identical timetables', () => {
    expect(diffLessons([lesson()], [lesson()])).toEqual([]);
  });

  it('detects a new cancellation', () => {
    const next = [lesson({ status: 'CANCELLED', code: 'cancelled', substText: 'Lehrer krank' })];
    expect(diffLessons([lesson()], next)).toEqual([
      { id: 'l1', date: '2026-10-14', startMin: 480, kind: 'CANCELLED', text: 'Lehrer krank' },
    ]);
  });

  it('detects an un-cancellation', () => {
    const prev = [lesson({ status: 'CANCELLED' })];
    expect(diffLessons(prev, [lesson()])[0]?.kind).toBe('UNCANCELLED');
  });

  it('detects room and teacher changes', () => {
    const room = diffLessons([lesson()], [lesson({ rooms: [{ id: 32, name: 'A102' }] })]);
    expect(room[0]?.kind).toBe('ROOM_CHANGE');
    const teacher = diffLessons([lesson()], [lesson({ teachers: [{ id: 12, name: 'HOF' }] })]);
    expect(teacher[0]?.kind).toBe('TEACHER_CHANGE');
  });

  it('detects a time change', () => {
    expect(diffLessons([lesson()], [lesson({ startMin: 495, endMin: 545 })])[0]?.kind).toBe(
      'TIME_CHANGE',
    );
  });

  it('detects a substitution note change', () => {
    expect(diffLessons([lesson()], [lesson({ substText: 'Vertretung' })])[0]?.kind).toBe(
      'SUBSTITUTION',
    );
  });

  it('detects added and removed lessons', () => {
    const l2 = lesson({ id: 'l2', startMin: 600, endMin: 650 });
    const added = diffLessons([lesson()], [lesson(), l2]);
    expect(added.map((c) => c.kind)).toEqual(['ADDED']);
    const removed = diffLessons([lesson(), l2], [lesson()]);
    expect(removed.map((c) => c.kind)).toEqual(['REMOVED']);
  });

  it('sorts changes by date and time', () => {
    const a = lesson({ id: 'a', date: '2026-10-15', startMin: 500, status: 'CANCELLED' });
    const b = lesson({ id: 'b', date: '2026-10-14', startMin: 600, status: 'CANCELLED' });
    const changes = diffLessons([lesson({ id: 'a' }), lesson({ id: 'b' })], [a, b]);
    expect(changes.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('cancellation wins over a simultaneous room change', () => {
    const next = [lesson({ status: 'CANCELLED', rooms: [{ id: 99, name: 'X' }] })];
    expect(diffLessons([lesson()], next)[0]?.kind).toBe('CANCELLED');
  });

  it('detects ROOM_CHANGE even when lesson.id changes due to room-embedded lesson keys', () => {
    const before = lesson({
      id: '2026-10-14-480-21-31',
      rooms: [{ id: 31, name: 'A101' }],
    });
    const after = lesson({
      id: '2026-10-14-480-21-32', // Generated ID changed because room changed!
      rooms: [{ id: 32, name: 'A102' }],
    });

    const diff = diffLessons([before], [after]);
    expect(diff.length).toBe(1);
    expect(diff[0]?.kind).toBe('ROOM_CHANGE');
    expect(diff[0]?.id).toBe('2026-10-14-480-21-32');
  });
});
