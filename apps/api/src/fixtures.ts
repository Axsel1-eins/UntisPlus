import {
  addDays,
  ElementType,
  isoRange,
  mondayOf,
  weekRange,
  type Absence,
  type Exam,
  type Holiday,
  type Homework,
  type Lesson,
  type MasterData,
  type Message,
  type Ref,
  type School,
} from '@untisplus/shared';

/**
 * A small, realistic fixture dataset so the frontend can be developed and tested without a
 * live WebUntis connection. Enabled with `FIXTURES=1`.
 */

export const FIXTURE_SCHOOL: School = {
  server: 'fixture.webuntis.com',
  loginName: 'untisplus-fixture',
  displayName: 'Untis+ Fixture School',
  schoolId: 1,
  tenantId: '1',
};

const ref = (id: number, name: string, longName?: string): Ref => ({ id, name, longName });

const KLASSEN = [ref(1, '3AHIT', '3AHIT'), ref(2, '3BHIT', '3BHIT'), ref(3, '4AHIT', '4AHIT')];
const TEACHERS = [
  ref(11, 'MUE', 'Müller'),
  ref(12, 'HOF', 'Hoffmann'),
  ref(13, 'BER', 'Berger'),
  ref(14, 'NOV', 'Novak'),
];
const SUBJECTS = [
  ref(21, 'D', 'Deutsch'),
  ref(22, 'E', 'Englisch'),
  ref(23, 'AM', 'Angewandte Mathematik'),
  ref(24, 'INF', 'Informatik'),
  ref(25, 'NWT', 'Naturwissenschaften'),
  ref(26, 'SPO', 'Sport'),
];
const ROOMS = [ref(31, 'A101'), ref(32, 'A102'), ref(33, 'LAB1'), ref(34, 'TURN1')];

const TIME_GRID = [
  { name: '1', startMin: 480, endMin: 530 },
  { name: '2', startMin: 530, endMin: 580 },
  { name: '3', startMin: 595, endMin: 645 },
  { name: '4', startMin: 645, endMin: 695 },
  { name: '5', startMin: 705, endMin: 755 },
  { name: '6', startMin: 755, endMin: 805 },
];

export const FIXTURE_HOLIDAYS: Holiday[] = [
  {
    id: 1,
    name: 'Herbstferien',
    longName: 'Herbstferien 2026',
    startDate: '2026-10-26',
    endDate: '2026-10-31',
  },
  {
    id: 2,
    name: 'Allerheiligen',
    longName: 'Allerheiligen und Allerseelen',
    startDate: '2026-11-01',
    endDate: '2026-11-02',
  },
  {
    id: 3,
    name: 'Weihnachtsferien',
    longName: 'Weihnachtsferien 2026/2027',
    startDate: '2026-12-24',
    endDate: '2027-01-06',
  },
  {
    id: 4,
    name: 'Semesterferien',
    longName: 'Semesterferien 2027',
    startDate: '2027-02-01',
    endDate: '2027-02-07',
  },
  {
    id: 5,
    name: 'Osterferien',
    longName: 'Osterferien 2027',
    startDate: '2027-03-27',
    endDate: '2027-04-05',
  },
  {
    id: 6,
    name: 'Staatsfeiertag',
    longName: 'Staatsfeiertag (1. Mai)',
    startDate: '2027-05-01',
    endDate: '2027-05-01',
  },
  {
    id: 7,
    name: 'Pfingstferien',
    longName: 'Pfingstferien 2027',
    startDate: '2027-05-15',
    endDate: '2027-05-18',
  },
  {
    id: 8,
    name: 'Sommerferien',
    longName: 'Hauptferien / Sommerferien 2027',
    startDate: '2027-07-03',
    endDate: '2027-09-05',
  },
];

export const FIXTURE_MASTER: MasterData = {
  klassen: KLASSEN,
  teachers: TEACHERS,
  students: [],
  subjects: SUBJECTS,
  rooms: ROOMS,
  departments: [ref(41, 'IT', 'Informationstechnologie')],
  schoolYears: [
    { id: 1, name: '2026/2027', startDate: '2026-09-14', endDate: '2027-07-11' },
  ],
  currentSchoolYear: { id: 1, name: '2026/2027', startDate: '2026-09-14', endDate: '2027-07-11' },
  holidays: FIXTURE_HOLIDAYS,
  timeGrid: TIME_GRID,
  lastImportTime: Date.now(),
};

/** A weekly pattern of lessons for class `3AHIT` (id 1). */
const PATTERN: { dow: number; slot: number; subject: number; teacher: number; room: number }[] = [
  { dow: 1, slot: 0, subject: 21, teacher: 11, room: 31 },
  { dow: 1, slot: 1, subject: 22, teacher: 12, room: 32 },
  { dow: 1, slot: 3, subject: 24, teacher: 13, room: 33 },
  { dow: 1, slot: 4, subject: 24, teacher: 13, room: 33 },
  { dow: 2, slot: 0, subject: 23, teacher: 14, room: 31 },
  { dow: 2, slot: 1, subject: 25, teacher: 11, room: 33 },
  { dow: 2, slot: 2, subject: 25, teacher: 11, room: 33 },
  { dow: 3, slot: 0, subject: 24, teacher: 13, room: 33 },
  { dow: 3, slot: 2, subject: 22, teacher: 12, room: 32 },
  { dow: 3, slot: 5, subject: 26, teacher: 14, room: 34 },
  { dow: 4, slot: 1, subject: 21, teacher: 11, room: 31 },
  { dow: 4, slot: 3, subject: 23, teacher: 14, room: 31 },
  { dow: 5, slot: 0, subject: 24, teacher: 13, room: 33 },
  { dow: 5, slot: 1, subject: 24, teacher: 13, room: 33 },
];

const byId = <T extends { id: number }>(list: T[], id: number): T | undefined =>
  list.find((x) => x.id === id);

function dowOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay();
}

/** Build fixture lessons for a date range, with one cancellation and one room change. */
export function fixtureLessons(
  start: string,
  end: string,
  targetId = 1,
  targetType: ElementType = ElementType.Class,
): Lesson[] {
  const lessons: Lesson[] = [];
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;

  const klasse = targetType === ElementType.Class
    ? (byId(KLASSEN, targetId) ?? KLASSEN[0]!)
    : KLASSEN[0]!;

  for (const iso of isoRange(start, end)) {
    const dow = dowOf(iso);
    for (const p of PATTERN.filter((x) => x.dow === dow)) {
      const slot = TIME_GRID[p.slot]!;
      const lesson: Lesson = {
        id: '',
        date: iso,
        startMin: slot.startMin,
        endMin: slot.endMin,
        subjects: [byId(SUBJECTS, p.subject)!],
        teachers: [byId(TEACHERS, p.teacher)!],
        rooms: [byId(ROOMS, p.room)!],
        klassen: [klasse],
        status: 'REGULAR',
      };
      // A cancelled double-period on the first IT block of the week.
      if (iso === addDays(mondayOf(todayIso), 0) && p.slot === 3 && p.subject === 24) {
        lesson.status = 'CANCELLED';
        lesson.code = 'cancelled';
        lesson.substText = 'Entfall (Lehrer krank)';
      }
      // A room change on Wednesday.
      if (iso === addDays(mondayOf(todayIso), 2) && p.slot === 2) {
        lesson.rooms = [byId(ROOMS, 31)!];
        lesson.code = 'irregular';
        lesson.substText = 'Raumänderung A102 → A101';
      }
      lesson.id = `${lesson.date}-${lesson.startMin}-${lesson.subjects[0]?.id ?? 0}-${lesson.rooms[0]?.id ?? 0}`;
      lessons.push(lesson);
    }
  }

  if (targetType === ElementType.Teacher) {
    return lessons.filter((l) => l.teachers.some((t) => t.id === targetId));
  }
  if (targetType === ElementType.Room) {
    return lessons.filter((l) => l.rooms.some((r) => r.id === targetId));
  }
  return lessons;
}

export function fixtureWeekLessons(
  targetId = 1,
  targetType: ElementType = ElementType.Class,
): Lesson[] {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  const { start, end } = weekRange(iso);
  return fixtureLessons(start, end, targetId, targetType);
}

/** An anchor date inside `[start, end]` (defaults to the range start) for deterministic demo data. */
function anchorInRange(start: string, end: string): string {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  if (todayIso >= start && todayIso <= end) return todayIso;
  return start;
}

/** Demo homework assigned across the given range. */
export function fixtureHomeworks(start: string, end: string): Homework[] {
  const base = anchorInRange(start, end);
  const pick = (offset: number) => {
    const iso = addDays(base, offset);
    return iso >= start && iso <= end ? iso : base;
  };
  return [
    {
      id: 9001,
      date: pick(0),
      dueDate: addDays(base, 2),
      subject: byId(SUBJECTS, 23),
      teacher: byId(TEACHERS, 14),
      text: 'Beispiele 1–8 auf Seite 42 rechnen und die Lösungswege erklären.',
      completed: false,
    },
    {
      id: 9002,
      date: pick(0),
      dueDate: addDays(base, 3),
      subject: byId(SUBJECTS, 22),
      teacher: byId(TEACHERS, 12),
      text: 'Write a 120-word essay about your hometown. Bring it printed.',
      completed: false,
    },
    {
      id: 9003,
      date: pick(1),
      dueDate: addDays(base, 6),
      subject: byId(SUBJECTS, 24),
      teacher: byId(TEACHERS, 13),
      text: 'Implement a linked list with insert/delete in your preferred language.',
      completed: true,
    },
  ];
}

/** Demo exams inside the given range. */
export function fixtureExams(start: string, end: string): Exam[] {
  const base = anchorInRange(start, end);
  const within = (iso: string) => iso >= start && iso <= end;
  const items: Exam[] = [
    {
      id: 8001,
      date: addDays(base, 3),
      startMin: 480,
      endMin: 530,
      subject: byId(SUBJECTS, 23),
      teachers: [byId(TEACHERS, 14)!],
      rooms: [byId(ROOMS, 31)!],
      type: 'Schularbeit',
      text: '1. Schularbeit (Kapitel 1–3)',
    },
    {
      id: 8002,
      date: addDays(base, 8),
      startMin: 595,
      endMin: 645,
      subject: byId(SUBJECTS, 24),
      teachers: [byId(TEACHERS, 13)!],
      rooms: [byId(ROOMS, 33)!],
      type: 'Test',
      text: 'Praktischer Test: Rekursion',
    },
  ];
  return items.filter((e) => within(e.date));
}

/** Demo absences inside the given range. */
export function fixtureAbsences(start: string, end: string): Absence[] {
  const base = anchorInRange(start, end);
  const within = (iso: string) => iso >= start && iso <= end;
  const items: Absence[] = [
    {
      id: 7001,
      start: addDays(base, -3),
      end: addDays(base, -3),
      periods: 4,
      excused: true,
      excuseStatus: 'entschuldigt',
      reason: 'Arzttermin',
      subject: byId(SUBJECTS, 21),
    },
    {
      id: 7002,
      start: addDays(base, -1),
      end: addDays(base, -1),
      periods: 2,
      excused: false,
      excuseStatus: 'offen',
      reason: '—',
    },
  ];
  return items.filter((a) => a.end >= start && a.start <= end);
}

/** Demo messages for a given day. */
export function fixtureMessages(date: string): Message[] {
  return [
    {
      id: 'm-1',
      date,
      subject: 'Schulsprecherwahl',
      body: 'Die Wahl findet am Freitag in der Aula statt. Alle Klassen sind eingeladen.',
      read: false,
      sender: 'Direktion',
    },
    {
      id: 'm-2',
      date,
      subject: 'Bibliothek geschlossen',
      body: 'Die Bibliothek ist diese Woche wegen Umbau geschlossen.',
      read: true,
      sender: 'Bibliothek',
    },
  ];
}
