import { useMemo, useState } from 'react';
import { ALL_TASKS_LIST, selectActiveTask, selectCompleted, useStore } from '../state/store';
import { categorize } from '../lib/categoryRules';
import { TaskCard } from './TaskCard';
import type { Region } from '../types';

export function CategoriesTab() {
  const completed = useStore(selectCompleted);
  const unlocked = useStore((s) => s.unlockedRegions);
  const activeTask = useStore(selectActiveTask);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filteredTasks = useMemo(() => {
    const regionSet = new Set<Region>(unlocked);
    return ALL_TASKS_LIST.filter((t) => regionSet.has(t.region) && !completed.has(t.id));
  }, [unlocked, completed]);

  const groups = useMemo(() => categorize(filteredTasks), [filteredTasks]);

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  return (
    <div className="categories">
      <p className="hint">
        Incomplete tasks in your unlocked regions, grouped by similarity. Click a category to expand.
        {activeTask && (
          <>
            {' '}
            Your active task <b>{activeTask.name}</b> is highlighted.
          </>
        )}
      </p>
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
        {groups.length === 0 && <p>Nothing to show — every eligible task is already completed.</p>}
      </div>
    </div>
  );
}
