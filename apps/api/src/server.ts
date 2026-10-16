import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import {
  computeRoomOccupancy,
  ElementType,
  type CalendarScope,
  type Lesson,
  type MasterData,
  type RoomOccupancy,
  type SessionSummary,
} from '@untisplus/shared';
import { searchSchools, SchoolSearchError } from './untis/discovery.js';
import { AuthError, PermissionError, SessionExpiredError, UntisError } from './untis/client.js';
import {
  createSession,
  destroySession,
  getMasterData,
  getSession,
  summarize,
  type StoredSession,
} from './sessions.js';
import { FIXTURE_MASTER, FIXTURE_SCHOOL, fixtureAbsences, fixtureExams, fixtureHomeworks, fixtureLessons, fixtureMessages } from './fixtures.js';
import { generateICalFeed, getOrCreateCalendarToken } from './calendar.js';
import { SchoolIndexer } from './untis/school_index.js';
import { DEFAULT_TIMEGRID } from './untis/normalize.js';

const COOKIE = 'up_session';
const isFixtures = (): boolean => process.env.FIXTURES === '1';

function isReqFixture(req: { cookies: Record<string, string | undefined> }): boolean {
  return isFixtures() || req.cookies[COOKIE] === 'fixture';
}

function parseType(raw: string | undefined): ElementType | undefined {
  if (!raw) return undefined;
  const map: Record<string, ElementType> = {
    class: ElementType.Class,
    teacher: ElementType.Teacher,
    subject: ElementType.Subject,
    student: ElementType.Student,
    room: ElementType.Room,
  };
  return map[raw.toLowerCase()];
}

export interface ServerDeps {
  /** Overridable for tests. */
  search?: typeof searchSchools;
}

export async function createServer(deps: ServerDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  const search = deps.search ?? searchSchools;
  const schoolIndexer = new SchoolIndexer();

  await app.register(cookie);
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // --- fixtures shortcut ---
  if (isFixtures()) {
    app.log.warn('FIXTURES=1 — serving canned data, no upstream WebUntis calls.');
  }

  function requireSession(req: { cookies: Record<string, string | undefined> }): StoredSession {
    const token = req.cookies[COOKIE];
    const session = getSession(token);
    if (!session) {
      const err = new Error('Not logged in');
      (err as Error & { statusCode?: number }).statusCode = 401;
      throw err;
    }
    return session;
  }

  // --- health ---
  app.get('/api/health', async () => ({ ok: true, fixtures: isFixtures(), time: new Date().toISOString() }));

  // --- school discovery ---
  app.get('/api/schools', async (req, reply) => {
    const q = String((req.query as Record<string, unknown>).q ?? '').trim();
    if (q.length < 2) return { schools: [] };
    try {
      const schools = await search(q);
      return { schools: schools.slice(0, 25) };
    } catch (err) {
      if (err instanceof SchoolSearchError && err.code === -6003) {
        return reply.status(400).send({
          error: 'too_many_results',
          message: 'Too many matching schools found. Please be more specific.',
          schools: [],
        });
      }
      throw err;
    }
  });

  // --- session lifecycle ---
  const loginSchema = z.object({
    server: z.string().min(1),
    school: z.string().min(1),
    displayName: z.string().optional(),
    schoolId: z.number().optional(),
    tenantId: z.string().optional(),
    mode: z.enum(['anonymous', 'password', 'secret', 'qr']),
    user: z.string().optional(),
    password: z.string().optional(),
    secret: z.string().optional(),
  });

  const handleSessionLogin = async (req: any, reply: any) => {
    const input = loginSchema.parse(req.body);

    if (
      isFixtures() ||
      input.school === 'untisplus-fixture' ||
      input.server === 'fixture.webuntis.com'
    ) {
      const summary: SessionSummary = {
        school: { ...FIXTURE_SCHOOL, loginName: input.school || FIXTURE_SCHOOL.loginName },
        mode: 'anonymous',
        readOnly: true,
      };
      // No real session in fixture mode; the cookie is just a marker.
      reply.setCookie(COOKIE, 'fixture', { httpOnly: true, sameSite: 'lax', path: '/' });
      return summary;
    }

    const session = await createSession(input);
    reply.setCookie(COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return summarize(session);
  };

  app.post('/api/session', handleSessionLogin);
  app.post('/api/session/login', handleSessionLogin);

  app.get('/api/session', async (req, reply) => {
    if (isReqFixture(req)) {
      // Only "logged in" once the fixture marker cookie is present, so onboarding stays reachable.
      if (req.cookies[COOKIE] !== 'fixture') {
        return reply.code(401).send({ error: 'not_authenticated' });
      }
      return {
        school: FIXTURE_SCHOOL,
        mode: 'anonymous',
        readOnly: true,
      } satisfies SessionSummary;
    }
    const token = req.cookies[COOKIE];
    const session = getSession(token);
    if (!session) return reply.code(401).send({ error: 'not_authenticated' });
    return summarize(session);
  });

  app.delete('/api/session', async (req, reply) => {
    if (!isReqFixture(req)) await destroySession(req.cookies[COOKIE]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  // --- master data ---
  app.get('/api/master', async (req): Promise<MasterData> => {
    if (isReqFixture(req)) return FIXTURE_MASTER;
    const session = requireSession(req);
    const master = await getMasterData(session);

    // If school hides teachers from students (e.g. HTBLUVA St. Pölten), enrich from harvested classes
    if (master.teachers.length === 0 && master.klassen.length > 0) {
      if (schoolIndexer.isFresh) {
        return {
          ...master,
          teachers: schoolIndexer.getTeachers(),
          rooms: master.rooms.length > 0 ? master.rooms : schoolIndexer.getRooms(),
        };
      } else {
        // Run harvest in background
        schoolIndexer.harvest(session.client, master.klassen).catch(() => {});
      }
    }
    return master;
  });

  // --- timetable ---
  app.get('/api/timetable', async (req): Promise<{ lessons: Lesson[] }> => {
    const q = req.query as Record<string, string | undefined>;
    const start = q.start ?? new Date().toISOString().slice(0, 10);
    const end = q.end ?? start;
    const targetId = q.targetId ? Number(q.targetId) : undefined;
    const targetType = parseType(q.targetType);

    if (isReqFixture(req)) {
      return { lessons: fixtureLessons(start, end, targetId ?? 1, targetType ?? ElementType.Class) };
    }

    const session = requireSession(req);
    let id = targetId;
    let type = targetType;

    if (!id || !type) {
      if (session.info.personType === 12 && session.info.children?.[0]) {
        id = id ?? session.info.children[0].id;
        type = type ?? ElementType.Student;
      } else if (session.info.personId && session.info.personType && session.info.personType !== 12) {
        id = id ?? session.info.personId;
        type = type ?? (session.info.personType as ElementType);
      }
    }

    if (!id || !type) {
      const err = new Error('No timetable target — specify targetId and targetType');
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }

    if (type === ElementType.Teacher || type === ElementType.Room) {
      try {
        const lessons = await session.client.getTimetable({ id, type }, start, end);
        return { lessons };
      } catch (err: unknown) {
        const isPermission =
          err instanceof PermissionError ||
          (err instanceof UntisError && (err.code === -8509 || /no right/i.test(err.message)));
        if (isPermission) {
          // School blocked direct teacher or room timetable: fall back to class-harvested lessons!
          const master = await getMasterData(session).catch(() => null);
          if (master?.klassen && master.klassen.length > 0) {
            if (!schoolIndexer.isRangeFresh(start, end)) {
              await schoolIndexer.harvest(session.client, master.klassen, { start, end });
            }
          }
          const lessons =
            type === ElementType.Teacher
              ? schoolIndexer.getTeacherLessons(id, start, end)
              : schoolIndexer.getRoomLessons(id, start, end);
          return { lessons };
        }
        throw err;
      }
    }

    const lessons = await session.client.getTimetable({ id, type }, start, end);
    return { lessons };
  });

  // --- other modules (graceful: return {available:false} on permission errors) ---
  async function tryModule<T>(fn: () => Promise<T>): Promise<{ available: boolean; data?: T; error?: string }> {
    try {
      return { available: true, data: await fn() };
    } catch (err) {
      if (err instanceof PermissionError) return { available: false, error: 'permission' };
      // Some deployments simply don't expose a module (or restrict it to certain roles and
      // answer with "method not found"). Treat that as "not available", not a hard failure.
      if (err instanceof UntisError && err.code === -32601) {
        return { available: false, error: 'unsupported' };
      }
      throw err;
    }
  }

  app.get('/api/substitutions', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const start = q.start ?? new Date().toISOString().slice(0, 10);
    const end = q.end ?? start;
    if (isReqFixture(req)) return { available: true, data: [] };
    const session = requireSession(req);
    return tryModule(() => session.client.getSubstitutions(start, end));
  });

  app.get('/api/homework', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const start = q.start ?? new Date().toISOString().slice(0, 10);
    const end = q.end ?? start;
    if (isReqFixture(req)) return { available: true, data: fixtureHomeworks(start, end) };
    const session = requireSession(req);
    return tryModule(() => session.client.getHomeworks(start, end));
  });

  app.get('/api/absences', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed: 7 is August, 8 is Sept
    const syStart = currentMonth >= 7 ? `${currentYear}-09-01` : `${currentYear - 1}-09-01`;
    const syEnd = currentMonth >= 7 ? `${currentYear + 1}-07-31` : `${currentYear}-07-31`;
    const start = q.start ?? syStart;
    const end = q.end ?? syEnd;
    if (isReqFixture(req)) return { available: true, data: fixtureAbsences(start, end) };
    const session = requireSession(req);
    return tryModule(() => session.client.getAbsences(start, end));
  });

  app.get('/api/exams', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const syStart = currentMonth >= 7 ? `${currentYear}-09-01` : `${currentYear - 1}-09-01`;
    const syEnd = currentMonth >= 7 ? `${currentYear + 1}-07-31` : `${currentYear}-07-31`;
    const start = q.start ?? syStart;
    const end = q.end ?? syEnd;
    if (isReqFixture(req)) return { available: true, data: fixtureExams(start, end) };
    const session = requireSession(req);
    return tryModule(() => session.client.getExams(start, end));
  });

  app.get('/api/messages', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const date = q.date ?? new Date().toISOString().slice(0, 10);
    if (isReqFixture(req)) return { available: true, data: fixtureMessages(date) };
    const session = requireSession(req);
    return tryModule(() => session.client.getMessages(date));
  });

  // --- room occupancy (Raumfinder) ---
  app.get('/api/rooms/occupancy', async (req): Promise<{ occupancies: RoomOccupancy[] }> => {
    const q = req.query as Record<string, string | undefined>;
    const date = q.date ?? new Date().toISOString().slice(0, 10);
    const d = new Date();
    const currentMin = d.getHours() * 60 + d.getMinutes();

    if (isReqFixture(req)) {
      const list = FIXTURE_MASTER.rooms;
      const grid = FIXTURE_MASTER.timeGrid && FIXTURE_MASTER.timeGrid.length > 0 ? FIXTURE_MASTER.timeGrid : DEFAULT_TIMEGRID;
      const lessons = fixtureLessons(date, date, 1, ElementType.Class);
      return { occupancies: computeRoomOccupancy(list, grid, lessons, currentMin) };
    }

    const session = requireSession(req);
    const master = await getMasterData(session);
    const rooms = master.rooms.length > 0 ? master.rooms : schoolIndexer.getRooms();
    const grid = master.timeGrid && master.timeGrid.length > 0 ? master.timeGrid : DEFAULT_TIMEGRID;

    // 1. Primary: query room timetables directly via WebUntisClient.getRoomOccupancy
    try {
      if (rooms.length > 0) {
        const occupancies = await session.client.getRoomOccupancy(date, rooms, grid, currentMin);
        return { occupancies };
      }
    } catch {
      // Direct room timetable query blocked; fall back to class timetable harvest
    }

    // 2. Fallback: harvest class timetables and index room occupancy
    if (!schoolIndexer.isFresh && master.klassen.length > 0) {
      await schoolIndexer.harvest(session.client, master.klassen, { start: date, end: date });
    }

    const occupancies = schoolIndexer.getRoomOccupancy(date, rooms, grid, currentMin);
    return { occupancies };
  });

  // --- dynamic calendar feed (RFC 5545 iCalendar / WebCal) ---
  const handleCalendarToken = async (req: {
    headers: Record<string, string | string[] | undefined>;
    cookies: Record<string, string | undefined>;
    query?: unknown;
    body?: unknown;
  }) => {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost:8787') as string;
    const proto = (req.headers['x-forwarded-proto'] || 'http') as string;
    const q = ((req.query || req.body || {}) as Record<string, string | number | undefined>);
    const rawScope = typeof q.scope === 'string' ? q.scope : undefined;
    const scope: CalendarScope | undefined =
      rawScope === 'timetable' || rawScope === 'exams' || rawScope === 'holidays' || rawScope === 'all'
        ? rawScope
        : undefined;

    if (isReqFixture(req)) {
      const token = 'fixture-feed';
      const scopeSuffix = scope && scope !== 'all' ? `?scope=${scope}` : '';
      const feedUrl = `${proto}://${host}/api/calendar/${token}.ics${scopeSuffix}`;
      const webcalUrl = feedUrl.replace(/^https?:\/\//i, 'webcal://');
      return { token, url: feedUrl, webcalUrl };
    }

    const session = requireSession(req);
    let targetId = q.targetId ? Number(q.targetId) : undefined;
    let targetType = parseType(typeof q.targetType === 'string' ? q.targetType : undefined);

    if (!targetId || !targetType) {
      if (session.info.personType === 12 && session.info.children?.[0]) {
        targetId = targetId ?? session.info.children[0].id;
        targetType = targetType ?? ElementType.Student;
      } else if (session.info.personId && session.info.personType && session.info.personType !== 12) {
        targetId = targetId ?? session.info.personId;
        targetType = targetType ?? (session.info.personType as ElementType);
      } else if (session.info.klasseId) {
        targetId = targetId ?? session.info.klasseId;
        targetType = targetType ?? ElementType.Class;
      } else {
        targetId = targetId ?? 1;
        targetType = targetType ?? ElementType.Class;
      }
    }

    const token = getOrCreateCalendarToken(session, targetId, targetType, scope);
    const scopeSuffix = scope && scope !== 'all' ? `?scope=${scope}` : '';
    const feedUrl = `${proto}://${host}/api/calendar/${token}.ics${scopeSuffix}`;
    const webcalUrl = feedUrl.replace(/^https?:\/\//i, 'webcal://');
    return { token, url: feedUrl, webcalUrl };
  };

  app.get('/api/calendar/token', handleCalendarToken);
  app.post('/api/calendar/token', handleCalendarToken);

  app.get('/api/calendar/:token.ics', async (req, reply) => {
    const params = req.params as { token: string };
    const q = req.query as Record<string, string | undefined>;
    const rawScope = q.scope;
    const scope: CalendarScope | undefined =
      rawScope === 'timetable' || rawScope === 'exams' || rawScope === 'holidays' || rawScope === 'all'
        ? rawScope
        : undefined;

    const feed = await generateICalFeed(
      params.token,
      isFixtures() || params.token === 'fixture-feed',
      scope,
    );
    if (!feed) {
      return reply.code(404).send({
        error: 'feed_not_found',
        message: 'Calendar subscription token is invalid or expired. Please generate a new feed URL.',
      });
    }

    reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `inline; filename="${feed.filename}"`)
      .header('Cache-Control', 'public, max-age=900')
      .header('X-Published-TTL', 'PT15M');
    return reply.send(feed.ics);
  });

  // --- error handling: map upstream errors to sensible HTTP statuses ---
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: 'invalid_request', details: err.issues });
    }
    if (err instanceof AuthError) return reply.code(401).send({ error: 'auth_failed', message: err.message });
    if (err instanceof PermissionError) {
      return reply.code(403).send({ error: 'permission_denied', message: err.message });
    }
    if (err instanceof SessionExpiredError) {
      return reply.code(401).send({ error: 'session_expired', message: err.message });
    }
    if (err instanceof SchoolSearchError) {
      return reply.code(502).send({ error: 'school_search_failed', message: err.message });
    }
    if (err instanceof UntisError) {
      return reply.code(502).send({ error: 'upstream_error', message: err.message, code: err.code });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    app.log.error(err);
    return reply.code(status).send({ error: 'error', message: err.message });
  });

  // --- serve built web client if present (single-origin production deployment) ---
  const webDist = path.resolve(import.meta.dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url && req.raw.url.startsWith('/api')) {
        reply.code(404).send({ error: 'not_found' });
      } else {
        reply.sendFile('index.html');
      }
    });
  }

  return app;
}
