// Client for the dpl-hiscores Cloudflare Worker. Mirrors the shape of
// wikisync.ts: pure async functions over `fetch`, errors typed by `kind`
// so callers can render appropriate UI.

export const DEFAULT_HISCORES_BASE_URL = 'https://dpl-hiscores.breki.workers.dev';

export interface HiscoreRow {
  username: string;
  score: number;
  points: number;
  completedCount: number;
  regionsUnlocked: number;
  pactsUnlocked: number;
  updatedAt: number;
  clientUpdatedAt: number;
}

// Payload for PUT — the server stamps `updatedAt`, the client sends
// everything else (including `clientUpdatedAt` for skew checks).
export type HiscoreSubmission = Omit<HiscoreRow, 'updatedAt'>;

export class HiscoresError extends Error {
  constructor(
    public readonly kind: 'not_found' | 'cors' | 'network' | 'shape' | 'http',
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
  }
}

function buildUrl(base: string, path: string): string {
  const trimmed = (base || DEFAULT_HISCORES_BASE_URL).replace(/\/+$/, '');
  return `${trimmed}${path}`;
}

async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Browser fetch throws TypeError for both CORS and network failures;
    // we can't reliably distinguish, so report as `cors` (the more common
    // first-time failure when the user's proxy URL is wrong).
    throw new HiscoresError('cors', `Couldn't reach hiscores worker. (${msg})`, undefined);
  }
}

function parseRow(raw: unknown): HiscoreRow {
  if (!raw || typeof raw !== 'object') {
    throw new HiscoresError('shape', 'hiscores row was not an object');
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.username !== 'string') throw new HiscoresError('shape', 'row.username missing');
  const numericFields: Array<keyof HiscoreRow> = [
    'score',
    'points',
    'completedCount',
    'regionsUnlocked',
    'pactsUnlocked',
    'updatedAt',
    'clientUpdatedAt',
  ];
  for (const f of numericFields) {
    if (typeof r[f] !== 'number' || !Number.isFinite(r[f] as number)) {
      throw new HiscoresError('shape', `row.${f} missing or invalid`);
    }
  }
  return {
    username: r.username,
    score: r.score as number,
    points: r.points as number,
    completedCount: r.completedCount as number,
    regionsUnlocked: r.regionsUnlocked as number,
    pactsUnlocked: r.pactsUnlocked as number,
    updatedAt: r.updatedAt as number,
    clientUpdatedAt: r.clientUpdatedAt as number,
  };
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HiscoresError('shape', `non-JSON body (${msg})`);
  }
}

export async function fetchHiscores(baseUrl: string, limit = 100): Promise<HiscoreRow[]> {
  const url = buildUrl(baseUrl, `/scores?limit=${encodeURIComponent(String(limit))}`);
  const res = await safeFetch(url);
  if (!res.ok) {
    throw new HiscoresError(
      'http',
      `hiscores responded ${res.status} ${res.statusText}`,
      res.status,
    );
  }
  const body = await readJson(res);
  if (!body || typeof body !== 'object' || !Array.isArray((body as { rows?: unknown }).rows)) {
    throw new HiscoresError('shape', 'response missing `rows` array');
  }
  return ((body as { rows: unknown[] }).rows).map(parseRow);
}

export async function fetchHiscore(
  baseUrl: string,
  username: string,
): Promise<HiscoreRow | null> {
  const url = buildUrl(baseUrl, `/scores/${encodeURIComponent(username)}`);
  const res = await safeFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new HiscoresError(
      'http',
      `hiscores GET responded ${res.status} ${res.statusText}`,
      res.status,
    );
  }
  return parseRow(await readJson(res));
}

export async function putHiscore(
  baseUrl: string,
  username: string,
  payload: HiscoreSubmission,
): Promise<HiscoreRow> {
  const url = buildUrl(baseUrl, `/scores/${encodeURIComponent(username)}`);
  const res = await safeFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new HiscoresError(
      'http',
      `hiscores PUT responded ${res.status} ${res.statusText}`,
      res.status,
    );
  }
  return parseRow(await readJson(res));
}

export async function deleteHiscore(baseUrl: string, username: string): Promise<void> {
  const url = buildUrl(baseUrl, `/scores/${encodeURIComponent(username)}`);
  const res = await safeFetch(url, { method: 'DELETE' });
  // 404 on delete = already gone, treat as success.
  if (res.status === 404) return;
  if (!res.ok) {
    throw new HiscoresError(
      'http',
      `hiscores DELETE responded ${res.status} ${res.statusText}`,
      res.status,
    );
  }
}
