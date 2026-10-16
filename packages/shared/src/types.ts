/**
 * Shared domain model for Untis+.
 *
 * These types are the single source of truth across `apps/api` and `apps/web`.
 * They intentionally use school-local dates as ISO strings ("YYYY-MM-DD") and times as
 * minutes-since-midnight integers, because that is how WebUntis represents them.
 */

/** A minimal reference to a WebUntis element (class, teacher, subject, room). */
export interface Ref {
  id: number;
  name: string;
  longName?: string;
}

/** WebUntis element types for timetable queries. */
export const ElementType = {
  Class: 1,
  Teacher: 2,
  Subject: 3,
  Room: 4,
  Student: 5,
} as const;
export type ElementType = (typeof ElementType)[keyof typeof ElementType];

/** WebUntis person types returned during authentication. */
export const PersonType = {
  Teacher: 2,
  Student: 5,
  Parent: 12,
} as const;
export type PersonType = (typeof PersonType)[keyof typeof PersonType];

/** A discovered WebUntis school. */
export interface School {
  server: string;
  loginName: string;
  displayName: string;
  schoolId?: number;
  tenantId?: string;
  address?: string;
}

/** How a session was authenticated. */
export type AuthMode = 'anonymous' | 'password' | 'secret' | 'qr';

/** Associated child profile (for parent/guardian accounts). */
export interface ChildProfile {
  id: number;
  name?: string;
  klasseId?: number;
}

/** Server-side session metadata (never sent to the browser). */
export interface SessionInfo {
  sessionId: string;
  personId?: number;
  personType?: number;
  klasseId?: number;
  displayName?: string;
  children?: ChildProfile[];
  school: School;
  mode: AuthMode;
  createdAt: number;
}

/** A lesson status, normalized from WebUntis `code`/`type`. */
export type LessonStatus = 'REGULAR' | 'CANCELLED' | 'IRREGULAR' | 'FREE' | 'EXAM';

export type SubstitutionKind =
  | 'CANCELLED'
  | 'ROOM_CHANGE'
  | 'TEACHER_CHANGE'
  | 'SUBJECT_CHANGE'
  | 'MOVED'
  | 'ADDED'
  | 'FREE'
  | 'OTHER';

/** A normalized substitution (a "before → after" change). */
export interface Substitution {
  kind: SubstitutionKind;
  /** The raw WebUntis substitution type string, kept for reference. */
  rawType: string;
  before?: Partial<Lesson>;
  after?: Partial<Lesson>;
  text?: string;
  createdBy?: string;
}

/** A single timetable period. */
export interface Lesson {
  /** Stable identity: `${date}-${startMin}-${subjectIds}-${roomIds}` */
  id: string;
  /** School-local ISO date, e.g. "2026-10-14". */
  date: string;
  startMin: number;
  endMin: number;
  subjects: Ref[];
  teachers: Ref[];
  rooms: Ref[];
  klassen: Ref[];
  status: LessonStatus;
  /** Raw WebUntis `code` (e.g. "cancelled", "irregular"), if any. */
  code?: string;
  /** Free-text substitution note ("Vertretungstext"). */
  substText?: string;
  info?: string;
  isExam?: boolean;
  /** Raw WebUntis activity type (e.g. "Unterricht"), used when no subject is present. */
  activityType?: string;
  substitution?: Substitution;
}

export interface Homework {
  id: number;
  date: string;
  dueDate?: string;
  subject?: Ref;
  teacher?: Ref;
  text: string;
  completed: boolean;
  attachments?: Attachment[];
}

export interface Attachment {
  name: string;
  url?: string;
}

export interface Absence {
  id: number | string;
  start: string;
  end: string;
  startTime?: string | number;
  endTime?: string | number;
  /** Number of missed periods, if provided. */
  periods?: number;
  excused: boolean;
  excuseStatus?: string;
  reason?: string;
  text?: string;
  subject?: Ref;
}

export interface Exam {
  id: number;
  date: string;
  startMin: number;
  endMin: number;
  subject?: Ref;
  teachers: Ref[];
  rooms: Ref[];
  type?: string;
  text?: string;
}

export interface Message {
  id: string;
  date: string;
  subject: string;
  body: string;
  read: boolean;
  sender?: string;
  attachments?: Attachment[];
}

/** A lesson time slot from the school's time grid. */
export interface TimeGridSlot {
  /** Slot label (the period number/name WebUntis uses). */
  name: string;
  startMin: number;
  endMin: number;
}

export interface SchoolYear {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
}

export interface Holiday {
  id: number;
  name: string;
  longName?: string;
  startDate: string;
  endDate: string;
}

/** Aggregated master data for a school. */
export interface MasterData {
  klassen: Ref[];
  teachers: Ref[];
  students: Ref[];
  subjects: Ref[];
  rooms: Ref[];
  departments: Ref[];
  schoolYears: SchoolYear[];
  currentSchoolYear?: SchoolYear;
  holidays: Holiday[];
  timeGrid: TimeGridSlot[];
  lastImportTime?: number;
}

/** The result of a login attempt. */
export interface SessionSummary {
  school: School;
  mode: AuthMode;
  personId?: number;
  personType?: number;
  klasseId?: number;
  displayName?: string;
  children?: ChildProfile[];
  /** Present for anonymous sessions that can only read public data. */
  readOnly: boolean;
}

/** A change detected between two snapshots (used by the notification engine). */
export interface ChangeEvent {
  id: string;
  type: 'substitution' | 'homework' | 'message' | 'absence' | 'exam';
  lessonRef?: string;
  before?: unknown;
  after?: unknown;
  severity: 'info' | 'important' | 'critical';
  detectedAt: string;
  notified: boolean;
}

/** Element that a timetable can be requested for. */
export interface TimelineTarget {
  id: number;
  type: ElementType;
}
