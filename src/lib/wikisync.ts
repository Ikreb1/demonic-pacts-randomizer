// WikiSync fetch. The OSRS wiki gadget hits this endpoint for the league task
// page itself; for Demonic Pacts the gametype string is `DEMONIC_PACTS_LEAGUE`
// (verified against MediaWiki:Gadget-wikisync-core.js).
//
// The endpoint does not send ACAO for arbitrary third-party origins, so a
// direct browser fetch from *.github.io fails. The user must point at a CORS
// proxy (see docs/cors-worker.md). Empty proxy = direct fetch (will fail in
// most browsers; surfaced as a CORS error).

export const WIKISYNC_GAMETYPE = 'DEMONIC_PACTS_LEAGUE';
export const WIKISYNC_DIRECT = 'https://sync.runescape.wiki';
const WIKISYNC_PATH = '/runelite/player';

export interface WikiSyncResponse {
  league_tasks?: number[];
  levels?: Record<string, number>;
  [key: string]: unknown;
}

export class WikiSyncError extends Error {
  constructor(
    public readonly kind: 'not_found' | 'cors' | 'network' | 'shape' | 'http',
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
  }
}

// Accept either an origin (`https://x.workers.dev`) or a fully-qualified base
// (`https://x.workers.dev/runelite/player`). Normalize to the latter.
export function buildPlayerUrl(proxyOrDirect: string, username: string): string {
  const base = (proxyOrDirect || WIKISYNC_DIRECT).replace(/\/+$/, '');
  const withPath = base.includes('/runelite/player') ? base : `${base}${WIKISYNC_PATH}`;
  return `${withPath}/${encodeURIComponent(username)}/${WIKISYNC_GAMETYPE}`;
}

export async function fetchCompletion(
  username: string,
  proxyBaseUrl: string = '',
): Promise<{ completed: number[]; levels: Record<string, number>; raw: WikiSyncResponse }> {
  const trimmed = username.trim();
  if (!trimmed) throw new WikiSyncError('shape', 'Username is empty.');

  const url = buildPlayerUrl(proxyBaseUrl, trimmed);
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const usingProxy = !!proxyBaseUrl.trim();
    const hint = usingProxy
      ? `Couldn't reach your proxy at ${proxyBaseUrl}. Make sure it's deployed and the URL is correct.`
      : `WikiSync doesn't allow cross-origin reads from this site, so a direct fetch always fails. Set the Proxy URL field below (see docs/cors-worker.md for a 5-minute Cloudflare Worker setup), or upload a Tasks Tracker plugin export instead.`;
    throw new WikiSyncError('cors', `${hint} (${msg})`);
  }

  if (res.status === 404) {
    throw new WikiSyncError('not_found', `No WikiSync profile found for "${trimmed}".`, 404);
  }
  if (!res.ok) {
    throw new WikiSyncError('http', `WikiSync responded ${res.status} ${res.statusText}.`, res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new WikiSyncError('shape', `WikiSync returned non-JSON body. (${msg})`);
  }
  if (!body || typeof body !== 'object') {
    throw new WikiSyncError('shape', 'WikiSync response was not an object.');
  }
  const raw = body as WikiSyncResponse;
  const list = raw.league_tasks;
  if (!Array.isArray(list)) {
    throw new WikiSyncError('shape', 'WikiSync response missing `league_tasks` array.');
  }
  const completed = list.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  const levels: Record<string, number> = {};
  if (raw.levels && typeof raw.levels === 'object') {
    for (const [k, v] of Object.entries(raw.levels)) {
      if (typeof v === 'number' && Number.isFinite(v)) levels[k] = v;
    }
  }
  return { completed, levels, raw };
}
