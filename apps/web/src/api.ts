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

const TOKEN_KEY = 'up.token';
const API_URL_KEY = 'up.api_url';

export function getStoredToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getApiBaseUrl(): string {
  if (typeof localStorage !== 'undefined') {
    const custom = localStorage.getItem(API_URL_KEY);
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  }
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
}

export function setCustomApiUrl(url: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (url && url.trim()) localStorage.setItem(API_URL_KEY, url.trim().replace(/\/+$/, ''));
  else localStorage.removeItem(API_URL_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isGet = !init || init.method === undefined || init.method === 'GET';
  const cacheable = isGet && path !== '/session';
  const key = cacheable ? path : '';
  if (cacheable) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T;
  }

  const token = getStoredToken();
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Session-Token': token, Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: 'include',
      ...init,
      headers,
    });
  } catch (err) {
    throw new ApiError('network', err instanceof Error ? err.message : 'network', 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // Upstream gateway, proxy, or server returned HTML or plain text (e.g. 502 Bad Gateway)
      if (!res.ok) {
        throw new ApiError('upstream_error', text.slice(0, 150) || res.statusText, res.status);
      }
      throw new ApiError('invalid_json', 'Server returned invalid JSON response', res.status);
    }
  }
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

  session: async () => {
    const summary = await request<SessionSummary>('/session');
    if (summary.token) {
      setStoredToken(summary.token);
    }
    return summary;
  },

  login: async (input: LoginInput) => {
    clearApiCache();
    const summary = await request<SessionSummary>('/session', { method: 'POST', body: JSON.stringify(input) });
    if (summary.token) {
      setStoredToken(summary.token);
    }
    return summary;
  },

  logout: async () => {
    clearApiCache();
    try {
      return await request<{ ok: boolean }>('/session', { method: 'DELETE' });
    } finally {
      setStoredToken(null);
    }
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
