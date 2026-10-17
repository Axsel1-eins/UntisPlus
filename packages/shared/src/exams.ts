import type { Exam, Lesson, Ref } from './types.js';

export interface ExamTypeBadge {
  label: string;
  color: string;
  icon: string;
}

/**
 * Returns a standardized badge configuration with distinctive color and emoji icon
 * based on exam type classification.
 */
export function getExamTypeBadge(rawType?: string): ExamTypeBadge {
  const norm = (rawType ?? '').trim().toUpperCase();
  if (norm.startsWith('SA') || norm.includes('SCHULARBEIT')) {
    return {
      label: rawType && !rawType.startsWith('SA_') ? rawType : 'Schularbeit',
      color: '#ef4444',
      icon: '📝',
    };
  }
  if (norm.includes('ABGABE') || norm.includes('PROJEKT')) {
    return {
      label: rawType || 'Abgabe',
      color: '#0284c7',
      icon: '📦',
    };
  }
  if (norm.includes('PLF') || norm.includes('PRAKTISCH')) {
    return {
      label: rawType === 'PLF' ? 'PLF (Praktisch)' : (rawType || 'PLF (Praktisch)'),
      color: '#8b5cf6',
      icon: '🛠️',
    };
  }
  if (norm.includes('SMÜ') || norm.includes('MÜNDLICH') || norm.includes('MITARBEIT')) {
    return {
      label: rawType || 'Mündlich / SMÜ',
      color: '#10b981',
      icon: '🗣️',
    };
  }
  if (norm.includes('TEST') || norm.includes('FACHPRÜFUNG')) {
    return {
      label: rawType || 'Test',
      color: '#f59e0b',
      icon: '⏱️',
    };
  }
  return {
    label: rawType || 'Prüfung',
    color: '#6366f1',
    icon: '🎓',
  };
}


function matchesSubjectToken(container: string, token: string): boolean {
  if (!container || !token) return false;
  if (container === token) return true;
  // If token is at least 3 characters and container contains it as substring
  if (token.length >= 3 && container.includes(token)) return true;
  // Match as discrete word boundary for short abbreviations (e.g. "E" in "Klasse 1A - E")
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^A-Z0-9ÄÖÜ])${escaped}([^A-Z0-9ÄÖÜ]|$)`, 'i');
  return re.test(container);
}

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

  const idMatch = Boolean(e1.subject?.id && e2.subject?.id && e1.subject.id === e2.subject.id && e1.subject.id > 0);
  const nameMatch = Boolean(
    s1 &&
      s2 &&
      (s1 === s2 ||
        (base1.length >= 2 && base1 === base2) ||
        (s1.length >= 3 && s2.length >= 3 && (s1.includes(s2) || s2.includes(s1)))),
  );

  const text1 = (e1.text || '').trim().toUpperCase();
  const text2 = (e2.text || '').trim().toUpperCase();
  const textAndSubjectMatch = Boolean(
    (s1 && text2 && (matchesSubjectToken(text2, s1) || (base1.length >= 2 && matchesSubjectToken(text2, base1)))) ||
      (s2 && text1 && (matchesSubjectToken(text1, s2) || (base2.length >= 2 && matchesSubjectToken(text1, base2)))),
  );
  const textMatch = Boolean(
    text1 && text2 && (text1 === text2 || (text1.length >= 5 && text2.length >= 5 && (text1.includes(text2) || text2.includes(text1)))),
  );

  const hasSubjectMatch = idMatch || nameMatch || textAndSubjectMatch;

  // If both exams explicitly have subjects, but they do NOT match,
  // they are definitely different exams (e.g. Math vs English in same room or supervised by same teacher).
  // Do NOT merge them!
  if (s1 && s2 && !hasSubjectMatch) {
    return false;
  }

  const e1Teachers = e1.teachers ?? [];
  const e2Teachers = e2.teachers ?? [];
  const sharedTeacher = e1Teachers.some((t1) =>
    e2Teachers.some(
      (t2) =>
        (t1.id && t2.id && t1.id === t2.id && t1.id > 0) ||
        (t1.name && t2.name && t1.name.trim().toUpperCase() === t2.name.trim().toUpperCase()),
    ),
  );

  const e1Rooms = e1.rooms ?? [];
  const e2Rooms = e2.rooms ?? [];
  const sharedRoom = e1Rooms.some((r1) =>
    e2Rooms.some(
      (r2) =>
        (r1.id && r2.id && r1.id === r2.id && r1.id > 0) ||
        (r1.name && r2.name && r1.name.trim().toUpperCase() === r2.name.trim().toUpperCase()),
    ),
  );

  return Boolean(
    hasSubjectMatch ||
      (textMatch && (sharedTeacher || sharedRoom || !s1 || !s2)) ||
      ((!s1 || !s2) && (sharedTeacher || sharedRoom)),
  );
}

/**
 * Merges two duplicate exams into a single consolidated Exam object,
 * combining teachers, rooms, and keeping the most detailed metadata.
 */
export function mergeExams(e1: Exam, e2: Exam): Exam {
  // Merge teachers without duplicates
  const mergedTeachers = [...(e1.teachers ?? [])];
  for (const t of e2.teachers ?? []) {
    if (
      !mergedTeachers.some(
        (existing) =>
          (existing.id && t.id && existing.id === t.id && existing.id > 0) ||
          (existing.name && t.name && existing.name.trim().toUpperCase() === t.name.trim().toUpperCase()),
      )
    ) {
      mergedTeachers.push(t);
    }
  }

  // Merge rooms without duplicates
  const mergedRooms = [...(e1.rooms ?? [])];
  for (const r of e2.rooms ?? []) {
    if (
      !mergedRooms.some(
        (existing) =>
          (existing.id && r.id && existing.id === r.id && existing.id > 0) ||
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

/**
 * Checks whether an exam belongs to a specific lesson.
 * Matches strictly on the same date, overlapping time window (or matching period start),
 * and corresponding subject, teacher, or room.
 */
export function isExamForLesson(lesson: Lesson, exam: Exam): boolean {
  // 1. Strict date match: an exam can NEVER belong to a lesson on a different day
  if (exam.date !== lesson.date) return false;

  // 2. Strict time match:
  // Lessons in WebUntis are typically 45-50 minutes.
  // Overlap must be significant (>= 20 minutes), start times within 15 minutes,
  // or exam is fully contained within the lesson (e.g. 15-min short test).
  const overlap = Math.max(0, Math.min(lesson.endMin, exam.endMin) - Math.max(lesson.startMin, exam.startMin));
  const startDiff = Math.abs(lesson.startMin - exam.startMin);
  const isContained = exam.startMin >= lesson.startMin && exam.endMin <= lesson.endMin;
  const isTimeMatch = overlap >= 20 || startDiff <= 15 || isContained;
  if (!isTimeMatch) return false;

  // 3. Subject / Teacher / Room match
  const lessonSubjs = lesson.subjects ?? [];
  const eSubjName = (exam.subject?.name || '').trim().toUpperCase();
  const eSubjLong = (exam.subject?.longName || '').trim().toUpperCase();
  const eSubjId = exam.subject?.id;
  const eText = (exam.text || '').trim().toUpperCase();
  const eType = (exam.type || '').trim().toUpperCase();

  const hasLessonSubj = lessonSubjs.length > 0;
  const hasExamSubj = Boolean(eSubjName || (eSubjId && eSubjId > 0));

  if (hasLessonSubj) {
    const hasSubjectMatch = lessonSubjs.some((s) => {
      if (eSubjId && s.id && eSubjId === s.id && eSubjId > 0) return true;
      const sName = (s.name || '').trim().toUpperCase();
      const sLong = (s.longName || '').trim().toUpperCase();
      if (!sName) return false;

      // Exact name match
      if (eSubjName && sName === eSubjName) return true;

      // Base name match (e.g. M-1 vs M, AM vs AM_1, NW2 vs NW)
      const baseLesson = sName.replace(/[-_0-9].*$/, '').trim() || sName;
      const baseExam = eSubjName.replace(/[-_0-9].*$/, '').trim() || eSubjName;
      if (baseLesson.length >= 2 && baseExam.length >= 2 && baseLesson === baseExam) return true;

      // Long name / full title match (require length >= 3 or exact)
      if (
        sLong &&
        eSubjLong &&
        (sLong === eSubjLong ||
          (sLong.length >= 3 && eSubjLong.length >= 3 && (sLong.includes(eSubjLong) || eSubjLong.includes(sLong))))
      ) {
        return true;
      }
      if (
        sLong &&
        eSubjName &&
        (sLong === eSubjName ||
          (sLong.length >= 3 && eSubjName.length >= 3 && (sLong.includes(eSubjName) || eSubjName.includes(sLong))))
      ) {
        return true;
      }
      if (
        sName &&
        eSubjLong &&
        (sName === eSubjLong ||
          (sName.length >= 3 && eSubjLong.length >= 3 && (eSubjLong.includes(sName) || sName.includes(eSubjLong))))
      ) {
        return true;
      }

      // Exam text explicitly mentions this lesson's subject code or name
      if (
        eText &&
        (matchesSubjectToken(eText, sName) || (baseLesson.length >= 2 && matchesSubjectToken(eText, baseLesson)))
      ) {
        return true;
      }

      // Exam type only matches if subject code is at least 3 chars (never match single letter like "E" in "SCHULARBEIT" or "TEST")
      if (eType && sName.length >= 3 && eType.includes(sName)) {
        return true;
      }

      return false;
    });

    if (hasSubjectMatch) return true;

    // If both lesson and exam explicitly declare subjects, but they do NOT match,
    // they are definitely different subjects! Do NOT fall back to shared room/teacher.
    if (hasExamSubj) {
      return false;
    }
  }

  // Fallback when subject is missing from lesson or exam:
  // Check shared teacher
  const lTeachers = lesson.teachers ?? [];
  const eTeachers = exam.teachers ?? [];
  const sharedTeacher = lTeachers.some((t1) =>
    eTeachers.some(
      (t2) =>
        (t1.id && t2.id && t1.id === t2.id && t1.id > 0) ||
        (t1.name && t2.name && t1.name.trim().toUpperCase() === t2.name.trim().toUpperCase()),
    ),
  );
  if (sharedTeacher) return true;

  // If lesson status is EXAM or isExam, and we have time match, and exam has no conflicting subject
  if ((lesson.status === 'EXAM' || lesson.isExam) && !hasExamSubj) {
    return true;
  }

  return false;
}
