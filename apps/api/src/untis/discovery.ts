import type { School } from '@untisplus/shared';

/**
 * School discovery via the WebUntis mobile school-search service.
 *
 * This is the same endpoint the official mobile app uses. It returns the server host and
 * the school's login name, which are exactly what the JSON-RPC API needs.
 */

const SEARCH_URL = 'https://mobile.webuntis.com/ms/schoolquery2';

interface RawSchool {
  server: string;
  loginName: string;
  displayName: string;
  schoolId?: number;
  tenantId?: string;
  address?: string;
}

export class SchoolSearchError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = 'SchoolSearchError';
  }
}

/**
 * Search for a WebUntis school by name/term.
 * @param term search string (e.g. "HTL Wien", "Gymnasium")
 */
export async function searchSchools(term: string, signal?: AbortSignal): Promise<School[]> {
  const query = term.trim();
  if (query.length < 2) return [];

  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: '1',
      method: 'searchSchool',
      params: [{ search: query }],
      jsonrpc: '2.0',
    }),
    signal,
  });

  if (!res.ok) throw new SchoolSearchError(`School search failed (HTTP ${res.status})`);

  const json = (await res.json()) as {
    result?: { schools?: RawSchool[] };
    error?: { code: number; message: string };
  };

  if (json.error) {
    if (json.error.code === -6003) {
      throw new SchoolSearchError('Too many matching schools found. Please be more specific.', -6003);
    }
    throw new SchoolSearchError(json.error.message ?? 'School search failed', json.error.code);
  }

  const schools = json.result?.schools ?? [];
  return schools.map((s) => ({
    server: s.server,
    loginName: s.loginName,
    displayName: s.displayName,
    schoolId: s.schoolId,
    tenantId: s.tenantId,
    address: s.address,
  }));
}
