import {
  computeRoomOccupancy,
  dateToInt,
  deduplicateExams,
  ElementType,
  intToIsoDate,
  untisTimeToMinutes,
  type Absence,
  type AuthMode,
  type ChildProfile,
  type Exam,
  type Homework,
  type Lesson,
  type MasterData,
  type Message,
  type Ref,
  type RoomOccupancy,
  type Substitution,
  type TimeGridSlot,
  type TimelineTarget,
} from '@untisplus/shared';
import { ANONYMOUS_OTP, totp } from './totp.js';
import {
  normalizeAbsence,
  normalizeExam,
  normalizeHomework,
  normalizeLesson,
  normalizeMasterData,
  normalizeSubstitution,
  type RawLesson,
  type RawMasterData,
  type RawSubstitution,
} from './normalize.js';

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function formatUntisTime(t: number | string | undefined): string | undefined {
  if (t === undefined || t === null) return undefined;
  if (typeof t === 'string' && t.includes(':')) return t;
  const num = Number(t);
  if (isNaN(num)) return undefined;
  const h = Math.floor(num / 100);
  const m = num % 100;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const IDENTITY = 'UntisPlus/0.1 (+https://github.com/untisplus)';

export class UntisError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly method?: string,
  ) {
    super(message);
    this.name = 'UntisError';
  }
}
export class AuthError extends UntisError {
  override name = 'AuthError';
}
export class SessionExpiredError extends UntisError {
  override name = 'SessionExpiredError';
}
export class PermissionError extends UntisError {
  override name = 'PermissionError';
}
export class UpstreamError extends UntisError {
  override name = 'UpstreamError';
}

interface RpcError {
  code: number;
  message: string;
}

interface RpcResponse<T> {
  result?: T;
  error?: RpcError;
}

interface ClientOptions {
  server: string;
  school: string;
  clientId?: string;
}

export interface LoginIdentity {
  personId?: number;
  personType?: number;
  klasseId?: number;
  displayName?: string;
  children?: ChildProfile[];
  masterData?: RawMasterData;
}

interface OtpLoginResult {
  masterData: RawMasterData;
  userData?: unknown;
  settings?: unknown;
}

/**
 * A thin, dependency-free WebUntis client covering the flows we verified:
 *   - anonymous login (public data, no account)
 *   - password login (classic JSON-RPC)
 *   - app-secret / TOTP login (works for 2FA accounts)
 *
 * It speaks JSON-RPC via `/WebUntis/jsonrpc.do` and the internal `/WebUntis/jsonrpc_intern.do`,
 * and the SPA's REST endpoints for homework/messages.
 */
export class WebUntisClient {
  readonly server: string;
  readonly school: string;
  readonly clientId: string;
  mode: AuthMode = 'anonymous';
  personId?: number;
  personType?: number;
  klasseId?: number;

  private sessionId?: string;
  private jwtToken?: string;
  /** Which getTimetable param style this server accepted. */
  private timetableStyle?: 'options' | 'flat';
  /** Master data captured at login (the intern endpoint returns it in one shot). */
  private rawMasterData?: RawMasterData;

  constructor(opts: ClientOptions) {
    this.server = opts.server;
    this.school = opts.school;
    this.clientId = opts.clientId ?? IDENTITY;
  }

  get connected(): boolean {
    return Boolean(this.sessionId);
  }

  private base(): string {
    return `https://${this.server}`;
  }

  private cookies(): string {
    const schoolB64 = Buffer.from(this.school, 'utf8').toString('base64');
    return `JSESSIONID=${this.sessionId}; schoolname=_${schoolB64}`;
  }

  private mapError(method: string, error: RpcError): never {
    const message = error.message ?? 'unknown error';
    if (/no right for/i.test(message)) throw new PermissionError(message, error.code, method);
    if (error.code === -8520 || error.code === -8509 || error.code === -8510) {
      throw new SessionExpiredError(message, error.code, method);
    }
    if (error.code === -8504 || error.code === -8998 || error.code === -8523) {
      throw new AuthError(message, error.code, method);
    }
    throw new UntisError(message, error.code, method);
  }

  /** Perform a JSON-RPC call against the classic endpoint, with session retry. */
  async rpc<T>(method: string, params: unknown = {}, retry = true): Promise<T> {
    const doCall = async (): Promise<T> => {
      const res = await fetch(`${this.base()}/WebUntis/jsonrpc.do?school=${encodeURIComponent(this.school)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.sessionId ? { Cookie: this.cookies() } : {}),
        },
        body: JSON.stringify({ id: '1', method, params, jsonrpc: '2.0' }),
        signal: AbortSignal.timeout(20_000),
      });
      const json = (await res.json()) as RpcResponse<T>;
      if (json.error) this.mapError(method, json.error);
      if (json.result === undefined) throw new UpstreamError('Server returned no result', undefined, method);
      return json.result;
    };

    try {
      return await doCall();
    } catch (err) {
      // Expired sessions are renewed transparently when the session layer provides `reauth`
      // (this includes anonymous/public sessions, which expire roughly every few minutes).
      if (retry && err instanceof SessionExpiredError && this.reauth) {
        await this.reauth();
        return doCall();
      }
      throw err;
    }
  }

  /** Set by the session layer so expired sessions can be transparently renewed. */
  reauth?: () => Promise<void>;

  private async rpcCall(
    endpoint: string,
    path: string,
    method: string,
    params: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    return fetch(`${this.base()}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.sessionId ? { Cookie: this.cookies() } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify({ id: '1', method, params, jsonrpc: '2.0' }),
      signal: AbortSignal.timeout(20_000),
    });
  }

  // --- login flows ---

  /** Anonymous/public login using the fixed OTP. Returns master data and keeps a session. */
  async loginAnonymous(): Promise<LoginIdentity> {
    const body = await this.rpcCall(
      '/WebUntis/jsonrpc_intern.do?m=getUserData2017&school=' +
        encodeURIComponent(this.school) +
        '&v=i2.2',
      '',
      'getUserData2017',
      [{ auth: { clientTime: Date.now(), user: '#anonymous#', otp: ANONYMOUS_OTP } }],
    );
    const json = (await body.json()) as RpcResponse<OtpLoginResult>;
    if (json.error) this.mapError('getUserData2017', json.error);
    const sid = this.extractSessionId(body.headers.getSetCookie?.() ?? []);
    if (sid) this.sessionId = sid;
    this.mode = 'anonymous';
    this.rawMasterData = json.result?.masterData ?? {};
    return { masterData: this.rawMasterData };
  }

  /** Classic password login. Returns the authenticated person identity. */
  async loginPassword(user: string, password: string): Promise<LoginIdentity> {
    const res = await fetch(`${this.base()}/WebUntis/jsonrpc.do?school=${encodeURIComponent(this.school)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '1',
        method: 'authenticate',
        params: { user, password, client: this.clientId },
        jsonrpc: '2.0',
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json()) as RpcResponse<{
      sessionId: string;
      personType?: number;
      personId?: number;
      klasseId?: number;
    }>;
    if (json.error) this.mapError('authenticate', json.error);
    if (!json.result?.sessionId) throw new AuthError('No session id returned');
    this.sessionId = json.result.sessionId;
    this.mode = 'password';
    this.personId = json.result.personId;
    this.personType = json.result.personType;
    this.klasseId = json.result.klasseId;

    let children: ChildProfile[] | undefined;
    let displayName: string | undefined;

    // For parent accounts (personType 12) or to retrieve user details, consult internUserDataFull
    if (json.result.personType === 12) {
      const intern = await this.internUserDataFull().catch(() => null);
      if (intern?.userData) {
        const ud = intern.userData as Record<string, any>;
        displayName = ud.displayName ?? ud.name;
        if (Array.isArray(ud.children)) {
          children = ud.children.map((c: any) => ({
            id: Number(c.id ?? c.elemId),
            name: c.name ?? c.displayName ?? (c.firstName ? `${c.firstName} ${c.lastName}` : undefined),
            klasseId: c.klasseId ? Number(c.klasseId) : undefined,
          }));
        }
      }
    }

    return {
      personId: json.result.personId,
      personType: json.result.personType,
      klasseId: json.result.klasseId,
      displayName,
      children,
    };
  }

  /** App-secret (TOTP) login — required for 2FA accounts. */
  async loginSecret(user: string, secret: string, mode: AuthMode = 'secret'): Promise<LoginIdentity> {
    const code = totp(secret, Date.now());
    const body = await this.rpcCall(
      '/WebUntis/jsonrpc_intern.do?m=getUserData2017&school=' +
        encodeURIComponent(this.school) +
        '&v=i2.2',
      '',
      'getUserData2017',
      [{ auth: { clientTime: Date.now(), user, otp: code } }],
    );
    const json = (await body.json()) as RpcResponse<OtpLoginResult>;
    if (json.error) this.mapError('getUserData2017', json.error);
    const sid = this.extractSessionId(body.headers.getSetCookie?.() ?? []);
    if (sid) this.sessionId = sid;
    this.mode = mode;
    this.rawMasterData = json.result?.masterData ?? {};

    const ud = (json.result?.userData ?? {}) as Record<string, any>;
    this.personId = ud.elemId ? Number(ud.elemId) : ud.personId ? Number(ud.personId) : undefined;
    this.personType = ud.elemType ? Number(ud.elemType) : ud.personType ? Number(ud.personType) : undefined;
    this.klasseId = ud.klasseId ? Number(ud.klasseId) : undefined;

    const childrenRaw = Array.isArray(ud.children) ? ud.children : [];
    const children: ChildProfile[] = childrenRaw.map((c: any) => ({
      id: Number(c.id ?? c.elemId),
      name: c.name ?? c.displayName ?? (c.firstName ? `${c.firstName} ${c.lastName}` : undefined),
      klasseId: c.klasseId ? Number(c.klasseId) : undefined,
    }));

    return {
      masterData: this.rawMasterData,
      personId: this.personId,
      personType: this.personType,
      klasseId: this.klasseId,
      displayName: ud.displayName ?? ud.name,
      children: children.length ? children : undefined,
    };
  }

  private extractSessionId(setCookies: string[]): string | undefined {
    for (const c of setCookies) {
      const m = /JSESSIONID=([^;]+)/.exec(c);
      if (m) return m[1];
    }
    return undefined;
  }

  async logout(): Promise<void> {
    try {
      if (this.sessionId) {
        await fetch(`${this.base()}/WebUntis/jsonrpc.do?school=${encodeURIComponent(this.school)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: this.cookies() },
          body: JSON.stringify({ id: '1', method: 'logout', params: {}, jsonrpc: '2.0' }),
          signal: AbortSignal.timeout(10_000),
        });
      }
    } catch {
      // Polite logout is best-effort.
    } finally {
      this.sessionId = undefined;
      this.jwtToken = undefined;
    }
  }

  // --- data ---

  async getMasterData(): Promise<MasterData> {
    // The intern endpoint returns the full master data in one call and works with the
    // session cookie alone, so prefer it; fall back to the individual endpoints.
    if (this.rawMasterData?.klassen) return normalizeMasterData(this.rawMasterData);

    const fresh = await this.internUserData().catch(() => null);
    if (fresh?.klassen) {
      this.rawMasterData = fresh;
      return normalizeMasterData(fresh);
    }

    const [klassen, teachers, subjects, rooms, departments, holidays, schoolyear, timegridUnits] = await Promise.all([
      this.rpc<RawMasterData['klassen']>('getKlassen', {}).catch(() => []),
      this.rpc<RawMasterData['teachers']>('getTeachers', {}).catch(() => []),
      this.rpc<RawMasterData['subjects']>('getSubjects', {}).catch(() => []),
      this.rpc<RawMasterData['rooms']>('getRooms', {}).catch(() => []),
      this.rpc<RawMasterData['departments']>('getDepartments', {}).catch(() => []),
      this.rpc<RawMasterData['holidays']>('getHolidays', {}).catch(() => []),
      this.rpc<RawMasterData['schoolyears']>('getSchoolyears', {}).catch(() => []),
      this.rpc<any[]>('getTimegridUnits', {}).catch(() => []),
    ]);
    return normalizeMasterData({
      klassen,
      teachers,
      subjects,
      rooms,
      departments,
      holidays,
      schoolyears: schoolyear,
      timegridUnits,
    });
  }

  /** Fetch full internal user data and master data using current session cookie. */
  async internUserDataFull(): Promise<OtpLoginResult | null> {
    if (!this.sessionId) return null;
    const res = await this.rpcCall(
      '/WebUntis/jsonrpc_intern.do?m=getUserData2017&school=' + encodeURIComponent(this.school) + '&v=i2.2',
      '',
      'getUserData2017',
      [{ auth: {} }],
    );
    const json = (await res.json()) as RpcResponse<OtpLoginResult>;
    if (json.error) return null;
    return json.result ?? null;
  }

  /** Re-fetch the internal user data (master data) using the current session cookie. */
  private async internUserData(): Promise<RawMasterData | null> {
    const full = await this.internUserDataFull();
    return full?.masterData ?? null;
  }

  async getTimetable(target: TimelineTarget, start: string, end: string): Promise<Lesson[]> {
    const startDate = dateToInt(start);
    const endDate = dateToInt(end);
    const options = {
      id: Date.now(),
      element: { id: target.id, type: target.type },
      startDate,
      endDate,
      showSubstText: true,
      showInfo: true,
      showLsText: true,
      showStudentgroup: true,
      klasseFields: ['id', 'name', 'longname'],
      roomFields: ['id', 'name', 'longname'],
      subjectFields: ['id', 'name', 'longname'],
      teacherFields: ['id', 'name', 'longname'],
    };

    if (this.timetableStyle !== 'flat') {
      try {
        const raw = await this.rpc<RawLesson[]>('getTimetable', { options });
        this.timetableStyle = 'options';
        return raw.map(normalizeLesson);
      } catch (err) {
        if (this.timetableStyle === 'options' || !(err instanceof UntisError) || err instanceof PermissionError) throw err;
        // fall through to flat style
      }
    }
    const raw = await this.rpc<RawLesson[]>('getTimetable', {
      id: target.id,
      type: target.type,
      startDate,
      endDate,
    });
    this.timetableStyle = 'flat';
    return raw.map(normalizeLesson);
  }

  async getSubstitutions(start: string, end: string): Promise<Substitution[]> {
    const params = { startDate: dateToInt(start), endDate: dateToInt(end), departmentId: 0 };
    const raw = await this.rpc<RawSubstitution[] | { substitutions?: RawSubstitution[] }>(
      'getSubstitutions',
      params,
    );
    const list = Array.isArray(raw) ? raw : (raw.substitutions ?? []);
    return list.map(normalizeSubstitution);
  }

  async getHomeworks(start: string, end: string): Promise<Homework[]> {
    try {
      const sInt = dateToInt(start);
      const eInt = dateToInt(end);
      const data = await this.rest<{
        homeworks?: Record<string, any>[];
        lessons?: Record<string, any>[];
        teachers?: Record<string, any>[];
        records?: Record<string, any>[];
      }>('/WebUntis/api/homeworks/lessons', {
        startDate: sInt,
        endDate: eInt,
      }).catch(async () => {
        const res = await fetch(
          `${this.base()}/WebUntis/api/homeworks/lessons?startDate=${sInt}&endDate=${eInt}`,
          {
            method: 'GET',
            headers: {
              Cookie: this.cookies(),
              'Content-Type': 'application/json',
              ...(this.jwtToken ? { Authorization: `Bearer ${this.jwtToken}` } : {}),
            },
            signal: AbortSignal.timeout(20_000),
          },
        );
        if (!res.ok) return null;
        return (await res.json()) as any;
      });

      const rawHws = (data as any)?.data?.homeworks ?? data?.homeworks ?? [];
      const lessonsList = (data as any)?.data?.lessons ?? data?.lessons ?? [];
      const teachersList = (data as any)?.data?.teachers ?? data?.teachers ?? [];
      const recordsList = (data as any)?.data?.records ?? data?.records ?? [];

      const lessonsMap = new Map<number, { id: number; subject?: string }>();
      for (const l of lessonsList) {
        if (l.id) lessonsMap.set(Number(l.id), { id: Number(l.id), subject: l.subject });
      }

      const teachersMap = new Map<number, { id: number; name?: string }>();
      for (const t of teachersList) {
        if (t.id) teachersMap.set(Number(t.id), { id: Number(t.id), name: t.name });
      }

      const hwTeacherMap = new Map<number, { id: number; name?: string }>();
      for (const rec of recordsList) {
        const hwId = Number(rec.homeworkId);
        const tId = Number(rec.teacherId);
        const teacherObj = teachersMap.get(tId);
        if (teacherObj) {
          hwTeacherMap.set(hwId, teacherObj);
        } else if (tId) {
          hwTeacherMap.set(hwId, { id: tId, name: String(tId) });
        }
      }

      const list = rawHws.map((hw: any) => {
        const enriched = { ...hw };
        if (hw.lessonId && !enriched.subject) {
          const lObj = lessonsMap.get(Number(hw.lessonId));
          if (lObj?.subject) {
            enriched.subject = { id: lObj.id, name: lObj.subject, longName: lObj.subject };
          }
        }
        if (!enriched.teacher) {
          const tObj = hwTeacherMap.get(Number(hw.id));
          if (tObj?.name) {
            enriched.teacher = { id: tObj.id, name: tObj.name, longName: tObj.name };
          }
        }
        return enriched;
      });

      return list.map(normalizeHomework);
    } catch {
      return [];
    }
  }

  private async getClassregAbsences(start: string, end: string): Promise<Absence[] | null> {
    try {
      const sInt = dateToInt(start);
      const eInt = dateToInt(end);
      const sId = this.personId ?? -1;
      const url = `${this.base()}/WebUntis/api/classreg/absences/students?startDate=${sInt}&endDate=${eInt}&studentId=${sId}&excuseStatusId=-1`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Cookie: this.cookies(),
          'Content-Type': 'application/json',
          ...(this.jwtToken ? { Authorization: `Bearer ${this.jwtToken}` } : {}),
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (res.status === 401 || res.status === 403) {
        if (this.reauth) {
          await this.reauth();
          return this.getClassregAbsences(start, end);
        }
      }

      if (!res.ok) return null;
      const json = (await res.json()) as any;
      const list = json?.data?.absences ?? json?.absences;
      if (!Array.isArray(list)) return null;

      return list.map((raw: any): Absence => {
        const startDate = raw.startDate ? intToIsoDate(raw.startDate) : start;
        const endDate = raw.endDate ? intToIsoDate(raw.endDate) : startDate;
        const startTime = formatUntisTime(raw.startTime);
        const endTime = formatUntisTime(raw.endTime);
        const isExcused = Boolean(raw.isExcused || raw.excuseStatus === 'entschuldigt' || raw.excused);
        const excuseStatus = raw.excuseStatus || (raw.isExcused ? 'entschuldigt' : 'offen');
        const reason = raw.reason || raw.text || 'Abwesenheit';

        let periods = raw.periods;
        if (!periods && raw.startTime !== undefined && raw.endTime !== undefined) {
          const sMin = untisTimeToMinutes(raw.startTime);
          const eMin = untisTimeToMinutes(raw.endTime);
          const diff = eMin - sMin;
          if (diff > 0) {
            periods = Math.max(1, Math.round(diff / 50));
          }
        }
        if (!periods) periods = 1;

        return {
          id: String(raw.id),
          start: startDate,
          end: endDate,
          startTime,
          endTime,
          excused: isExcused,
          excuseStatus,
          reason,
          text: raw.text,
          periods,
        };
      });
    } catch {
      return null;
    }
  }

  async getAbsences(start: string, end: string): Promise<Absence[]> {
    // 1. Primary reverse-engineered endpoint on WebUntis
    const classreg = await this.getClassregAbsences(start, end);
    if (classreg !== null) return classreg;

    // 2. Fallback to classic JSON-RPC getTimetableWithAbsences
    try {
      const raw = await this.rpc<{ absences?: Record<string, any>[] } | Record<string, any>[]>(
        'getTimetableWithAbsences',
        { startDate: dateToInt(start), endDate: dateToInt(end) },
      );
      const list = Array.isArray(raw) ? raw : (raw.absences ?? []);
      return list.map(normalizeAbsence);
    } catch (err: unknown) {
      const isPermission =
        err instanceof PermissionError ||
        (err instanceof UntisError && (err.code === -8509 || err.code === -32601 || /no right for|not found/i.test(err.message)));
      if (!isPermission) throw err;

      // School administrator has blocked JSON-RPC getTimetableWithAbsences (Error -8509 or -32601).
      // Fallback: check WebUntis Web absences via web session cookies (/WebUntis/absencetimes.do).
      return this.fetchAbsencesFromWeb(start, end);
    }
  }

  async fetchAbsencesFromWeb(start: string, end: string): Promise<Absence[]> {
    // 1. Try modern electronic class register absence list (/WebUntis/absencelist.do)
    try {
      const initUrl = `${this.base()}/WebUntis/absencelist.do`;
      const initRes = await fetch(initUrl, {
        method: 'GET',
        headers: {
          Cookie: this.cookies(),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (initRes.status === 401 || initRes.status === 403) {
        if (this.reauth) {
          await this.reauth();
          return this.fetchAbsencesFromWeb(start, end);
        }
      }

      if (initRes.ok) {
        const initHtml = await initRes.text();
        const csrfMatch = initHtml.match(/name="_csrf"\s+value="([^"]+)"/i);
        const studentMatch = initHtml.match(/<select[^>]*name="studentId"[^>]*>[\s\S]*?<option[^>]*value="(\d+)"[^>]*selected/i);
        const studentId = studentMatch ? studentMatch[1] : '';

        if (csrfMatch && csrfMatch[1]) {
          const csrf = csrfMatch[1];
          const sInt = Number(start.replace(/-/g, '')) || 20260901;
          const eInt = Number(end.replace(/-/g, '')) || 20270715;

          const dateRangePayload = JSON.stringify({
            name: '',
            id: -1,
            type: 'CUSTOM',
            endDate: eInt,
            startDate: sInt,
            restrictToSchoolyear: false,
          });

          const body = new URLSearchParams();
          body.append('_csrf', csrf);
          if (studentId) body.append('studentId', studentId);
          body.append('klasseId', '-1');
          body.append('absenceReasonId', '-1');
          body.append('excuseStatusId', '-1');
          body.append('absenceListOrder', '1');
          body.append('guardianNotified', '-1');
          body.append('selectedDateRange', dateRangePayload);

          const postRes = await fetch(initUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Cookie: this.cookies(),
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              Referer: initUrl,
            },
            body: body.toString(),
            signal: AbortSignal.timeout(20_000),
          });

          if (postRes.ok) {
            const postHtml = await postRes.text();
            const absences = this.parseAbsenceListHtml(postHtml, start, end);
            if (absences.length > 0) {
              return absences;
            }
          }
        }
      }
    } catch {
      // Fall through to absencetimes.do
    }

    // 2. Fallback: classic WebUntis /WebUntis/absencetimes.do
    const url = `${this.base()}/WebUntis/absencetimes.do`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Cookie: this.cookies(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 401 || res.status === 403) {
      if (this.reauth) {
        await this.reauth();
        return this.fetchAbsencesFromWeb(start, end);
      }
      throw new PermissionError('WebUntis web absence access denied');
    }
    if (!res.ok) throw new UpstreamError(`WebUntis absence page failed (HTTP ${res.status})`);

    const html = await res.text();
    return this.parseWebAbsencesHtml(html, start, end);
  }

  parseAbsenceListHtml(html: string, start: string, end: string): Absence[] {
    const absences: Absence[] = [];
    const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

    for (const row of rows) {
      if (row.includes('<th>') || row.includes('<th ')) continue;
      if (row.includes('wSelStud') || row.includes('wSelAbsRn')) continue;

      const cells: string[] = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let m: RegExpExecArray | null;
      while ((m = cellRegex.exec(row)) !== null) {
        if (m[1]) {
          cells.push(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        }
      }

      if (cells.length < 13) continue;

      const selIdMatch = row.match(/name="selId"\s+value="(\d+)"/i);
      const selId = selIdMatch && selIdMatch[1] ? Number(selIdMatch[1]) : 0;

      const vonDateStr = cells[7];
      const bisDateStr = cells[9];
      if (!vonDateStr || !bisDateStr) continue;

      const parseDate = (d: string) => {
        const parts = d.split('.');
        const p0 = parts[0];
        const p1 = parts[1];
        let p2 = parts[2];
        if (!p0 || !p1 || !p2) return '';
        const day = p0.padStart(2, '0');
        const mon = p1.padStart(2, '0');
        if (p2.length === 2) p2 = '20' + p2;
        return `${p2}-${mon}-${day}`;
      };

      const startDate = parseDate(vonDateStr);
      const endDate = parseDate(bisDateStr);
      if (!startDate) continue;

      if (end && startDate > end) continue;
      if (start && (endDate || startDate) < start) continue;

      const beginTime = cells[8] || '08:00';
      const endTime = cells[10] || '08:50';
      const rawReason = cells[11] || 'Abwesenheit';
      const rawStatus = cells[12] || '';
      const noteText = cells[13] || '';

      const isExcused = /entsch/i.test(rawStatus) && !/nicht|unentsch/i.test(rawStatus);
      const excuseNumberMatch = rawStatus.match(/\/ (\d+)/);
      const excuseNumber = excuseNumberMatch ? excuseNumberMatch[1] : undefined;

      const bParts = beginTime.split(':').map(Number);
      const eParts = endTime.split(':').map(Number);
      const bH = bParts[0] ?? 8;
      const bM = bParts[1] ?? 0;
      const eH = eParts[0] ?? 8;
      const eM = eParts[1] ?? 50;
      const totalMinutes = (eH * 60 + eM) - (bH * 60 + bM);
      const periods = Math.max(1, Math.round(totalMinutes / 50));

      let displayReason = rawReason;
      if (noteText && noteText.toLowerCase() !== rawReason.toLowerCase()) {
        displayReason += ` (${noteText})`;
      }

      absences.push({
        id: selId || (excuseNumber ? Number(excuseNumber) : Date.now()),
        start: startDate,
        end: endDate || startDate,
        periods,
        excused: isExcused,
        excuseStatus: isExcused ? (excuseNumber ? `entschuldigt (#${excuseNumber})` : 'entschuldigt') : 'offen',
        reason: displayReason,
      });
    }

    return absences;
  }

  parseWebAbsencesHtml(html: string, start: string, end: string): Absence[] {
    // If WebUntis displays "Nichts anzuzeigen" or there are no data rows, return []
    if (html.includes('Nichts anzuzeigen')) {
      return [];
    }

    const absences: Absence[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match: RegExpExecArray | null;
    let rowId = 1;

    while ((match = rowRegex.exec(html)) !== null) {
      const rowContent = match[1];
      if (!rowContent || rowContent.includes('<th') || rowContent.includes('<select') || rowContent.includes('<input')) {
        continue;
      }

      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        if (cellMatch[1]) {
          cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
        }
      }

      if (cells.length >= 2) {
        const dateStr = cells.find((c) => /^\d{1,2}\.\d{1,2}\.(\d{2}|\d{4})$/.test(c.trim()));
        if (dateStr) {
          const parts = dateStr.trim().split('.');
          const dStr = parts[0];
          const mStr = parts[1];
          let year = parts[2];
          if (!dStr || !mStr || !year) continue;

          const day = dStr.padStart(2, '0');
          const month = mStr.padStart(2, '0');
          if (year.length === 2) year = `20${year}`;
          const iso = `${year}-${month}-${day}`;

          if (iso >= start && iso <= end) {
            const rawStatus = cells.find((c) => /entschuldigt|offen|fehlen/i.test(c)) ?? 'offen';
            const isExcused = /entschuldigt/i.test(rawStatus) && !/nicht|unentschuldigt/i.test(rawStatus);
            const reason = cells[3] || cells[2] || 'Abwesenheit';

            absences.push({
              id: 9000 + rowId++,
              start: iso,
              end: iso,
              periods: 1,
              excused: isExcused,
              excuseStatus: isExcused ? 'entschuldigt' : 'offen',
              reason,
            });
          }
        }
      }
    }

    return absences;
  }


  async getExams(start: string, end: string): Promise<Exam[]> {
    const sInt = dateToInt(start);
    const eInt = dateToInt(end);
    const allExams: Exam[] = [];
    const seen = new Set<string>();

    const addExam = (raw: Record<string, any>) => {
      try {
        const name = raw.name ?? raw.examName ?? raw.subject?.name ?? raw.subject ?? '';
        const examDate = raw.examDate ?? raw.date ?? raw.startDate ?? '';
        const startTime = raw.startTime ?? '';
        const stableId =
          raw.id && raw.id !== 0
            ? Number(raw.id)
            : Math.abs(hashCode(`${name}|${examDate}|${startTime}`)) || 1;

        const normalized = normalizeExam({ ...raw, id: stableId });
        const key = `${normalized.id}|${normalized.date}|${normalized.startMin}|${normalized.subject?.id || normalized.subject?.name || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          allExams.push(normalized);
        }
      } catch {
        // Skip malformed individual exam
      }
    };

    // 1. Primary reverse-engineered endpoint /WebUntis/api/exams with klasseId & withGrades
    try {
      const kId = this.klasseId ?? -1;
      const legacyRest = await this.rest<{ exams?: Record<string, any>[] }>('/WebUntis/api/exams', {
        startDate: sInt,
        endDate: eInt,
        klasseId: kId,
        withGrades: 'true',
      }).catch(async () => {
        const res = await fetch(
          `${this.base()}/WebUntis/api/exams?startDate=${sInt}&endDate=${eInt}&klasseId=${kId}&withGrades=true`,
          {
            method: 'GET',
            headers: {
              Cookie: this.cookies(),
              'Content-Type': 'application/json',
              ...(this.jwtToken ? { Authorization: `Bearer ${this.jwtToken}` } : {}),
            },
            signal: AbortSignal.timeout(20_000),
          },
        );
        if (!res.ok) return null;
        return (await res.json()) as { exams?: Record<string, any>[] };
      });

      const rawExams = (legacyRest as any)?.data?.exams ?? legacyRest?.exams;
      if (Array.isArray(rawExams)) {
        for (const ex of rawExams) {
          // If this.personId is set, filter: keep exams where assignedStudents is empty OR contains this.personId
          if (this.personId && Array.isArray(ex.assignedStudents) && ex.assignedStudents.length > 0) {
            const isAssigned = ex.assignedStudents.some(
              (s: any) => Number(s.id ?? s.studentId ?? s) === this.personId,
            );
            if (!isAssigned) continue;
          }
          addExam(ex);
        }
      }
    } catch {
      // Continue to next source
    }

    // 2. Modern REST endpoint /WebUntis/api/rest/view/v1/exams
    try {
      const v1Data = await this.rest<{ exams?: Record<string, any>[] }>('/WebUntis/api/rest/view/v1/exams', {
        startDate: sInt,
        endDate: eInt,
      });
      const v1Exams = (v1Data as any)?.data?.exams ?? v1Data?.exams;
      if (Array.isArray(v1Exams)) {
        for (const ex of v1Exams) {
          const d = Number(ex.startDate ?? ex.date ?? 0);
          if (!d || (d >= sInt && d <= eInt)) {
            addExam(ex);
          }
        }
      }
    } catch {
      // Continue to next source
    }

    // 3. Classic JSON-RPC getExams (often contains official school tests and oral exams)
    try {
      const raw = await this.rpc<Record<string, any>[]>('getExams', {
        startDate: sInt,
        endDate: eInt,
      });
      if (Array.isArray(raw)) {
        for (const ex of raw) {
          addExam(ex);
        }
      }
    } catch (err: unknown) {
      if (!(err instanceof UntisError && err.code === -32601)) {
        // Silently continue
      }
    }

    return deduplicateExams(allExams);
  }

  /** Query room timetable occupancy across rooms for a requested date */
  async getRoomOccupancy(
    date: string,
    rooms: Ref[],
    timeGrid: TimeGridSlot[],
    currentMin?: number,
  ): Promise<RoomOccupancy[]> {
    const cMin = currentMin ?? (new Date().getHours() * 60 + new Date().getMinutes());
    const allLessons: Lesson[] = [];
    let permissionDenied = false;

    const chunkSize = 10;
    for (let i = 0; i < rooms.length; i += chunkSize) {
      if (permissionDenied) break;
      const chunk = rooms.slice(i, i + chunkSize);
      const results = await Promise.allSettled(
        chunk.map((r) => this.getTimetable({ id: r.id, type: ElementType.Room }, date, date)),
      );
      for (const res of results) {
        if (res.status === 'fulfilled') {
          allLessons.push(...res.value);
        } else {
          const err = res.reason;
          if (
            err instanceof PermissionError ||
            (err instanceof UntisError && (err.code === -8509 || /no right/i.test(err.message)))
          ) {
            permissionDenied = true;
            break;
          }
        }
      }
    }

    if (permissionDenied) {
      throw new PermissionError('Room timetable direct access blocked');
    }

    return computeRoomOccupancy(rooms, timeGrid, allLessons, cMin);
  }

  async getMessages(date: string): Promise<Message[]> {
    const raw = await this.rpc<Record<string, any>[]>('getMessagesOfDay', { date: dateToInt(date) });
    return (raw ?? []).map((m) => ({
      id: String(m.id),
      date,
      subject: m.subject ?? m.title ?? '',
      body: m.text ?? m.body ?? '',
      read: Boolean(m.read),
      sender: m.sender,
    }));
  }

  async getLatestImportTime(): Promise<number> {
    return this.rpc<number>('getLatestImportTime', {});
  }

  /** REST call against the SPA API. Mints a JWT lazily from the current session cookie. */
  private async rest<T>(path: string, query: Record<string, string | number> = {}, retry = true): Promise<T> {
    if (!this.jwtToken) {
      const tokenRes = await fetch(`${this.base()}/WebUntis/api/token/new`, {
        method: 'GET',
        headers: { Cookie: this.cookies() },
        signal: AbortSignal.timeout(20_000),
      });
      if (!tokenRes.ok) throw new SessionExpiredError(`Could not mint token (HTTP ${tokenRes.status})`);
      this.jwtToken = (await tokenRes.text()).replace(/"/g, '');
    }
    const qs = new URLSearchParams(
      Object.entries(query).map(([k, v]): [string, string] => [k, String(v)]),
    ).toString();
    const res = await fetch(`${this.base()}${path}${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.jwtToken}`,
        Cookie: this.cookies(),
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401 || res.status === 403) {
      if (retry && this.reauth) {
        await this.reauth();
        return this.rest<T>(path, query, false);
      }
      throw new PermissionError(`REST request denied (HTTP ${res.status})`);
    }
    if (!res.ok) throw new UpstreamError(`REST request failed (HTTP ${res.status})`);
    const json = (await res.json()) as { data?: T } & T;
    return (json.data ?? json) as T;
  }
}
