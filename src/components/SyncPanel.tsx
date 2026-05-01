import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { TASKS_BY_ID } from '../state/store';
import { fetchCompletion, WikiSyncError } from '../lib/wikisync';
import { parseTrackerExport, readJsonFile } from '../lib/importTracker';
import { normalizeWikiSyncLevels } from '../lib/eligibility';

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; msg: string } | { kind: 'err'; msg: string };

export function SyncPanel() {
  const recentUsernames = useStore((s) => s.recentUsernames ?? []);
  const rememberUsername = useStore((s) => s.rememberUsername);
  const forgetUsername = useStore((s) => s.forgetUsername);
  const [username, setUsername] = useState(() => recentUsernames[0] ?? '');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [proxyOpen, setProxyOpen] = useState(false);
  const [hiscoresOpen, setHiscoresOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const applySync = useStore((s) => s.applySync);
  const clearSync = useStore((s) => s.clearSync);
  const lastSync = useStore((s) => s.lastSync);
  const syncedCount = useStore((s) => s.syncedComplete.length);
  const manualCount = useStore((s) => s.manualComplete.length);
  const proxyBaseUrl = useStore((s) => s.proxyBaseUrl);
  const setProxyBaseUrl = useStore((s) => s.setProxyBaseUrl);
  const hiscoresBaseUrl = useStore((s) => s.hiscoresProxyBaseUrl);
  const setHiscoresBaseUrl = useStore((s) => s.setHiscoresBaseUrl);

  async function onWikiSync() {
    setStatus({ kind: 'busy' });
    try {
      const { completed, levels } = await fetchCompletion(username, proxyBaseUrl);
      applySync(
        completed,
        { username, at: Date.now(), source: 'wikisync' },
        normalizeWikiSyncLevels(levels),
      );
      rememberUsername(username);
      setStatus({ kind: 'ok', msg: `Synced ${completed.length} completed tasks for ${username}.` });
    } catch (err) {
      const msg = err instanceof WikiSyncError ? err.message : err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'err', msg });
    }
  }

  async function onFile(file: File) {
    setStatus({ kind: 'busy' });
    try {
      const json = await readJsonFile(file);
      const known = new Set(TASKS_BY_ID.keys());
      const result = parseTrackerExport(json, known);
      const note =
        `Imported ${result.completedIds.length} completed of ${result.totalSeen} tracked` +
        (result.unknownIds.length ? `; ${result.unknownIds.length} unknown ids ignored` : '') +
        (result.taskTypeMatched ? '' : ' (warning: taskType did not match DEMONIC_PACTS)');
      applySync(result.completedIds, {
        username: result.username ?? '(plugin import)',
        at: Date.now(),
        source: 'plugin',
      });
      if (result.username) rememberUsername(result.username);
      setStatus({ kind: 'ok', msg: note });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'err', msg: `Import failed: ${msg}` });
    }
  }

  return (
    <section className="panel">
      <h2>Sync Completion</h2>
      <p className="hint">Pull your completed tasks so they don't show up in rolls.</p>

      <div className="sync-row">
        <input
          type="text"
          placeholder="RuneScape display name"
          value={username}
          list="recent-usernames"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && username.trim()) onWikiSync();
          }}
        />
        <button onClick={onWikiSync} disabled={!username.trim() || status.kind === 'busy'}>
          WikiSync
        </button>
        {recentUsernames.length > 0 && (
          <datalist id="recent-usernames">
            {recentUsernames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}
      </div>
      {recentUsernames.length > 0 && (
        <div className="sync-recent">
          <span className="hint">Recent:</span>
          {recentUsernames.map((n) => (
            <span key={n} className="sync-recent-pill">
              <button
                type="button"
                className="link sync-recent-name"
                onClick={() => setUsername(n)}
                title={`Use ${n}`}
              >
                {n}
              </button>
              <button
                type="button"
                className="link sync-recent-x"
                onClick={() => forgetUsername(n)}
                aria-label={`Forget ${n}`}
                title={`Forget ${n}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="sync-row sync-proxy-row">
        <button className="link" onClick={() => setProxyOpen((o) => !o)} aria-expanded={proxyOpen}>
          {proxyOpen ? '▾' : '▸'} Proxy URL{proxyBaseUrl ? ' (set)' : ' (required for WikiSync)'}
        </button>
      </div>
      {proxyOpen && (
        <div className="sync-proxy-body">
          <input
            type="text"
            placeholder="https://your-worker.workers.dev"
            value={proxyBaseUrl}
            onChange={(e) => setProxyBaseUrl(e.target.value)}
          />
          <p className="hint">
            Direct WikiSync fetches are blocked by CORS from this site. Deploy the 10-line Cloudflare
            Worker in <a href="https://github.com/Breki/demonic-pacts-randomizer/blob/main/docs/cors-worker.md" target="_blank" rel="noreferrer">docs/cors-worker.md</a> and paste its URL above. Free tier; 5-minute setup.
          </p>
        </div>
      )}

      {import.meta.env.DEV && (
        <>
          <div className="sync-row sync-proxy-row">
            <button
              className="link"
              onClick={() => setHiscoresOpen((o) => !o)}
              aria-expanded={hiscoresOpen}
            >
              {hiscoresOpen ? '▾' : '▸'} Hiscores URL{hiscoresBaseUrl ? ' (set)' : ''}
            </button>
          </div>
          {hiscoresOpen && (
            <div className="sync-proxy-body">
              <input
                type="text"
                placeholder="https://dpl-hiscores.workers.dev"
                value={hiscoresBaseUrl}
                onChange={(e) => setHiscoresBaseUrl(e.target.value)}
              />
              <p className="hint">
                Worker that stores the community leaderboard. The default points at the shared
                instance; only override if you've deployed your own.
              </p>
            </div>
          )}
        </>
      )}

      <div className="sync-row">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            if (fileRef.current) fileRef.current.value = '';
          }}
        />
      </div>
      <p className="hint">
        Or upload a JSON export from the{' '}
        <a href="https://github.com/osrs-reldo/tasks-tracker-plugin" target="_blank" rel="noreferrer">
          Tasks Tracker
        </a>{' '}
        RuneLite plugin.
      </p>

      <div className="sync-status">
        {status.kind === 'busy' && <span>Working…</span>}
        {status.kind === 'ok' && <span className="ok">{status.msg}</span>}
        {status.kind === 'err' && <span className="err">{status.msg}</span>}
      </div>

      <div className="sync-meta">
        <div>
          Synced: <b>{syncedCount}</b> · Manual: <b>{manualCount}</b>
        </div>
        {lastSync && (
          <div className="hint">
            Last: {lastSync.username} via {lastSync.source} ({new Date(lastSync.at).toLocaleString()})
            <button className="link" onClick={clearSync}>
              clear
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
