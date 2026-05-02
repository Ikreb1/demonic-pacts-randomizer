import { useMemo, useState } from 'react';
import { ALL_TASKS_LIST, selectActiveTask, selectCompleted, useStore } from '../state/store';
import { eligibleByTier } from '../lib/filters';
import { TIERS, TIER_LABELS } from '../types';
import { TaskCard } from './TaskCard';
import type { Region, Tier } from '../types';

// Mirrors the exact filter used by the randomizer:
//   - in an unlocked region
//   - not yet completed
//   - not in the hardcoded skip set (tutorial / random events / outfits)
//   - all chain prerequisites satisfied
// i.e. anything in this view is something a fresh roll could surface.
export function RollableTab() {
  const completed = useStore(selectCompleted);
  const unlocked = useStore((s) => s.unlockedRegions);
  const activeTask = useStore(selectActiveTask);
  const [expanded, setExpanded] = useState<Set<Tier>>(new Set());

  const buckets = useMemo(() => {
    const regionSet = new Set<Region>(unlocked);
    return eligibleByTier(ALL_TASKS_LIST, regionSet, completed);
  }, [unlocked, completed]);

  const total = TIERS.reduce((sum, t) => sum + buckets[t].length, 0);

  function toggle(t: Tier) {
    const next = new Set(expanded);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setExpanded(next);
  }

  return (
    <div className="categories">
      <p className="hint">
        The full roll pool: every task that could come up in a roll right now — in your unlocked
        regions, not yet completed, not a hardcoded skip, with all chain prerequisites satisfied.
        <b> {total}</b> total.
      </p>
      <div className="category-grid">
        {TIERS.map((tier) => {
          const open = expanded.has(tier);
          const tasks = buckets[tier];
          return (
            <section key={tier} className={open ? 'category-card open' : 'category-card'}>
              <button
                className="category-header"
                onClick={() => toggle(tier)}
                aria-expanded={open}
              >
                <span className={`pill pill-${tier}`}>{TIER_LABELS[tier]}</span>
                <span className="category-count">{tasks.length}</span>
                <span className="category-chev" aria-hidden>
                  {open ? '▾' : '▸'}
                </span>
              </button>
              {open && (
                <ul className="category-task-list">
                  {tasks.map((t) => {
                    const isActive = activeTask?.id === t.id;
                    return (
                      <li key={t.id} className={isActive ? 'is-active' : undefined}>
                        <TaskCard task={t} variant="list" />
                      </li>
                    );
                  })}
                  {tasks.length === 0 && <li className="hint">Pool is empty for this tier.</li>}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
