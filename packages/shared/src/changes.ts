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
  subject?: string;
  room?: string;
  teacher?: string;
  reason?: string;
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
  const matchedPrevIds = new Set<string>();
  const unmatchedNext: Lesson[] = [];
  const changes: LessonChange[] = [];

  // Step 1: Match exact IDs first (fast path)
  for (const l of next) {
    const before = prevById.get(l.id);
    if (before) {
      matchedPrevIds.add(before.id);
      const c = compare(before, l);
      if (c) changes.push(c);
    } else {
      unmatchedNext.push(l);
    }
  }

  // Step 2: Unmatched lessons may have changed rooms, teachers, or times (which alters their generated ID)
  const remainingPrev = prev.filter((p) => !matchedPrevIds.has(p.id));

  for (const n of unmatchedNext) {
    // Find best candidate in remainingPrev on the same day
    const candidateIdx = remainingPrev.findIndex((p) => {
      if (p.date !== n.date) return false;
      const sameSubj = sameRefs(p.subjects, n.subjects);
      const sameTeach = sameRefs(p.teachers, n.teachers);
      const sameTime = p.startMin === n.startMin && p.endMin === n.endMin;
      const timeNearby = Math.abs(p.startMin - n.startMin) <= 120;

      // Same time & subject (room or teacher changed)
      if (sameTime && sameSubj) return true;
      // Same subject & teacher/group, time shifted
      if (timeNearby && sameSubj && (sameTeach || sameRefs(p.klassen, n.klassen))) return true;
      // Same time & teacher/group, substitution note / subject change
      if (sameTime && sameTeach && sameRefs(p.klassen, n.klassen)) return true;

      return false;
    });

    if (candidateIdx >= 0) {
      const p = remainingPrev[candidateIdx]!;
      remainingPrev.splice(candidateIdx, 1);
      const c = compare(p, n);
      if (c) {
        changes.push(c);
      }
    } else {
      changes.push({ id: n.id, date: n.date, startMin: n.startMin, kind: 'ADDED' });
    }
  }

  // Step 3: Remaining prev lessons that were never matched are truly removed
  for (const p of remainingPrev) {
    changes.push({ id: p.id, date: p.date, startMin: p.startMin, kind: 'REMOVED' });
  }

  return changes.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}
