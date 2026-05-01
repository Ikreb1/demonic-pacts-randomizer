// Hiscores worker for the Demonic Pacts Randomizer.
//
// One row per OSRS username, stored in KV under `score:<lowercased-name>`.
// Last-write-wins; the client auto-submits after a successful WikiSync.
// No auth in v1 — see docs/hiscores-worker.md for the trade-off and the
// rate-limiting / HMAC mitigations we'd add if forgery becomes a real
// problem in practice.

export interface Env {
  HISCORES: KVNamespace;
}

interface HiscoreRow {
  username: string;
  score: number;
  points: number;
  completedCount: number;
  regionsUnlocked: number;
  pactsUnlocked: number;
  updatedAt: number;
  clientUpdatedAt: number;
}

const ALLOWED_ORIGINS = new Set<string>([
  'https://ikreb1.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

// OSRS display names: 1-12 chars, letters/digits/space/underscore/hyphen.
const USERNAME_RE = /^[A-Za-z0-9 _\-]{1,12}$/;
const KEY_PREFIX = 'score:';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const SCORE_MIN = -1_000_000;
const SCORE_MAX = 10_000_000;
const POINTS_MAX = 10_000_000;
const COMPLETED_MAX = 1000;
const REGIONS_MAX = 32;
const PACTS_MAX = 100;
// Skew tolerance between client-reported time and server clock; rejects
// trivially-stale tampered submissions without breaking real users on a
// slightly-wrong system clock.
const CLIENT_SKEW_MS = 24 * 60 * 60 * 1000;

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(
  data: unknown,
  status: number,
  origin: string | null,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
      ...extra,
    },
  });
}

function err(status: number, message: string, origin: string | null): Response {
  return json({ error: message }, status, origin);
}

function keyFor(username: string): string {
  return `${KEY_PREFIX}${username.toLowerCase()}`;
}

function validateUsername(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  const trimmed = u.trim();
  return USERNAME_RE.test(trimmed) ? trimmed : null;
}

function validateRow(
  body: unknown,
  expectedUsername: string,
  now: number,
): HiscoreRow | string {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  const b = body as Record<string, unknown>;

  const username = validateUsername(b.username);
  if (!username) return 'invalid username';
  if (username.toLowerCase() !== expectedUsername.toLowerCase()) {
    return 'body.username does not match path';
  }

  const numericFields = [
    'score',
    'points',
    'completedCount',
    'regionsUnlocked',
    'pactsUnlocked',
    'clientUpdatedAt',
  ] as const;
  for (const f of numericFields) {
    const v = b[f];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `invalid ${f}`;
  }

  const score = b.score as number;
  if (score < SCORE_MIN || score > SCORE_MAX) return 'score out of range';
  const points = b.points as number;
  if (points < 0 || points > POINTS_MAX) return 'points out of range';
  const completedCount = b.completedCount as number;
  if (completedCount < 0 || completedCount > COMPLETED_MAX) return 'completedCount out of range';
  const regionsUnlocked = b.regionsUnlocked as number;
  if (regionsUnlocked < 0 || regionsUnlocked > REGIONS_MAX) return 'regionsUnlocked out of range';
  const pactsUnlocked = b.pactsUnlocked as number;
  if (pactsUnlocked < 0 || pactsUnlocked > PACTS_MAX) return 'pactsUnlocked out of range';
  const clientUpdatedAt = b.clientUpdatedAt as number;
  if (Math.abs(clientUpdatedAt - now) > CLIENT_SKEW_MS) return 'clientUpdatedAt skew too large';

  return {
    username,
    score,
    points,
    completedCount,
    regionsUnlocked,
    pactsUnlocked,
    clientUpdatedAt,
    updatedAt: now,
  };
}

async function handleGetAll(env: Env, url: URL, origin: string | null): Promise<Response> {
  const limitParam = url.searchParams.get('limit');
  const parsed = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
  const limit = Math.min(Math.max(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT, 1), MAX_LIMIT);

  // KV list returns metadata only, so we need a parallel get per key. Fine
  // for the small populations we expect (tens to low hundreds); the 30 s
  // edge cache absorbs bursts.
  const list = await env.HISCORES.list({ prefix: KEY_PREFIX });
  const values = await Promise.all(list.keys.map((k) => env.HISCORES.get(k.name)));
  const rows: HiscoreRow[] = [];
  for (const v of values) {
    if (!v) continue;
    try {
      rows.push(JSON.parse(v) as HiscoreRow);
    } catch {
      // Corrupt row — skip silently rather than fail the whole list.
    }
  }
  rows.sort((a, b) => b.score - a.score);
  return json({ rows: rows.slice(0, limit) }, 200, origin, {
    'Cache-Control': 'public, max-age=30',
  });
}

async function handleGetOne(
  env: Env,
  username: string,
  origin: string | null,
): Promise<Response> {
  const v = await env.HISCORES.get(keyFor(username));
  if (!v) return err(404, 'not found', origin);
  try {
    return json(JSON.parse(v) as HiscoreRow, 200, origin);
  } catch {
    return err(500, 'corrupt row', origin);
  }
}

async function handlePut(
  env: Env,
  username: string,
  request: Request,
  origin: string | null,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(400, 'invalid JSON body', origin);
  }
  const result = validateRow(body, username, Date.now());
  if (typeof result === 'string') return err(400, result, origin);
  await env.HISCORES.put(keyFor(username), JSON.stringify(result));
  return json(result, 200, origin);
}

async function handleDelete(
  env: Env,
  username: string,
  origin: string | null,
): Promise<Response> {
  await env.HISCORES.delete(keyFor(username));
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Browser requests must come from an allowlisted origin. Non-browser
    // clients (curl, server-to-server) don't send Origin and pass through.
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return err(403, 'origin not allowed', origin);
    }

    if (url.pathname === '/' || url.pathname === '') {
      return new Response('demonic-pacts-randomizer hiscores', {
        status: 200,
        headers: corsHeaders(origin),
      });
    }

    if (url.pathname === '/scores' && request.method === 'GET') {
      return handleGetAll(env, url, origin);
    }

    const match = url.pathname.match(/^\/scores\/([^/]+)$/);
    if (match) {
      const username = validateUsername(decodeURIComponent(match[1]));
      if (!username) return err(400, 'invalid username', origin);
      switch (request.method) {
        case 'GET':
          return handleGetOne(env, username, origin);
        case 'PUT':
          return handlePut(env, username, request, origin);
        case 'DELETE':
          return handleDelete(env, username, origin);
        default:
          return err(405, 'method not allowed', origin);
      }
    }

    return err(404, 'not found', origin);
  },
};
