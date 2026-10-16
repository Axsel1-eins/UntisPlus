import { randomUUID } from 'node:crypto';
import type { AuthMode, MasterData, SessionInfo, SessionSummary } from '@untisplus/shared';
import { WebUntisClient, type UntisError } from './untis/client.js';

/**
 * In-memory session store.
 *
 * A browser never receives WebUntis credentials or the upstream session id — only an opaque
 * token that maps to a server-side `WebUntisClient`. This is intentional: it keeps secrets
 * out of the client and lets us re-authenticate/persist later without changing the API.
 */

export interface StoredSession {
  token: string;
  client: WebUntisClient;
  info: SessionInfo;
  mode: AuthMode;
  /** Credentials kept only in memory so we can renew a session; never persisted or logged. */
  credentials?: { user?: string; password?: string; secret?: string };
  master?: MasterData;
  masterAt?: number;
}

const sessions = new Map<string, StoredSession>();

const MASTER_TTL_MS = 5 * 60_000;

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

  // Let the client transparently re-login on session expiry.
  client.reauth = async () => {
    if (input.mode === 'password' && input.user && input.password) {
      const ident = await client.loginPassword(input.user, input.password);
      session.info.personId = ident.personId;
      session.info.personType = ident.personType;
      session.info.klasseId = ident.klasseId;
      session.info.displayName = ident.displayName;
      session.info.children = ident.children;
    } else if ((input.mode === 'secret' || input.mode === 'qr') && input.user && input.secret) {
      const ident = await client.loginSecret(input.user, input.secret, input.mode);
      session.info.personId = ident.personId;
      session.info.personType = ident.personType;
      session.info.klasseId = ident.klasseId;
      session.info.displayName = ident.displayName;
      session.info.children = ident.children;
    } else if (input.mode === 'anonymous') {
      await client.loginAnonymous();
    }
  };

  sessions.set(token, session);
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
  return master;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const session = sessions.get(token);
  if (session) {
    await session.client.logout().catch(() => undefined);
    sessions.delete(token);
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
    displayName: session.info.displayName,
    children: session.info.children,
    readOnly: session.mode === 'anonymous',
  };
}

export function isSessionExpired(err: unknown): boolean {
  return err instanceof Error && err.name === 'SessionExpiredError';
}

export type { UntisError };
