import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthMode, MasterData, SessionInfo, SessionSummary } from '@untisplus/shared';
import { WebUntisClient, type UntisError } from './untis/client.js';

/**
 * Session store with disk persistence.
 *
 * A browser never receives WebUntis credentials or the upstream session id — only an opaque
 * token that maps to a server-side `WebUntisClient`. Stored sessions are cached on disk so
 * server restarts do not disrupt active clients.
 */

export interface StoredSession {
  token: string;
  client: WebUntisClient;
  info: SessionInfo;
  mode: AuthMode;
  /** Credentials kept to transparently renew sessions across reloads. */
  credentials?: { user?: string; password?: string; secret?: string };
  master?: MasterData;
  masterAt?: number;
}

export interface SerializedSession {
  token: string;
  mode: AuthMode;
  credentials?: { user?: string; password?: string; secret?: string };
  info: SessionInfo;
  master?: MasterData;
  masterAt?: number;
}

const sessions = new Map<string, StoredSession>();

const MASTER_TTL_MS = 5 * 60_000;

export const SESSIONS_CACHE_FILE =
  process.env.SESSIONS_CACHE_FILE ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.sessions_cache.json');

function setupReauth(session: StoredSession): void {
  const { client, mode, credentials } = session;
  client.reauth = async () => {
    if (mode === 'password' && credentials?.user && credentials?.password) {
      const ident = await client.loginPassword(credentials.user, credentials.password);
      session.info.personId = ident.personId;
      session.info.personType = ident.personType;
      session.info.klasseId = ident.klasseId;
      session.info.displayName = ident.displayName;
      session.info.children = ident.children;
      client.personId = ident.personId;
      client.personType = ident.personType;
      client.klasseId = ident.klasseId;
      persistSessions();
    } else if ((mode === 'secret' || mode === 'qr') && credentials?.user && credentials?.secret) {
      const ident = await client.loginSecret(credentials.user, credentials.secret, mode);
      session.info.personId = ident.personId;
      session.info.personType = ident.personType;
      session.info.klasseId = ident.klasseId;
      session.info.displayName = ident.displayName;
      session.info.children = ident.children;
      client.personId = ident.personId;
      client.personType = ident.personType;
      client.klasseId = ident.klasseId;
      persistSessions();
    } else if (mode === 'anonymous') {
      await client.loginAnonymous();
    }
  };
}

export function persistSessions(): void {
  try {
    const list: SerializedSession[] = [];
    for (const s of sessions.values()) {
      list.push({
        token: s.token,
        mode: s.mode,
        credentials: s.credentials,
        info: s.info,
        master: s.master,
        masterAt: s.masterAt,
      });
    }
    const dir = path.dirname(SESSIONS_CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SESSIONS_CACHE_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist sessions to disk:', err);
  }
}

export function loadSessions(): void {
  try {
    if (!fs.existsSync(SESSIONS_CACHE_FILE)) return;
    const content = fs.readFileSync(SESSIONS_CACHE_FILE, 'utf8');
    if (!content.trim()) return;
    const list = JSON.parse(content) as SerializedSession[];
    if (!Array.isArray(list)) return;

    for (const item of list) {
      if (!item.token || !item.info?.school?.server || !item.info?.school?.loginName) continue;
      const client = new WebUntisClient({
        server: item.info.school.server,
        school: item.info.school.loginName,
      });
      client.mode = item.mode;
      client.personId = item.info.personId;
      client.personType = item.info.personType;
      client.klasseId = item.info.klasseId;

      const session: StoredSession = {
        token: item.token,
        client,
        mode: item.mode,
        credentials: item.credentials,
        info: item.info,
        master: item.master,
        masterAt: item.masterAt,
      };
      setupReauth(session);
      sessions.set(session.token, session);
    }
  } catch (err) {
    console.error('Failed to load sessions from disk:', err);
  }
}

// Load cached sessions from disk on module load
loadSessions();

export interface CreateSessionInput {
  server: string;
  school: string;
  displayName?: string;
  schoolId?: number;
  tenantId?: string;
  mode: AuthMode;
  user?: string;
  password?: string;
  secret?: string;
}

export async function createSession(input: CreateSessionInput): Promise<StoredSession> {
  const client = new WebUntisClient({ server: input.server, school: input.school });
  let personId: number | undefined;
  let personType: number | undefined;
  let klasseId: number | undefined;
  let displayName: string | undefined;
  let children: SessionInfo['children'];

  if (input.mode === 'anonymous') {
    const ident = await client.loginAnonymous();
    personId = ident.personId;
    personType = ident.personType;
    klasseId = ident.klasseId;
    displayName = ident.displayName;
    children = ident.children;
  } else if (input.mode === 'password') {
    if (!input.user || !input.password) throw new Error('user and password are required');
    const ident = await client.loginPassword(input.user, input.password);
    personId = ident.personId;
    personType = ident.personType;
    klasseId = ident.klasseId;
    displayName = ident.displayName;
    children = ident.children;
  } else if (input.mode === 'secret' || input.mode === 'qr') {
    if (!input.user || !input.secret) throw new Error('user and secret are required');
    const ident = await client.loginSecret(input.user, input.secret, input.mode);
    personId = ident.personId;
    personType = ident.personType;
    klasseId = ident.klasseId;
    displayName = ident.displayName;
    children = ident.children;
  } else {
    throw new Error(`Unsupported auth mode: ${input.mode}`);
  }

  const school = {
    server: input.server,
    loginName: input.school,
    displayName: input.displayName ?? input.school,
    schoolId: input.schoolId,
    tenantId: input.tenantId,
  };

  const token = randomUUID();
  const session: StoredSession = {
    token,
    client,
    mode: input.mode,
    credentials: { user: input.user, password: input.password, secret: input.secret },
    info: {
      sessionId: '',
      school,
      mode: input.mode,
      personId,
      personType,
      klasseId,
      displayName,
      children,
      createdAt: Date.now(),
    },
  };

  client.personId = personId;
  client.personType = personType;
  client.klasseId = klasseId;
  setupReauth(session);

  sessions.set(token, session);
  persistSessions();
  return session;
}

export function getSession(token: string | undefined): StoredSession | undefined {
  if (!token) return undefined;
  return sessions.get(token);
}

/** Get (and cache) a session's master data. */
export async function getMasterData(session: StoredSession): Promise<MasterData> {
  if (session.master && session.masterAt && Date.now() - session.masterAt < MASTER_TTL_MS) {
    return session.master;
  }
  const master = await session.client.getMasterData();
  session.master = master;
  session.masterAt = Date.now();
  persistSessions();
  return master;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const session = sessions.get(token);
  if (session) {
    await session.client.logout().catch(() => undefined);
    sessions.delete(token);
    persistSessions();
  }
}

/** Derive the public session summary (role-aware) sent to the browser. */
export function summarize(session: StoredSession): SessionSummary {
  return {
    school: session.info.school,
    mode: session.info.mode,
    personId: session.info.personId,
    personType: session.info.personType,
    klasseId: session.info.klasseId,
    displayName:
      session.info.displayName ||
      session.credentials?.user ||
      (session.info.personType === 2 ? 'Lehrkraft' : 'Schüler:in'),
    children: session.info.children,
    readOnly: session.mode === 'anonymous',
  };
}

export function isSessionExpired(err: unknown): boolean {
  return err instanceof Error && err.name === 'SessionExpiredError';
}

export type { UntisError };
