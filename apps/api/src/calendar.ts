import { randomBytes } from 'node:crypto';
import {
  buildICalendar,
  ElementType,
  type CalendarScope,
  type Exam,
  type Holiday,
  type Lesson,
  type School,
} from '@untisplus/shared';
import { getMasterData, type StoredSession } from './sessions.js';
import { fixtureExams, fixtureLessons, FIXTURE_MASTER, FIXTURE_SCHOOL } from './fixtures.js';

export interface CalendarSubscription {
  token: string;
  school: School;
  targetId: number;
  targetType: ElementType;
  displayName?: string;
  session?: StoredSession;
  scope?: CalendarScope;
  createdAt: number;
}

const tokens = new Map<string, CalendarSubscription>();

export function getOrCreateCalendarToken(
  session: StoredSession,
  targetId: number,
  targetType: ElementType,
  scope?: CalendarScope,
): string {
  const effectiveScope = scope ?? 'all';
  // Check if an existing token already matches this target and scope
  for (const [token, sub] of tokens.entries()) {
    if (
      sub.school.server === session.info.school.server &&
      sub.school.loginName === session.info.school.loginName &&
      sub.targetId === targetId &&
      sub.targetType === targetType &&
      (sub.scope ?? 'all') === effectiveScope
    ) {
      sub.session = session;
      return token;
    }
  }

  // Generate a cryptographically secure 16-byte hex token (32 hex chars, highly compact for QR codes)
  const token = randomBytes(16).toString('hex');
  tokens.set(token, {
    token,
    school: session.info.school,
    targetId,
    targetType,
    displayName: session.info.displayName,
    session,
    scope: effectiveScope,
    createdAt: Date.now(),
  });
  return token;
}

export function getCalendarSubscription(token: string): CalendarSubscription | undefined {
  return tokens.get(token);
}

export async function generateICalFeed(
  token: string,
  isFixtures: boolean,
  overrideScope?: CalendarScope,
): Promise<{ ics: string; filename: string } | null> {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const formatIso = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const now = new Date();
  const past = new Date(now.getTime() - 7 * 86_400_000);
  const future = new Date(now.getTime() + 28 * 86_400_000);
  const startDate = formatIso(past);
  const endDate = formatIso(future);

  if (isFixtures || token.startsWith('demo-') || token === 'fixture-feed') {
    const scope = overrideScope ?? 'all';
    const lessons = fixtureLessons(startDate, endDate, 1);
    const exams = fixtureExams(startDate, endDate);
    const holidays = FIXTURE_MASTER.holidays;
    const ics = buildICalendar({
      calendarName: `Untis+ (${FIXTURE_SCHOOL.displayName})`,
      schoolName: FIXTURE_SCHOOL.displayName,
      lessons,
      exams,
      holidays,
      scope,
      ttlMinutes: 15,
      now,
    });
    return { ics, filename: 'timetable.ics' };
  }

  const sub = tokens.get(token);
  if (!sub) return null;

  const scope = overrideScope ?? sub.scope ?? 'all';
  let lessons: Lesson[] = [];
  let exams: Exam[] = [];
  let holidays: Holiday[] = [];

  if (sub.session) {
    const needTimetable = scope === 'all' || scope === 'timetable';
    const needExams = scope === 'all' || scope === 'exams';
    const needHolidays = scope === 'all' || scope === 'holidays';

    if (needTimetable) {
      try {
        lessons = await sub.session.client.getTimetable(
          { id: sub.targetId, type: sub.targetType },
          startDate,
          endDate,
        );
      } catch {
        lessons = [];
      }
    }

    if (needExams) {
      try {
        exams = await sub.session.client.getExams(startDate, endDate);
      } catch {
        exams = [];
      }
    }

    if (needHolidays) {
      try {
        const master = await getMasterData(sub.session);
        holidays = master.holidays ?? [];
      } catch {
        holidays = [];
      }
    }
  }

  const title = sub.displayName
    ? `Untis+ (${sub.displayName})`
    : `Untis+ (${sub.school.displayName})`;

  const ics = buildICalendar({
    calendarName: title,
    schoolName: sub.school.displayName,
    lessons,
    exams,
    holidays,
    scope,
    ttlMinutes: 15,
    now,
  });

  return { ics, filename: 'timetable.ics' };
}
