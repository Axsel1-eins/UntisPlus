import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthError,
  PermissionError,
  SessionExpiredError,
  WebUntisClient,
} from './client.js';

/** Minimal fetch Response stand-in for the JSON-RPC client. */
function jsonResponse(obj: unknown, setCookies: string[] = []) {
  return {
    ok: true,
    status: 200,
    json: async () => obj,
    text: async () => JSON.stringify(obj),
    headers: { getSetCookie: () => setCookies },
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebUntisClient (mocked upstream)', () => {
  it('logs in anonymously, requests options-style timetable, and maps names', async () => {
    const fetchMock = vi.fn(async (_url: string, opts: { body?: string }) => {
      const body = opts.body ? JSON.parse(opts.body) : {};
      if (body.method === 'getUserData2017') {
        return jsonResponse({ result: { masterData: { klassen: [{ id: 1, name: '1A' }] } } }, [
          'JSESSIONID=sess-1; Path=/',
        ]);
      }
      return jsonResponse({
        result: [
          {
            id: 1,
            date: 20261014,
            startTime: 800,
            endTime: 850,
            kl: [{ id: 1, name: '1A' }],
            te: [{ id: 7, name: 'MUE' }],
            su: [{ id: 3, name: 'D' }],
            ro: [{ id: 9, name: 'A101' }],
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    await client.loginAnonymous();
    expect(client.connected).toBe(true);

    const lessons = await client.getTimetable({ id: 1, type: 1 }, '2026-10-14', '2026-10-14');
    expect(lessons).toHaveLength(1);
    expect(lessons[0]?.teachers[0]?.name).toBe('MUE');
    expect(lessons[0]?.startMin).toBe(480);

    // It should have used the options-style params (not the flat fallback).
    const ttCall = fetchMock.mock.calls.find(([, o]) => JSON.parse(o.body ?? '{}').method === 'getTimetable');
    expect(JSON.parse(ttCall![1].body ?? '{}').params.options).toBeTruthy();
  });

  it('transparently renews an expired anonymous session and retries', async () => {
    let ttAttempts = 0;
    let logins = 0;
    const fetchMock = vi.fn(async (_url: string, opts: { body?: string }) => {
      const body = opts.body ? JSON.parse(opts.body) : {};
      if (body.method === 'getUserData2017') {
        logins += 1;
        return jsonResponse({ result: { masterData: { klassen: [{ id: 1, name: '1A' }] } } }, [
          `JSESSIONID=sess-${logins}; Path=/`,
        ]);
      }
      if (body.method === 'getTimetable') {
        ttAttempts += 1;
        if (ttAttempts === 1) {
          return jsonResponse({ error: { code: -8520, message: 'not authenticated' } });
        }
        return jsonResponse({ result: [] });
      }
      return jsonResponse({ result: {} });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    client.reauth = async () => {
      await client.loginAnonymous();
    };
    await client.loginAnonymous();

    // First upstream call fails with -8520 -> reauth -> retry succeeds.
    const lessons = await client.getTimetable({ id: 1, type: 1 }, '2026-10-14', '2026-10-14');
    expect(lessons).toEqual([]);
    expect(logins).toBe(2);
    expect(ttAttempts).toBe(2);
  });

  it('maps permission errors from upstream messages', async () => {
    const fetchMock = vi.fn(async (_url: string, opts: { body?: string }) => {
      const body = opts.body ? JSON.parse(opts.body) : {};
      if (body.method === 'getUserData2017') {
        return jsonResponse({ result: { masterData: {} } }, ['JSESSIONID=s; Path=/']);
      }
      return jsonResponse({ error: { code: -8509, message: 'no right for getSubstitutions()' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    await client.loginAnonymous();
    await expect(client.getSubstitutions('2026-10-12', '2026-10-16')).rejects.toBeInstanceOf(PermissionError);
  });

  it('maps bad credentials to an AuthError', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: -8504, message: 'bad credentials' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    await expect(client.loginPassword('u', 'wrong')).rejects.toBeInstanceOf(AuthError);
  });

  it('throws SessionExpiredError when a session expires and no reauth is set', async () => {
    const fetchMock = vi.fn(async (_url: string, opts: { body?: string }) => {
      const body = opts.body ? JSON.parse(opts.body) : {};
      if (body.method === 'getUserData2017') {
        return jsonResponse({ result: { masterData: {} } }, ['JSESSIONID=s; Path=/']);
      }
      return jsonResponse({ error: { code: -8510, message: 'session expired' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    await client.loginAnonymous();
    await expect(client.getTimetable({ id: 1, type: 1 }, '2026-10-14', '2026-10-14')).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  it('authenticates with password and returns person identity (student/teacher)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        result: {
          sessionId: 'test-session-123',
          personType: 5,
          personId: 987,
          klasseId: 42,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    const identity = await client.loginPassword('student1', 'pass123');
    expect(identity.personType).toBe(5);
    expect(identity.personId).toBe(987);
    expect(identity.klasseId).toBe(42);
    expect(client.connected).toBe(true);
  });

  it('authenticates with secret/QR and returns parent identity with children', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          result: {
            masterData: { klassen: [{ id: 1, name: '1A' }] },
            userData: {
              elemId: 100,
              elemType: 12,
              displayName: 'Parent User',
              children: [{ id: 501, name: 'Child One', klasseId: 1 }],
            },
          },
        },
        ['JSESSIONID=sess-parent; Path=/'],
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    const identity = await client.loginSecret('parent1', 'JBSWY3DPEHPK3PXP');
    expect(identity.personType).toBe(12);
    expect(identity.personId).toBe(100);
    expect(identity.displayName).toBe('Parent User');
    expect(identity.children).toHaveLength(1);
    expect(identity.children?.[0]?.name).toBe('Child One');
  });

  it('falls back to web HTML parser when getTimetableWithAbsences RPC yields -8509', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('jsonrpc.do')) {
        return jsonResponse({
          error: { code: -8509, message: 'no right for getTimetableWithAbsences()' },
        });
      }
      if (url.includes('absencetimes.do')) {
        return {
          ok: true,
          status: 200,
          text: async () => `
            <html>
              <body>
                <table>
                  <tr>
                    <td>14.10.2026</td>
                    <td>08:00 - 08:50</td>
                    <td>D</td>
                    <td>Arzttermin</td>
                    <td>entschuldigt</td>
                  </tr>
                </table>
              </body>
            </html>
          `,
        } as unknown as Response;
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    const absences = await client.getAbsences('2026-10-12', '2026-10-16');
    expect(absences).toHaveLength(1);
    expect(absences[0]).toMatchObject({
      start: '2026-10-14',
      end: '2026-10-14',
      excused: true,
      reason: 'Arzttermin',
    });
  });

  it('returns empty array when web HTML contains Nichts anzuzeigen', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('jsonrpc.do')) {
        return jsonResponse({
          error: { code: -8509, message: 'no right for getTimetableWithAbsences()' },
        });
      }
      if (url.includes('absencetimes.do')) {
        return {
          ok: true,
          status: 200,
          text: async () => '<div><span class="empty">Nichts anzuzeigen</span></div>',
        } as unknown as Response;
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    const absences = await client.getAbsences('2026-10-12', '2026-10-16');
    expect(absences).toEqual([]);
  });

  it('fetches absences via primary reverse-engineered classreg endpoint', async () => {
    let requestedUrl = '';
    const fetchMock = vi.fn(async (url: string) => {
      requestedUrl = url;
      if (url.includes('/WebUntis/api/classreg/absences/students')) {
        return jsonResponse({
          data: {
            absences: [
              {
                id: 456,
                startDate: 20261014,
                endDate: 20261014,
                startTime: 750,
                endTime: 1310,
                reason: 'Krankheit',
                text: 'Grippe',
                isExcused: true,
                excuseStatus: 'entschuldigt',
              },
            ],
          },
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    client.personId = 987;
    const absences = await client.getAbsences('2026-10-12', '2026-10-16');

    expect(requestedUrl).toContain('/WebUntis/api/classreg/absences/students');
    expect(requestedUrl).toContain('studentId=987');
    expect(requestedUrl).toContain('startDate=20261012');
    expect(requestedUrl).toContain('endDate=20261016');
    expect(absences).toHaveLength(1);
    expect(absences[0]).toEqual({
      id: '456',
      start: '2026-10-14',
      end: '2026-10-14',
      startTime: '07:50',
      endTime: '13:10',
      excused: true,
      excuseStatus: 'entschuldigt',
      reason: 'Krankheit',
      text: 'Grippe',
      periods: 6,
    });
  });

  it('fetches and filters exams via reverse-engineered exams API with assignedStudents and generates stable IDs', async () => {
    let examUrl = '';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/WebUntis/api/exams')) {
        examUrl = url;
        return jsonResponse({
          data: {
            exams: [
              {
                id: 101,
                name: 'Math Exam',
                examDate: 20261019,
                startTime: 800,
                endTime: 850,
                assignedStudents: [{ id: 987 }],
              },
              {
                id: 102,
                name: 'English Exam',
                examDate: 20261020,
                startTime: 850,
                endTime: 940,
                assignedStudents: [{ id: 999 }], // different student
              },
              {
                id: 0, // id is 0! Needs stable hash ID
                name: 'Physics Exam',
                examDate: 20261021,
                startTime: 1000,
                endTime: 1050,
                assignedStudents: [], // empty -> keep
              },
            ],
          },
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    client.personId = 987;
    client.klasseId = 42;

    const exams = await client.getExams('2026-10-19', '2026-10-25');
    expect(examUrl).toContain('/WebUntis/api/exams');
    expect(examUrl).toContain('klasseId=42');
    expect(examUrl).toContain('withGrades=true');

    expect(exams).toHaveLength(2);
    expect(exams[0]?.id).toBe(101);
    expect(exams[0]?.text).toBe('Math Exam');

    // Exam 2 was filtered out because assignedStudents was for 999 only.
    // Exam 3 has stable nonzero generated id
    expect(exams[1]?.id).toBeGreaterThan(0);
    expect(exams[1]?.text).toBe('Physics Exam');
  });

  it('queries room occupancy directly via getRoomOccupancy', async () => {
    const fetchMock = vi.fn(async (_url: string, opts: { body?: string }) => {
      const body = opts.body ? JSON.parse(opts.body) : {};
      if (body.method === 'getTimetable') {
        return jsonResponse({
          result: [
            {
              id: 1,
              date: 20261014,
              startTime: 840,
              endTime: 930,
              ro: [{ id: 31, name: 'A101' }],
              su: [{ id: 5, name: 'M' }],
            },
          ],
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WebUntisClient({ server: 'x.webuntis.com', school: 'x' });
    const grid = [
      { name: '1', startMin: 470, endMin: 520 },
      { name: '2', startMin: 520, endMin: 570 },
    ];
    const occupancies = await client.getRoomOccupancy(
      '2026-10-14',
      [{ id: 31, name: 'A101' }],
      grid,
      480, // currentMin: 480 (free now during period 1)
    );

    expect(occupancies).toHaveLength(1);
    expect(occupancies[0]?.room.name).toBe('A101');
    expect(occupancies[0]?.isFreeNow).toBe(true);
    expect(occupancies[0]?.slots[0]?.occupied).toBe(false);
    expect(occupancies[0]?.slots[1]?.occupied).toBe(true);
  });
});
