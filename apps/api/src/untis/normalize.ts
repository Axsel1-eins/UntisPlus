import {
  intToIsoDate,
  untisTimeToMinutes,
  type Absence,
  type Exam,
  type Holiday,
  type Homework,
  type Lesson,
  type LessonStatus,
  type MasterData,
  type Ref,
  type SchoolYear,
  type Substitution,
  type SubstitutionKind,
  type TimeGridSlot,
} from '@untisplus/shared';

/** Raw shapes returned by WebUntis; only the fields we use are declared. */
export interface RawRef {
  id: number;
  name?: string;
  longname?: string;
  longName?: string;
}

export interface RawLesson {
  id?: number | string;
  date: number;
  startTime: number;
  endTime: number;
  /** Full keys (classic / options-style responses). */
  klassen?: RawRef[];
  teachers?: RawRef[];
  subjects?: RawRef[];
  rooms?: RawRef[];
  /** Compact keys (WebUntis `getTimetable` options-style returns `kl/te/su/ro`). */
  kl?: RawRef[];
  te?: RawRef[];
  su?: RawRef[];
  ro?: RawRef[];
  code?: string;
  type?: string;
  lsnumber?: string;
  info?: string;
  substText?: string;
  activityType?: string;
}

export interface RawSubstitution extends RawLesson {
  createdBy?: string;
}

function ref(raw: RawRef | undefined | null): Ref | null {
  if (!raw || typeof raw.id !== 'number') return null;
  return {
    id: raw.id,
    name: raw.name ?? raw.longname ?? raw.longName ?? String(raw.id),
    longName: raw.longName ?? raw.longname,
  };
}

function refs(raw: RawRef[] | undefined): Ref[] {
  return (raw ?? []).map(ref).filter((r): r is Ref => r !== null);
}

/** Merge the full and compact reference keys WebUntis may use for the same element. */
function refsAny(full: RawRef[] | undefined, compact: RawRef[] | undefined): Ref[] {
  return refs(full) .concat(refs(compact)).filter(
    (r, i, arr) => arr.findIndex((x) => x.id === r.id) === i,
  );
}

/** Map a WebUntis `code`/`type` to our normalized lesson status. */
function lessonStatus(raw: RawLesson): LessonStatus {
  if (raw.code === 'cancelled') return 'CANCELLED';
  if (
    raw.code === 'exam' ||
    raw.type === 'exam' ||
    raw.activityType === 'exam' ||
    raw.activityType === 'EXAM' ||
    (raw as any).lstype === 'sp' ||
    Boolean((raw as any).exam)
  ) {
    return 'EXAM';
  }
  if (raw.code === 'irregular') return 'IRREGULAR';
  return 'REGULAR';
}

/** Stable identity for a lesson, used for diffing and for React keys. */
export function lessonKey(lesson: Pick<Lesson, 'date' | 'startMin' | 'subjects' | 'rooms'>): string {
  const subj = lesson.subjects.map((s) => s.id).sort().join(',');
  const rooms = lesson.rooms.map((r) => r.id).sort().join(',');
  return `${lesson.date}-${lesson.startMin}-${subj}-${rooms}`;
}

export function normalizeLesson(raw: RawLesson): Lesson {
  const subjects = refsAny(raw.subjects, raw.su);
  const rooms = refsAny(raw.rooms, raw.ro);
  const lesson: Lesson = {
    id: '',
    date: intToIsoDate(raw.date),
    startMin: untisTimeToMinutes(raw.startTime),
    endMin: untisTimeToMinutes(raw.endTime),
    subjects,
    teachers: refsAny(raw.teachers, raw.te),
    rooms,
    klassen: refsAny(raw.klassen, raw.kl),
    status: lessonStatus(raw),
    code: raw.code,
    substText: raw.substText,
    info: raw.info,
    isExam: raw.type === 'exam' || raw.activityType === 'exam',
    activityType: raw.activityType,
  };
  lesson.id = lessonKey(lesson);
  return lesson;
}

const SUBSTITUTION_KINDS: Record<string, SubstitutionKind> = {
  cancel: 'CANCELLED',
  cancelled: 'CANCELLED',
  subst: 'OTHER',
  roomchange: 'ROOM_CHANGE',
  room: 'ROOM_CHANGE',
  teacherchange: 'TEACHER_CHANGE',
  teacher: 'TEACHER_CHANGE',
  subjectchange: 'SUBJECT_CHANGE',
  change: 'OTHER',
  shift: 'MOVED',
  add: 'ADDED',
  free: 'FREE',
};

export function normalizeSubstitution(raw: RawSubstitution | RawLesson): Substitution {
  const rawType = (raw as RawSubstitution).type ?? (raw.code ?? 'unknown');
  const after = normalizeLesson(raw);
  const kind: SubstitutionKind =
    raw.code === 'cancelled'
      ? 'CANCELLED'
      : SUBSTITUTION_KINDS[rawType.toLowerCase()] ?? 'OTHER';
  return {
    kind,
    rawType,
    after,
    text: raw.substText,
    createdBy: (raw as RawSubstitution).createdBy,
  };
}

/** Raw master-data shape from `getUserData2017` (and friends). */
export interface RawMasterData {
  timeStamp?: number;
  klassen?: RawRef[];
  teachers?: RawRef[];
  students?: RawRef[];
  subjects?: RawRef[];
  rooms?: RawRef[];
  departments?: RawRef[];
  schoolyears?: { id: number; name: string; startDate: number; endDate: number }[];
  holidays?: { id: number; name: string; longName?: string; startDate: number; endDate: number }[];
  timeGrid?: { days?: { day: string; units: { label: string; startTime: string; endTime: string }[] }[] };
  timegridUnits?: Array<{ day: number; timeUnits: Array<{ name: string; startTime: number; endTime: number }> }>;
}

export function normalizeSchoolYear(raw: {
  id: number;
  name: string;
  startDate: number;
  endDate: number;
}): SchoolYear {
  return {
    id: raw.id,
    name: raw.name,
    startDate: intToIsoDate(raw.startDate),
    endDate: intToIsoDate(raw.endDate),
  };
}

export function normalizeHoliday(raw: {
  id: number;
  name: string;
  longName?: string;
  startDate: number;
  endDate: number;
}): Holiday {
  return {
    id: raw.id,
    name: raw.name,
    longName: raw.longName,
    startDate: intToIsoDate(raw.startDate),
    endDate: intToIsoDate(raw.endDate),
  };
}

/** Flatten the time grid (Mon..Fri units are typically identical) into slots. */
export function normalizeTimeGrid(
  raw?: RawMasterData['timeGrid'],
  timegridUnits?: RawMasterData['timegridUnits'],
): TimeGridSlot[] {
  if (Array.isArray(timegridUnits) && timegridUnits.length > 0) {
    // In WebUntis JSON-RPC: day 2 is Monday (or use first day that has timeUnits)
    const dayObj = timegridUnits.find((d) => d.day === 2 && d.timeUnits?.length) ?? timegridUnits.find((d) => d.timeUnits?.length) ?? timegridUnits[0];
    if (dayObj && Array.isArray(dayObj.timeUnits) && dayObj.timeUnits.length > 0) {
      return dayObj.timeUnits.map((u) => ({
        name: String(u.name ?? ''),
        startMin: untisTimeToMinutes(u.startTime),
        endMin: untisTimeToMinutes(u.endTime),
      }));
    }
  }

  const days = raw?.days ?? [];
  const monday = days.find((d) => d.day === 'MON') ?? days[0];
  if (!monday) return [];
  return monday.units.map((u) => ({
    name: u.label,
    startMin: untisTimeToMinutes(u.startTime),
    endMin: untisTimeToMinutes(u.endTime),
  }));
}

export function normalizeMasterData(raw: RawMasterData): MasterData {
  const schoolYears = (raw.schoolyears ?? []).map(normalizeSchoolYear);
  return {
    klassen: refs(raw.klassen),
    teachers: refs(raw.teachers),
    students: refs(raw.students),
    subjects: refs(raw.subjects),
    rooms: refs(raw.rooms),
    departments: refs(raw.departments),
    schoolYears,
    currentSchoolYear: schoolYears[0],
    holidays: (raw.holidays ?? []).map(normalizeHoliday),
    timeGrid: normalizeTimeGrid(raw.timeGrid, raw.timegridUnits),
    lastImportTime: raw.timeStamp,
  };
}

// --- REST-layer normalizers (homework, absences, exams, messages) ---

function toIsoDateString(value: number | string | undefined): string {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return intToIsoDate(s);
}

export function normalizeHomework(raw: Record<string, any>): Homework {
  let subject: Ref | undefined;
  if (raw.subject && typeof raw.subject === 'object' && 'name' in raw.subject) {
    subject = {
      id: Number(raw.subject.id ?? 0),
      name: String(raw.subject.name ?? ''),
      longName: raw.subject.longName ? String(raw.subject.longName) : undefined,
    };
  } else if (typeof raw.subject === 'string' && raw.subject.trim()) {
    subject = { id: 0, name: raw.subject.trim(), longName: raw.subject.trim() };
  } else {
    subject = ref(raw.subject) ?? undefined;
  }

  let teacher: Ref | undefined;
  if (raw.teacher && typeof raw.teacher === 'object' && 'name' in raw.teacher) {
    teacher = {
      id: Number(raw.teacher.id ?? 0),
      name: String(raw.teacher.name ?? ''),
      longName: raw.teacher.longName ? String(raw.teacher.longName) : undefined,
    };
  } else if (typeof raw.teacher === 'string' && raw.teacher.trim()) {
    teacher = { id: 0, name: raw.teacher.trim(), longName: raw.teacher.trim() };
  } else {
    teacher = ref(raw.teacher ?? raw.createdBy) ?? undefined;
  }

  return {
    id: Number(raw.id),
    date: toIsoDateString(raw.date),
    dueDate: raw.dueDate ? toIsoDateString(raw.dueDate) : undefined,
    subject,
    teacher,
    text: raw.text ?? raw.homework ?? '',
    completed: Boolean(raw.completed),
    attachments: (raw.attachments ?? []).map((a: any) => ({ name: a.name ?? a.filename, url: a.url })),
  };
}

export function normalizeAbsence(raw: Record<string, any>): Absence {
  const date = raw.startDate ?? raw.date ?? raw.start;
  const end = raw.endDate ?? raw.end ?? date;
  return {
    id: Number(raw.id ?? 0),
    start: toIsoDateString(date),
    end: toIsoDateString(end),
    periods: raw.periods ?? raw.missedPeriods,
    excused: Boolean(raw.excused ?? raw.excuseStatusId === 2),
    excuseStatus: raw.excuseStatus ?? raw.reason,
    reason: raw.reason ?? raw.text,
    subject: ref(raw.subject) ?? undefined,
  };
}

export function normalizeExam(raw: Record<string, any>): Exam {
  const id = Number(raw.examId ?? raw.id ?? 0);

  let date = '';
  let startMin = 0;
  let endMin = 0;

  if (typeof raw.examStart === 'string' && raw.examStart.includes('T')) {
    date = raw.examStart.slice(0, 10);
    const timePart = raw.examStart.slice(11, 16); // "13:10"
    const [h, m] = timePart.split(':').map(Number);
    startMin = (h ?? 0) * 60 + (m ?? 0);
  } else {
    const dateVal = raw.startDate ?? raw.date;
    date = toIsoDateString(dateVal);
    startMin = untisTimeToMinutes(raw.startTime ?? 0);
  }

  if (typeof raw.examEnd === 'string' && raw.examEnd.includes('T')) {
    const timePart = raw.examEnd.slice(11, 16); // "14:00"
    const [h, m] = timePart.split(':').map(Number);
    endMin = (h ?? 0) * 60 + (m ?? 0);
  } else {
    endMin = untisTimeToMinutes(raw.endTime ?? 0);
  }

  let type: string = 'exam';
  if (typeof raw.examType === 'object' && raw.examType !== null) {
    type = raw.examType.displayName || raw.examType.longName || raw.examType.shortName || 'Schularbeit/Test';
  } else if (raw.examType || raw.type) {
    type = String(raw.examType ?? raw.type);
  }

  let subject: Ref | undefined;
  if (typeof raw.subject === 'string' && raw.subject.trim()) {
    subject = { id: 0, name: raw.subject.trim(), longName: raw.subject.trim() };
  } else if (raw.subject && typeof raw.subject === 'object') {
    subject = {
      id: Number(raw.subject.id ?? 0),
      name: raw.subject.shortName ?? raw.subject.displayName ?? raw.subject.name ?? 'Fach',
      longName: raw.subject.longName ?? raw.subject.displayName ?? raw.subject.name,
    };
  }

  // Teachers: check teachers array or invigilators
  const teachers: Ref[] = [];
  if (Array.isArray(raw.teachers) && raw.teachers.length > 0) {
    for (const t of raw.teachers) {
      teachers.push({
        id: Number(t.id ?? 0),
        name: t.shortName ?? t.name ?? t.displayName ?? 'Lehrer',
        longName: t.longName ?? t.displayName ?? t.name,
      });
    }
  } else if (Array.isArray(raw.invigilators)) {
    for (const inv of raw.invigilators) {
      if (Array.isArray(inv.teachers)) {
        for (const t of inv.teachers) {
          teachers.push({
            id: Number(t.id ?? 0),
            name: t.shortName ?? t.name ?? t.displayName ?? 'Lehrer',
            longName: t.longName ?? t.displayName ?? t.name,
          });
        }
      }
    }
  }

  // Rooms: check rooms array (which may have shortName / displayName)
  const rooms: Ref[] = [];
  if (Array.isArray(raw.rooms)) {
    for (const r of raw.rooms) {
      rooms.push({
        id: Number(r.id ?? 0),
        name: r.shortName ?? r.name ?? r.displayName ?? 'Raum',
        longName: r.longName ?? r.displayName ?? r.name,
      });
    }
  }

  const text = raw.examText ?? raw.examName ?? raw.name ?? raw.text ?? '';

  return {
    id,
    date,
    startMin,
    endMin,
    subject,
    teachers,
    rooms,
    type,
    text,
  };
}
