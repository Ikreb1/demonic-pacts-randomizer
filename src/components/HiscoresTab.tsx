import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../state/store';
import {
  fetchHiscores,
  deleteHiscore,
  HiscoresError,
  type HiscoreRow,
} from '../lib/hiscores';

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; rows: HiscoreRow[] }
  | { kind: 'error'; message: string };

function relativeTime(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

function errMessage(err: unknown): string {
  if (err instanceof HiscoresError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function HiscoresTab() {
  const baseUrl = useStore((s) => s.hiscoresProxyBaseUrl);
  const lastSync = useStore((s) => s.lastSync);
  const lastSubmittedAt = useStore((s) => s.hiscoresLastSubmittedAt);
  const lastError = useStore((s) => s.hiscoresLastError);

  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const rows = await fetchHiscores(baseUrl, 100);
      setState({ kind: 'ready', rows });
    } catch (err) {
      setState({ kind: 'error', message: errMessage(err) });
    }
  }, [baseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRemove() {
    const username = lastSync?.username;
    if (!username) return;
    const ok = window.confirm(
      `Remove "${username}" from the hiscores? Your local progress is unaffected; ` +
        `the row will be republished after your next score change.`,
    );
    if (!ok) return;
    try {
      await deleteHiscore(baseUrl, username);
    } catch (err) {
      window.alert(`Could not remove from hiscores: ${errMessage(err)}`);
      return;
    }
    void load();
  }

  const eligible = lastSync?.source === 'wikisync';
  const myUsername = lastSync?.username?.toLowerCase() ?? '';

  return (
    <div className="hiscores">
      <section className="panel hiscores-status">
        {!eligible && (
          <p className="hint">
            Run <b>WikiSync</b> (sidebar) to appear on the leaderboard. Plugin imports are local-only.
          </p>
        )}
        {eligible && lastSubmittedAt !== null && (
          <p className="hint">
            Submitted as <b>{lastSync!.username}</b> · last publish {relativeTime(lastSubmittedAt)}
          </p>
        )}
        {eligible && lastSubmittedAt === null && (
          <p className="hint">
            Eligible as <b>{lastSync!.username}</b> — your next score change will publish.
          </p>
        )}
        {lastError && (
          <p className="hiscores-err">
            Last submit failed: {lastError.message}
          </p>
        )}
        <div className="hiscores-actions">
          <button onClick={() => void load()} disabled={state.kind === 'loading'}>
            {state.kind === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
          {eligible && lastSync?.username && (
            <button className="link" onClick={onRemove}>
              Remove me from the board
            </button>
          )}
        </div>
      </section>

      {state.kind === 'error' && (
        <div className="hiscores-error-block">
          <p className="hiscores-err">Couldn't load hiscores: {state.message}</p>
          <button onClick={() => void load()}>Try again</button>
        </div>
      )}

      {state.kind === 'ready' && state.rows.length === 0 && (
        <p className="hint">No scores yet — be the first.</p>
      )}

      {state.kind === 'ready' && state.rows.length > 0 && (
        <table className="hiscores-table">
          <thead>
            <tr>
              <th className="hiscores-rank">#</th>
              <th className="hiscores-player">Player</th>
              <th className="hiscores-num">Score</th>
              <th className="hiscores-num">Points</th>
              <th className="hiscores-num">Done</th>
              <th className="hiscores-when">Last updated</th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row, i) => {
              const isSelf = myUsername !== '' && row.username.toLowerCase() === myUsername;
              return (
                <tr
                  key={row.username.toLowerCase()}
                  className={isSelf ? 'hiscore-row-self' : undefined}
                >
                  <td className="hiscores-rank">{i + 1}</td>
                  <td className="hiscores-player">{row.username}</td>
                  <td className="hiscores-num">{row.score.toLocaleString()}</td>
                  <td className="hiscores-num">{row.points.toLocaleString()}</td>
                  <td className="hiscores-num">{row.completedCount}</td>
                  <td className="hiscores-when">{relativeTime(row.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
