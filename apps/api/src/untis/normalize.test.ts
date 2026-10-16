import { describe, expect, it } from 'vitest';
import {
  lessonKey,
  normalizeExam,
  normalizeHomework,
  normalizeLesson,
  normalizeMasterData,
  normalizeSubstitution,
  normalizeTimeGrid,
  type RawMasterData,
} from './normalize.js';

describe('normalizeLesson', () => {
  it('maps compact keys (kl/te/su/ro) and packed HMM times', () => {
    const lesson = normalizeLesson({
      id: 1022261,
      date: 20261014,
      startTime: 1330,
      endTime: 1510,
      kl: [{ id: 502, name: '1AHMBF', longname: '1AHMBF' }],
      te: [{ id: 182, name: 'MarD', longname: 'Markt' }],
      su: [],
      ro: [{ id: 13, name: '108', longname: '108' }],
      activityType: 'Unterricht',
    });

    expect(lesson.date).toBe('2026-10-14');
    expect(lesson.startMin).toBe(13 * 60 + 30);
    expect(lesson.endMin).toBe(15 * 60 + 10);
    expect(lesson.klassen).toEqual([{ id: 502, name: '1AHMBF', longName: '1AHMBF' }]);
    expect(lesson.teachers[0]?.name).toBe('MarD');
    expect(lesson.rooms[0]?.name).toBe('108');
    expect(lesson.status).toBe('REGULAR');
  });

  it('maps long keys (klassen/teachers/...) too', () => {
    const lesson = normalizeLesson({
      date: 20261014,
      startTime: 800,
      endTime: 850,
      klassen: [{ id: 1, name: '3AHIT' }],
      subjects: [{ id: 21, name: 'D', longName: 'Deutsch' }],
      rooms: [{ id: 31, name: 'A101' }],
      teachers: [{ id: 11, name: 'MUE' }],
    });
    expect(lesson.startMin).toBe(480);
    expect(lesson.subjects[0]).toEqual({ id: 21, name: 'D', longName: 'Deutsch' });
    expect(lesson.teachers[0]?.name).toBe('MUE');
  });

  it('flags cancelled and irregular lessons', () => {
    const cancelled = normalizeLesson({ date: 20261013, startTime: 850, endTime: 940, code: 'cancelled' });
    expect(cancelled.status).toBe('CANCELLED');
    const irregular = normalizeLesson({ date: 20261013, startTime: 850, endTime: 940, code: 'irregular' });
    expect(irregular.status).toBe('IRREGULAR');
  });

  it('carries substText and info through', () => {
    const lesson = normalizeLesson({
      date: 20261014,
      startTime: 1210,
      endTime: 1255,
      code: 'irregular',
      substText: 'Schulsprecherwahl',
      info: 'Raum geändert',
    });
    expect(lesson.substText).toBe('Schulsprecherwahl');
    expect(lesson.info).toBe('Raum geändert');
  });
});

describe('lessonKey', () => {
  it('is stable regardless of ref order', () => {
    const a = lessonKey({ date: '2026-10-14', startMin: 480, subjects: [{ id: 1, name: 'x' }, { id: 2, name: 'y' }], rooms: [{ id: 5, name: 'r' }] });
    const b = lessonKey({ date: '2026-10-14', startMin: 480, subjects: [{ id: 2, name: 'y' }, { id: 1, name: 'x' }], rooms: [{ id: 5, name: 'r' }] });
    expect(a).toBe(b);
  });
});

describe('normalizeSubstitution', () => {
  it('maps cancelled code to CANCELLED kind', () => {
    const sub = normalizeSubstitution({ date: 20261013, startTime: 850, endTime: 940, code: 'cancelled', substText: 'Entfall' });
    expect(sub.kind).toBe('CANCELLED');
    expect(sub.text).toBe('Entfall');
    expect(sub.after?.status).toBe('CANCELLED');
  });

  it('maps a room-change type', () => {
    const sub = normalizeSubstitution({
      date: 20261015,
      startTime: 855,
      endTime: 945,
      code: 'irregular',
      type: 'roomchange',
    });
    expect(sub.kind).toBe('ROOM_CHANGE');
  });
});

describe('normalizeTimeGrid', () => {
  it('flattens the Monday units and converts T-prefixed times', () => {
    const grid: RawMasterData['timeGrid'] = {
      days: [
        {
          day: 'MON',
          units: [
            { label: '0', startTime: 'T07:10', endTime: 'T08:00' },
            { label: '1', startTime: 'T08:00', endTime: 'T08:50' },
          ],
        },
        { day: 'TUE', units: [{ label: '0', startTime: 'T07:10', endTime: 'T08:00' }] },
      ],
    };
    expect(normalizeTimeGrid(grid)).toEqual([
      { name: '0', startMin: 430, endMin: 480 },
      { name: '1', startMin: 480, endMin: 530 },
    ]);
  });
});

describe('normalizeMasterData', () => {
  it('normalizes refs, school years and holidays', () => {
    const raw: RawMasterData = {
      klassen: [{ id: 1, name: '3AHIT' }],
      teachers: [{ id: 11, name: 'MUE', longName: 'Müller' }],
      subjects: [{ id: 21, name: 'D' }],
      rooms: [{ id: 31, name: 'A101' }],
      departments: [{ id: 41, name: 'IT' }],
      schoolyears: [{ id: 1, name: '2026/2027', startDate: 20260914, endDate: 20270711 }],
      holidays: [{ id: 1, name: 'X', startDate: 20261027, endDate: 20261028 }],
    };
    const md = normalizeMasterData(raw);
    expect(md.klassen[0]).toEqual({ id: 1, name: '3AHIT', longName: undefined });
    expect(md.teachers[0]?.longName).toBe('Müller');
    expect(md.currentSchoolYear?.startDate).toBe('2026-09-14');
    expect(md.holidays[0]?.endDate).toBe('2026-10-28');
  });
});

describe('normalizeExam', () => {
  it('normalizes modern REST exam schema (/WebUntis/api/rest/view/v1/exams)', () => {
    const raw = {
      examId: 71301,
      examType: {
        id: 2,
        shortName: 'SA_TE',
        longName: 'Schularbeit/Test',
        displayName: 'Schularbeit/Test',
      },
      name: 'SA 1',
      subject: 'WMC_1',
      startDate: 20261019,
      endDate: 20261019,
      startTime: 1310,
      endTime: 1400,
      invigilators: [
        {
          teachers: [
            {
              id: 170,
              shortName: 'WEIX',
              longName: 'WEIXLBAUM',
            },
          ],
        },
      ],
      rooms: [
        {
          id: 343,
          shortName: 'N306',
          longName: '3BHIF, KV: GIEB',
        },
      ],
    };

    const exam = normalizeExam(raw);
    expect(exam.id).toBe(71301);
    expect(exam.date).toBe('2026-10-19');
    expect(exam.startMin).toBe(13 * 60 + 10);
    expect(exam.endMin).toBe(14 * 60);
    expect(exam.type).toBe('Schularbeit/Test');
    expect(exam.text).toBe('SA 1');
    expect(exam.subject).toEqual({ id: 0, name: 'WMC_1', longName: 'WMC_1' });
    expect(exam.teachers).toEqual([{ id: 170, name: 'WEIX', longName: 'WEIXLBAUM' }]);
    expect(exam.rooms).toEqual([{ id: 343, name: 'N306', longName: '3BHIF, KV: GIEB' }]);
  });
});

describe('normalizeHomework', () => {
  it('normalizes enriched homework items with lessons and teachers', () => {
    const raw = {
      id: 25942,
      date: 20261006,
      dueDate: 20261103,
      text: 'ng-stop-watch',
      completed: false,
      subject: { id: 302311, name: 'WMC_1', longName: 'WMC_1' },
      teacher: { id: 188, name: 'SCRE', longName: 'SCRE' },
    };

    const hw = normalizeHomework(raw);
    expect(hw.id).toBe(25942);
    expect(hw.date).toBe('2026-10-06');
    expect(hw.dueDate).toBe('2026-11-03');
    expect(hw.text).toBe('ng-stop-watch');
    expect(hw.completed).toBe(false);
    expect(hw.subject).toEqual({ id: 302311, name: 'WMC_1', longName: 'WMC_1' });
    expect(hw.teacher).toEqual({ id: 188, name: 'SCRE', longName: 'SCRE' });
  });
});
