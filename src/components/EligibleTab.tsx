import { useMemo, useState } from 'react';
import { ALL_TASKS_LIST, selectActiveTask, selectCompleted, useStore } from '../state/store';
import { categorize } from '../lib/categoryRules';
import { checkEligibility } from '../lib/eligibility';
import { TaskCard } from './TaskCard';
import type { Region } from '../types';

export function EligibleTab() {
  const completed = useStore(selectCompleted);
  const unlocked = useStore((s) => s.unlockedRegions);
  const playerLevels = useStore((s) => s.playerLevels);
  const lastSync = useStore((s) => s.lastSync);
  const activeTask = useStore(selectActiveTask);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [includeUnknown, setIncludeUnknown] = useState(true);

  const hasLevels = Object.keys(playerLevels).length > 0;

  const filtered = useMemo(() => {
    const regionSet = new Set<Region>(unlocked);
    const inScope = ALL_TASKS_LIST.filter(
      (t) => regionSet.has(t.region) && !completed.has(t.id),
    );
    if (!hasLevels) return inScope;
    return inScope.filter((t) => {
      const e = checkEligibility(t, playerLevels);
      if (e.status === 'eligible') return true;
      if (e.status === 'unknown') return includeUnknown;
      return false;
    });
  }, [unlocked, completed, playerLevels, hasLevels, includeUnknown]);

  const totalInScope = useMemo(() => {
    const regionSet = new Set<Region>(unlocked);
    return ALL_TASKS_LIST.filter((t) => regionSet.has(t.region) && !completed.has(t.id)).length;
  }, [unlocked, completed]);

  const groups = useMemo(() => categorize(filtered), [filtered]);

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  return (
    <div className="categories">
      {!hasLevels ? (
        <p className="hint">
          Sync your levels with WikiSync to filter tasks by what you can actually attempt.
          Without levels, every incomplete task in your unlocked regions is shown.
        </p>
      ) : (
        <p className="hint">
          Showing <b>{filtered.length}</b> of {totalInScope} incomplete tasks you have the skill
          levels for{lastSync ? <> — levels from {lastSync.username} via {lastSync.source}</> : null}.
          {' '}
          <label className="eligible-toggle">
            <input
              type="checkbox"
              checked={includeUnknown}
              onChange={(e) => setIncludeUnknown(e.target.checked)}
            />{' '}
            include tasks with non-skill requirements
          </label>
        </p>
      )}

      <div className="category-grid">
        {groups.map((g) => {
          const open = expanded.has(g.id);
          return (
            <section key={g.id} className={open ? 'category-card open' : 'category-card'}>
              <button className="category-header" onClick={() => toggle(g.id)} aria-expanded={open}>
                <span className="category-emoji" aria-hidden>{g.emoji}</span>
                <span className="category-label">{g.label}</span>
                <span className="category-count">{g.tasks.length}</span>
                <span className="category-chev" aria-hidden>{open ? '▾' : '▸'}</span>
              </button>
              {open && (
                <ul className="category-task-list">
                  {g.tasks.map((t) => {
                    const isActive = activeTask?.id === t.id;
                    return (
                      <li key={t.id} className={isActive ? 'is-active' : undefined}>
                        <TaskCard task={t} variant="list" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {groups.length === 0 && hasLevels && (
          <p>
            No tasks match your current levels. Either you've cleared everything you can attempt,
            or your sync is stale — try resyncing.
          </p>
        )}
        {groups.length === 0 && !hasLevels && (
          <p>Nothing to show — every eligible task is already completed.</p>
        )}
      </div>
    </div>
  );
}
