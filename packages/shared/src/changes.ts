import type { Lesson } from './types.js';

export type ChangeKind =
  | 'CANCELLED'
  | 'UNCANCELLED'
  | 'ROOM_CHANGE'
  | 'TEACHER_CHANGE'
  | 'TIME_CHANGE'
  | 'SUBSTITUTION'
  | 'ADDED'
  | 'REMOVED';

/**
 * A single detected change between two snapshots of a timetable.
 *
 * This is the heart of the "don't miss a substitution" promise: rather than relying on a push
 * channel, Untis+ diffs the timetable it already has and reports what actually changed.
 */
export interface LessonChange {
  /** Stable identity of the affected lesson (from the newer snapshot). */
  id: string;
  date: string;
  startMin: number;
  kind: ChangeKind;
  /** Raw substitution note, if the source lesson carried one. */
  text?: string;
}

function sameRefs(a: { id: number }[], b: { id: number }[]): boolean {
  if (a.length !== b.length) return false;
  const av = a.map((r) => r.id).sort((x, y) => x - y);
  const bv = b.map((r) => r.id).sort((x, y) => x - y);
  return av.every((id, i) => id === bv[i]);
}

function compare(prev: Lesson, next: Lesson): LessonChange | null {
  const base = { id: next.id, date: next.date, startMin: next.startMin };

  const wasCancelled = prev.status === 'CANCELLED' || prev.code === 'cancelled';
  const isCancelledNow = next.status === 'CANCELLED' || next.code === 'cancelled';
  if (!wasCancelled && isCancelledNow) return { ...base, kind: 'CANCELLED', text: next.substText };
  if (wasCancelled && !isCancelledNow) return { ...base, kind: 'UNCANCELLED' };

  if (!sameRefs(prev.rooms, next.rooms)) return { ...base, kind: 'ROOM_CHANGE' };
  if (!sameRefs(prev.teachers, next.teachers)) return { ...base, kind: 'TEACHER_CHANGE' };
  if (prev.startMin !== next.startMin || prev.endMin !== next.endMin) {
    return { ...base, kind: 'TIME_CHANGE' };
  }
  if ((prev.substText ?? '') !== (next.substText ?? '')) {
    return { ...base, kind: 'SUBSTITUTION', text: next.substText };
  }
  return null;
}

/**
 * Diff two timetables captured over the same window. Returns one entry per changed lesson.
 * A lesson present only in `next` is `ADDED`; one gone from `next` is `REMOVED`.
 */
export function diffLessons(prev: Lesson[], next: Lesson[]): LessonChange[] {
  const prevById = new Map(prev.map((l) => [l.id, l]));
  const nextById = new Map(next.map((l) => [l.id, l]));
  const changes: LessonChange[] = [];

  for (const l of next) {
    const before = prevById.get(l.id);
    if (!before) {
      changes.push({ id: l.id, date: l.date, startMin: l.startMin, kind: 'ADDED' });
      continue;
    }
    const c = compare(before, l);
    if (c) changes.push(c);
  }
  for (const l of prev) {
    if (!nextById.has(l.id)) {
      changes.push({ id: l.id, date: l.date, startMin: l.startMin, kind: 'REMOVED' });
    }
  }

  return changes.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}
