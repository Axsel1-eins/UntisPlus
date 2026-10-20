import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from './server.js';

/**
 * Integration tests that run entirely against fixtures (`FIXTURES=1`), so they need no
 * network and no WebUntis account.
 */
describe('API (fixtures mode)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.FIXTURES = '1';
    app = await createServer({
      search: async (q) => [
        { server: 'example.webuntis.com', loginName: 'example', displayName: `Result for ${q}` },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
    delete process.env.FIXTURES;
  });

  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, fixtures: true });
  });

  it('searches schools', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/schools?q=htl' });
    expect(res.statusCode).toBe(200);
    expect(res.json().schools[0]).toMatchObject({ server: 'example.webuntis.com' });
  });

  it('short-circuits too-short searches', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/schools?q=h' });
    expect(res.json().schools).toEqual([]);
  });

  it('creates a session and sets a cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { server: 'fixture.webuntis.com', school: 'fixture', mode: 'anonymous' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ mode: 'anonymous', readOnly: true });
    expect(res.headers['set-cookie']).toBeTruthy();
  });

  it('supports /api/session/login as alias for /api/session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/session/login',
      payload: { server: 'fixture.webuntis.com', school: 'fixture', mode: 'anonymous' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ mode: 'anonymous', readOnly: true });
    expect(res.headers['set-cookie']).toBeTruthy();
  });

  it('gates the fixtures session on the marker cookie (so onboarding is reachable)', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/session' });
    expect(anon.statusCode).toBe(401);

    const loggedIn = await app.inject({
      method: 'GET',
      url: '/api/session',
      cookies: { up_session: 'fixture' },
    });
    expect(loggedIn.statusCode).toBe(200);
    expect(loggedIn.json()).toMatchObject({ mode: 'anonymous', readOnly: true });
  });

  it('authenticates session via Authorization: Bearer token header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { authorization: 'Bearer fixture' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ mode: 'anonymous', readOnly: true, token: 'fixture' });
  });

  it('authenticates session via X-Session-Token header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { 'x-session-token': 'fixture' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ mode: 'anonymous', readOnly: true, token: 'fixture' });
  });

  it('returns master data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/master' });
    expect(res.statusCode).toBe(200);
    const md = res.json();
    expect(md.klassen.length).toBeGreaterThan(0);
    expect(md.timeGrid.length).toBeGreaterThan(0);
  });

  it('returns a timetable for an explicit range containing lessons', async () => {
    // 2026-10-12 is a Monday, so the fixture weekly pattern applies.
    const res = await app.inject({ method: 'GET', url: '/api/timetable?start=2026-10-12&end=2026-10-16&targetId=1' });
    expect(res.statusCode).toBe(200);
    const { lessons } = res.json();
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.every((l: { date: string }) => l.date >= '2026-10-12' && l.date <= '2026-10-16')).toBe(true);
  });

  it('serves fixture homework, exams, absences and messages', async () => {
    const today = todayIso();
    const plus = (iso: string, days: number) => {
      const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
      const dt = new Date(y, m - 1, d + days);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };

    const hw = await app.inject({
      method: 'GET',
      url: `/api/homework?start=${today}&end=${plus(today, 21)}`,
    });
    expect(hw.statusCode).toBe(200);
    expect(hw.json().available).toBe(true);
    expect(hw.json().data.length).toBeGreaterThan(0);
    expect(hw.json().data[0]).toHaveProperty('text');

    const ex = await app.inject({
      method: 'GET',
      url: `/api/exams?start=${today}&end=${plus(today, 60)}`,
    });
    expect(ex.json().data.length).toBeGreaterThan(0);
    expect(ex.json().data[0]).toHaveProperty('startMin');

    const ab = await app.inject({
      method: 'GET',
      url: `/api/absences?start=${plus(today, -60)}&end=${today}`,
    });
    expect(ab.json().data.length).toBeGreaterThan(0);
    expect(ab.json().data[0]).toHaveProperty('excused');

    const ms = await app.inject({ method: 'GET', url: `/api/messages?date=${today}` });
    expect(ms.json().data.length).toBe(2);
    expect(ms.json().data[0]).toHaveProperty('subject');
  });

  it('generates a calendar feed token and serves RFC 5545 iCal data', async () => {
    const tokenRes = await app.inject({
      method: 'GET',
      url: '/api/calendar/token',
      cookies: { up_session: 'fixture' },
    });
    expect(tokenRes.statusCode).toBe(200);
    const body = tokenRes.json();
    expect(body).toHaveProperty('token');
    expect(body.url).toContain('/api/calendar/');
    expect(body.webcalUrl).toMatch(/^webcal:\/\//);

    const icsRes = await app.inject({
      method: 'GET',
      url: `/api/calendar/${body.token}.ics`,
    });
    expect(icsRes.statusCode).toBe(200);
    expect(icsRes.headers['content-type']).toContain('text/calendar');
    expect(icsRes.body).toContain('BEGIN:VCALENDAR');
    expect(icsRes.body).toContain('VERSION:2.0');
    expect(icsRes.body).toContain('X-PUBLISHED-TTL:PT15M');
    expect(icsRes.body).toContain('BEGIN:VEVENT');
    expect(icsRes.body).toContain('END:VCALENDAR');
  });

  it('filters timetable by teacher targetType', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/timetable?start=2026-10-12&end=2026-10-16&targetId=11&targetType=teacher',
    });
    expect(res.statusCode).toBe(200);
    const { lessons } = res.json();
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.every((l: { teachers: { id: number }[] }) => l.teachers.some((t) => t.id === 11))).toBe(true);
  });

  it('filters timetable by room targetType', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/timetable?start=2026-10-12&end=2026-10-16&targetId=31&targetType=room',
    });
    expect(res.statusCode).toBe(200);
    const { lessons } = res.json();
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.every((l: { rooms: { id: number }[] }) => l.rooms.some((r) => r.id === 31))).toBe(true);
  });

  it('serves holidays in master data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/master' });
    expect(res.statusCode).toBe(200);
    const md = res.json();
    expect(md.holidays.length).toBeGreaterThan(0);
    expect(md.holidays.some((h: { name: string }) => h.name === 'Herbstferien')).toBe(true);
  });

  it('serves calendar feeds filtered by scope', async () => {
    // Exams scope
    const examsRes = await app.inject({
      method: 'GET',
      url: '/api/calendar/fixture-feed.ics?scope=exams',
    });
    expect(examsRes.statusCode).toBe(200);
    expect(examsRes.body).toContain('[PRÜFUNG]');
    expect(examsRes.body).toContain('BEGIN:VALARM');
    expect(examsRes.body).not.toContain('Ferien:');

    // Holidays scope
    const holidaysRes = await app.inject({
      method: 'GET',
      url: '/api/calendar/fixture-feed.ics?scope=holidays',
    });
    expect(holidaysRes.statusCode).toBe(200);
    expect(holidaysRes.body).toContain('DTSTART;VALUE=DATE:');
    expect(holidaysRes.body).toContain('TRANSP:TRANSPARENT');
    expect(holidaysRes.body).toContain('Ferien: Herbstferien');
    expect(holidaysRes.body).not.toContain('[PRÜFUNG]');
  });

  it('serves room occupancy for room finder', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/rooms/occupancy?date=2026-10-14`,
    });
    expect(res.statusCode).toBe(200);
    const { occupancies } = res.json();
    expect(Array.isArray(occupancies)).toBe(true);
    expect(occupancies.length).toBeGreaterThan(0);
    expect(occupancies[0]).toHaveProperty('room');
    expect(occupancies[0]).toHaveProperty('slots');
    expect(occupancies[0]).toHaveProperty('isFreeNow');
  });

  it('persists sessions to disk and reloads them with reauth intact', async () => {
    const { createSession, destroySession, getSession, loadSessions, SESSIONS_CACHE_FILE } = await import('./sessions.js');
    const fs = await import('node:fs');

    // Mock client login to avoid real network call
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          sessionId: 'persisted-session-sid',
          personType: 5,
          personId: 777,
          klasseId: 10,
        },
      }),
      headers: { getSetCookie: () => ['JSESSIONID=persisted-session-sid; Path=/'] },
    })) as unknown as typeof fetch;

    try {
      const session = await createSession({
        server: 'test.webuntis.com',
        school: 'test-school',
        mode: 'password',
        user: 'testuser',
        password: 'testpassword',
      });

      expect(fs.existsSync(SESSIONS_CACHE_FILE)).toBe(true);
      const cacheContent = fs.readFileSync(SESSIONS_CACHE_FILE, 'utf8');
      expect(cacheContent).toContain(session.token);
      expect(cacheContent).toContain('testuser');

      // Now test reloading: loadSessions reconstructs the WebUntisClient
      loadSessions();
      const restored = getSession(session.token);
      expect(restored).toBeTruthy();
      expect(restored?.mode).toBe('password');
      expect(restored?.credentials?.user).toBe('testuser');
      expect(restored?.info.personId).toBe(777);
      expect(restored?.client.personId).toBe(777);
      expect(typeof restored?.client.reauth).toBe('function');

      // Test destroy removes from disk
      await destroySession(session.token);
      const afterDestroy = fs.readFileSync(SESSIONS_CACHE_FILE, 'utf8');
      expect(afterDestroy).not.toContain(session.token);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
