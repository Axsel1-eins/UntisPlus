import type { Exam, Ref } from './types.js';

/**
 * Checks if two exams refer to the exact same test occurring on the same day
 * at the same hour/period (e.g. from multiple class groups, duplicate WebUntis entries,
 * or timetable lesson changes).
 */
export function areExamsDuplicate(e1: Exam, e2: Exam): boolean {
  if (e1.date !== e2.date) return false;

  // Exact same hour / lesson period (within 30 minutes start time or overlapping time span)
  const timeDiff = Math.abs(e1.startMin - e2.startMin);
  const overlap = Math.max(0, Math.min(e1.endMin, e2.endMin) - Math.max(e1.startMin, e2.startMin));
  const isSameHour = timeDiff <= 30 || overlap > 0;
  if (!isSameHour) return false;

  const s1 = (e1.subject?.name || '').trim().toUpperCase();
  const s2 = (e2.subject?.name || '').trim().toUpperCase();
  const base1 = s1.replace(/[-_0-9].*$/, '').trim() || s1;
  const base2 = s2.replace(/[-_0-9].*$/, '').trim() || s2;

  const idMatch = Boolean(e1.subject?.id && e2.subject?.id && e1.subject.id === e2.subject.id);
  const nameMatch = Boolean(
    s1 && s2 && (s1 === s2 || (base1.length >= 2 && base1 === base2) || s1.includes(s2) || s2.includes(s1)),
  );

  const text1 = (e1.text || '').trim().toUpperCase();
  const text2 = (e2.text || '').trim().toUpperCase();
  const textAndSubjectMatch = Boolean(
    (s1 && text2 && (text2.includes(s1) || (base1.length >= 2 && text2.includes(base1)))) ||
      (s2 && text1 && (text1.includes(s2) || (base2.length >= 2 && text1.includes(base2)))),
  );
  const textMatch = Boolean(text1 && text2 && (text1 === text2 || text1.includes(text2) || text2.includes(text1)));

  const sharedTeacher = e1.teachers.some((t1) =>
    e2.teachers.some((t2) => (t1.id && t1.id === t2.id) || (t1.name && t1.name === t2.name)),
  );
  const sharedRoom = e1.rooms.some((r1) =>
    e2.rooms.some((r2) => (r1.id && r1.id === r2.id) || (r1.name && r1.name === r2.name)),
  );

  return Boolean(idMatch || nameMatch || textAndSubjectMatch || textMatch || sharedTeacher || sharedRoom);
}

/**
 * Merges two duplicate exams into a single consolidated Exam object,
 * combining teachers, rooms, and keeping the most detailed metadata.
 */
export function mergeExams(e1: Exam, e2: Exam): Exam {
  // Merge teachers without duplicates
  const mergedTeachers = [...e1.teachers];
  for (const t of e2.teachers) {
    if (
      !mergedTeachers.some(
        (existing) =>
          (existing.id && t.id && existing.id === t.id) ||
          (existing.name && t.name && existing.name.trim().toUpperCase() === t.name.trim().toUpperCase()),
      )
    ) {
      mergedTeachers.push(t);
    }
  }

  // Merge rooms without duplicates
  const mergedRooms = [...e1.rooms];
  for (const r of e2.rooms) {
    if (
      !mergedRooms.some(
        (existing) =>
          (existing.id && r.id && existing.id === r.id) ||
          (existing.name && r.name && existing.name.trim().toUpperCase() === r.name.trim().toUpperCase()),
      )
    ) {
      mergedRooms.push(r);
    }
  }

  // Choose the best subject reference (prefer longName or non-zero id)
  const s1 = e1.subject;
  const s2 = e2.subject;
  const bestSubject: Ref | undefined =
    s1?.longName && s1.longName !== s1.name
      ? s1
      : s2?.longName && s2.longName !== s2.name
        ? s2
        : s1?.id
          ? s1
          : s2?.id
            ? s2
            : s1 || s2;

  // Combine text information cleanly
  let bestText = (e1.text ?? '').trim();
  const t2 = (e2.text ?? '').trim();
  if (!bestText) {
    bestText = t2;
  } else if (t2 && t2 !== bestText && !bestText.includes(t2) && !t2.includes(bestText)) {
    bestText = `${bestText} · ${t2}`;
  }

  // Choose the more specific exam type (prefer friendly descriptive names over raw codes like SA_TE)
  const type1 = (e1.type ?? '').trim();
  const type2 = (e2.type ?? '').trim();
  const isRawCode1 = /^[A-Z0-9_]{2,8}$/.test(type1) && type1.includes('_');
  const isRawCode2 = /^[A-Z0-9_]{2,8}$/.test(type2) && type2.includes('_');
  const isGeneric1 = !type1 || /^(prüfung|exam)$/i.test(type1);
  const isGeneric2 = !type2 || /^(prüfung|exam)$/i.test(type2);

  let bestType = type1 || type2 || 'Prüfung';
  if (type1 && type2) {
    if (isRawCode1 && !isRawCode2) {
      bestType = type2;
    } else if (isRawCode2 && !isRawCode1) {
      bestType = type1;
    } else if (isGeneric1 && !isGeneric2) {
      bestType = type2;
    } else if (isGeneric2 && !isGeneric1) {
      bestType = type1;
    }
  }

  // Stable ID: prefer non-zero ID
  const stableId = e1.id && e1.id !== 0 ? e1.id : e2.id && e2.id !== 0 ? e2.id : e1.id || e2.id;

  return {
    id: stableId,
    date: e1.date,
    startMin: Math.min(e1.startMin, e2.startMin),
    endMin: Math.max(e1.endMin, e2.endMin),
    subject: bestSubject,
    teachers: mergedTeachers,
    rooms: mergedRooms,
    type: bestType,
    text: bestText || undefined,
  };
}

/**
 * Deduplicates a list of exams, merging identical tests occurring on the same day
 * at the same hour into a single entry.
 */
export function deduplicateExams(exams: Exam[]): Exam[] {
  const result: Exam[] = [];

  for (const exam of exams) {
    const existingIndex = result.findIndex((existing) => areExamsDuplicate(existing, exam));
    if (existingIndex >= 0) {
      result[existingIndex] = mergeExams(result[existingIndex]!, exam);
    } else {
      result.push({ ...exam });
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}
