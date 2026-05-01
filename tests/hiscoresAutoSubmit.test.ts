import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub localStorage before importing the store (zustand/persist reads it on import).
class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
}
(globalThis as unknown as { localStorage: Storage }).localStorage =
  new MemoryStorage() as unknown as Storage;

const { useStore, ALL_PACTS_LIST } = await import('../src/state/store');
const { buildSubmissionPayload, submitHiscoreFromState } = await import(
  '../src/lib/hiscoresAutoSubmit'
);

const CENTER_PACT_ID =
  ALL_PACTS_LIST.find((p) => (p.x ?? 0) === 0 && (p.y ?? 0) === 0)?.id ?? ALL_PACTS_LIST[0]?.id;

function freshState(over: Partial<ReturnType<typeof useStore.getState>> = {}) {
  useStore.setState({
    unlockedRegions: ['General', 'Varlamore'],
    manualComplete: [],
    syncedComplete: [],
    lastSync: null,
    activeTask: null,
    currentRoll: null,
    score: 0,
    lockedRelics: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null },
    bonusRelics: [],
    unlockedPactIds: CENTER_PACT_ID ? [CENTER_PACT_ID] : [],
    pactResetsUsed: 0,
    hiscoresProxyBaseUrl: 'https://example.test',
    hiscoresLastSubmittedAt: null,
    hiscoresLastSubmittedScore: null,
    hiscoresLastError: null,
    ...over,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  freshState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildSubmissionPayload', () => {
  it('returns null when no sync has happened', () => {
    expect(buildSubmissionPayload(useStore.getState())).toBeNull();
  });

  it('returns null when last sync was a plugin import (not WikiSync)', () => {
    freshState({
      lastSync: { username: 'Zezima', at: 1, source: 'plugin' },
      score: 100,
    });
    expect(buildSubmissionPayload(useStore.getState())).toBeNull();
  });

  it('returns null when score equals last submitted score (no-op)', () => {
    freshState({
      lastSync: { username: 'Zezima', at: 1, source: 'wikisync' },
      score: 4242,
      hiscoresLastSubmittedScore: 4242,
    });
    expect(buildSubmissionPayload(useStore.getState())).toBeNull();
  });

  it('returns null when username is whitespace', () => {
    freshState({
      lastSync: { username: '   ', at: 1, source: 'wikisync' },
      score: 100,
    });
    expect(buildSubmissionPayload(useStore.getState())).toBeNull();
  });

  it('builds a full payload after a wikisync run', () => {
    freshState({
      lastSync: { username: 'Zezima', at: 1, source: 'wikisync' },
      score: 4242,
      unlockedRegions: ['General', 'Varlamore', 'Karamja'],
    });
    const payload = buildSubmissionPayload(useStore.getState(), 1_700_000_000_000);
    expect(payload).toMatchObject({
      username: 'Zezima',
      score: 4242,
      regionsUnlocked: 3,
      pactsUnlocked: 1,
      clientUpdatedAt: 1_700_000_000_000,
    });
    expect(typeof payload?.points).toBe('number');
    expect(typeof payload?.completedCount).toBe('number');
  });

  it('trims whitespace from username', () => {
    freshState({
      lastSync: { username: '  Zezima  ', at: 1, source: 'wikisync' },
      score: 1,
    });
    expect(buildSubmissionPayload(useStore.getState())?.username).toBe('Zezima');
  });
});

describe('submitHiscoreFromState', () => {
  it('PUTs to the configured base URL and records a successful submit', async () => {
    freshState({
      lastSync: { username: 'Zezima', at: 1, source: 'wikisync' },
      score: 4242,
      hiscoresProxyBaseUrl: 'https://example.test',
    });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          username: 'Zezima',
          score: 4242,
          points: 0,
          completedCount: 0,
          regionsUnlocked: 2,
          pactsUnlocked: 1,
          updatedAt: 1_700_000_000_000,
          clientUpdatedAt: 1_699_999_999_000,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await submitHiscoreFromState(useStore.getState());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/scores/Zezima');
    expect(init?.method).toBe('PUT');

    const s = useStore.getState();
    expect(s.hiscoresLastSubmittedScore).toBe(4242);
    expect(s.hiscoresLastSubmittedAt).toBe(1_700_000_000_000);
    expect(s.hiscoresLastError).toBeNull();
  });

  it('does not call fetch when not eligible (plugin source)', async () => {
    freshState({
      lastSync: { username: 'Zezima', at: 1, source: 'plugin' },
      score: 4242,
    });
    await submitHiscoreFromState(useStore.getState());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records an error when the worker returns 4xx', async () => {
    freshState({
      lastSync: { username: 'Zezima', at: 1, source: 'wikisync' },
      score: 4242,
    });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid score' }), {
        status: 400,
        statusText: 'Bad Request',
      }),
    );
    // Suppress the console.warn from the catch path.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await submitHiscoreFromState(useStore.getState());
    warn.mockRestore();

    const s = useStore.getState();
    expect(s.hiscoresLastError).not.toBeNull();
    expect(s.hiscoresLastError?.message).toMatch(/400/);
    expect(s.hiscoresLastSubmittedAt).toBeNull();
  });

  it('records an error when fetch throws (CORS / network)', async () => {
    freshState({
      lastSync: { username: 'Zezima', at: 1, source: 'wikisync' },
      score: 4242,
    });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await submitHiscoreFromState(useStore.getState());
    warn.mockRestore();
    expect(useStore.getState().hiscoresLastError?.message).toMatch(/Couldn't reach/);
  });
});
