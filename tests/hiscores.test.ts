import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HISCORES_BASE_URL,
  HiscoresError,
  type HiscoreRow,
  type HiscoreSubmission,
  deleteHiscore,
  fetchHiscore,
  fetchHiscores,
  putHiscore,
} from '../src/lib/hiscores';

const SAMPLE_ROW: HiscoreRow = {
  username: 'Zezima',
  score: 12345,
  points: 6789,
  completedCount: 42,
  regionsUnlocked: 5,
  pactsUnlocked: 7,
  updatedAt: 1_700_000_000_000,
  clientUpdatedAt: 1_699_999_999_000,
};

const SAMPLE_PAYLOAD: HiscoreSubmission = {
  username: 'Zezima',
  score: 12345,
  points: 6789,
  completedCount: 42,
  regionsUnlocked: 5,
  pactsUnlocked: 7,
  clientUpdatedAt: 1_699_999_999_000,
};

function jsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchHiscores', () => {
  it('GETs /scores with the limit param and returns parsed rows', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [SAMPLE_ROW] }));
    const rows = await fetchHiscores('https://example.test', 50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/scores?limit=50');
    expect(rows).toEqual([SAMPLE_ROW]);
  });

  it('falls back to the default base URL when an empty string is passed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [] }));
    await fetchHiscores('', 100);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DEFAULT_HISCORES_BASE_URL}/scores?limit=100`);
  });

  it('strips trailing slashes from the base URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [] }));
    await fetchHiscores('https://example.test///', 10);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/scores?limit=10');
  });

  it('throws HiscoresError(http) on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 503, 'Service Unavailable'));
    await expect(fetchHiscores('https://example.test')).rejects.toMatchObject({
      kind: 'http',
      httpStatus: 503,
    });
  });

  it('throws HiscoresError(shape) when body is missing rows array', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ wat: true }));
    await expect(fetchHiscores('https://example.test')).rejects.toMatchObject({
      kind: 'shape',
    });
  });

  it('throws HiscoresError(shape) when a row is malformed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [{ username: 'X' /* missing numbers */ }] }));
    await expect(fetchHiscores('https://example.test')).rejects.toBeInstanceOf(HiscoresError);
  });

  it('throws HiscoresError(cors) when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(fetchHiscores('https://example.test')).rejects.toMatchObject({
      kind: 'cors',
    });
  });
});

describe('fetchHiscore', () => {
  it('returns the row on 200', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SAMPLE_ROW));
    const row = await fetchHiscore('https://example.test', 'Zezima');
    expect(row).toEqual(SAMPLE_ROW);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/scores/Zezima');
  });

  it('returns null on 404', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    expect(await fetchHiscore('https://example.test', 'Ghost')).toBeNull();
  });

  it('URL-encodes usernames with spaces', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    await fetchHiscore('https://example.test', 'Mr Big');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/scores/Mr%20Big');
  });
});

describe('putHiscore', () => {
  it('PUTs JSON with Content-Type and parses the response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SAMPLE_ROW));
    const out = await putHiscore('https://example.test', 'Zezima', SAMPLE_PAYLOAD);
    expect(out).toEqual(SAMPLE_ROW);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/scores/Zezima');
    expect(init).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(init.body)).toEqual(SAMPLE_PAYLOAD);
  });

  it('throws HiscoresError(http) on validation failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid score' }, 400, 'Bad Request'));
    await expect(
      putHiscore('https://example.test', 'Zezima', SAMPLE_PAYLOAD),
    ).rejects.toMatchObject({ kind: 'http', httpStatus: 400 });
  });
});

describe('deleteHiscore', () => {
  it('sends DELETE and resolves on 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteHiscore('https://example.test', 'Zezima')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/scores/Zezima');
    expect(init).toMatchObject({ method: 'DELETE' });
  });

  it('treats 404 as already-gone success', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(deleteHiscore('https://example.test', 'Ghost')).resolves.toBeUndefined();
  });

  it('throws on other errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(deleteHiscore('https://example.test', 'X')).rejects.toMatchObject({
      kind: 'http',
      httpStatus: 500,
    });
  });
});
