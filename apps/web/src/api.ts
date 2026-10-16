import type {
  Absence,
  Exam,
  Homework,
  Lesson,
  MasterData,
  Message,
  RoomOccupancy,
  School,
  SessionSummary,
} from '@untisplus/shared';

/** A normalized error thrown by the API client. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** A tiny in-memory cache so switching views does not refetch the same GET endpoint. */
const cache = new Map<string, { at: number; data: unknown }>();
const CACHE_TTL_MS = 30_000;

export function clearApiCache(): void {
  cache.clear();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isGet = !init || init.method === undefined || init.method === 'GET';
  const cacheable = isGet && path !== '/session';
  const key = cacheable ? path : '';
  if (cacheable) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T;
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch (err) {
    throw new ApiError('network', err instanceof Error ? err.message : 'network', 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = body as { error?: string; message?: string } | undefined;
    throw new ApiError(err?.error ?? 'error', err?.message ?? res.statusText, res.status);
  }
  if (cacheable) cache.set(key, { at: Date.now(), data: body });
  return body as T;
}

export interface TimetableResponse {
  lessons: Lesson[];
}

export interface ModuleResponse<T> {
  available: boolean;
  data?: T;
  error?: string;
}

export interface LoginInput {
  server: string;
  school: string;
  displayName?: string;
  schoolId?: number;
  tenantId?: string;
  mode: 'anonymous' | 'password' | 'secret';
  user?: string;
  password?: string;
  secret?: string;
}

export const api = {
  health: () => request<{ ok: boolean; fixtures: boolean }>('/health'),

  searchSchools: (q: string) =>
    request<{ schools: School[] }>(`/schools?q=${encodeURIComponent(q)}`).then((r) => r.schools),

  session: () => request<SessionSummary>('/session'),

  login: (input: LoginInput) => {
    clearApiCache();
    return request<SessionSummary>('/session', { method: 'POST', body: JSON.stringify(input) });
  },

  logout: () => {
    clearApiCache();
    return request<{ ok: boolean }>('/session', { method: 'DELETE' });
  },

  master: () => request<MasterData>('/master'),

  timetable: (start: string, end: string, target?: { id: number; type: string }) => {
    const q = new URLSearchParams({ start, end });
    if (target) {
      q.set('targetId', String(target.id));
      q.set('targetType', target.type);
    }
    return request<TimetableResponse>(`/timetable?${q.toString()}`);
  },

  substitutions: (start: string, end: string) =>
    request<ModuleResponse<unknown[]>>(`/substitutions?start=${start}&end=${end}`),

  homework: (start: string, end: string) =>
    request<ModuleResponse<Homework[]>>(`/homework?start=${start}&end=${end}`),

  absences: (start: string, end: string) =>
    request<ModuleResponse<Absence[]>>(`/absences?start=${start}&end=${end}`),

  exams: (start: string, end: string) =>
    request<ModuleResponse<Exam[]>>(`/exams?start=${start}&end=${end}`),

  messages: (date: string) => request<ModuleResponse<Message[]>>(`/messages?date=${date}`),

  calendarToken: (target?: { id: number; type: string }) => {
    const q = new URLSearchParams();
    if (target) {
      q.set('targetId', String(target.id));
      q.set('targetType', target.type);
    }
    const query = q.toString() ? `?${q.toString()}` : '';
    return request<{ token: string; url: string; webcalUrl: string }>(`/calendar/token${query}`);
  },

  roomsOccupancy: (date?: string) =>
    request<{ occupancies: RoomOccupancy[] }>(`/rooms/occupancy${date ? `?date=${date}` : ''}`),
};
