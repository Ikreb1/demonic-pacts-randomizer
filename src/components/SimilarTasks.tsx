import { useMemo } from 'react';
import { ALL_TASKS_LIST, selectCompleted, useStore } from '../state/store';
import { categorize } from '../lib/categoryRules';
import { isEligibleOrUnknown } from '../lib/eligibility';
import { TIER_LABELS } from '../types';
import type { Region, Task } from '../types';

const SAME_REGION_MAX = 8;
const OTHER_REGION_MAX = 6;

/**
 * Renders a compact list of tasks similar to the player's currently locked
 * task — same category bucket, prioritising same region (so the player can
 * batch them on a trip). Hides level-blocked tasks unless the player hasn't
 * synced any levels yet.
 */
export function SimilarTasks({ activeTask }: { activeTask: Task }) {
  const completed = useStore(selectCompleted);
  const unlocked = useStore((s) => s.unlockedRegions);
  const playerLevels = useStore((s) => s.playerLevels);
  const hasLevels = Object.keys(playerLevels).length > 0;

  const { sameRegion, otherRegions, label, emoji } = useMemo(() => {
    const groups = categorize([activeTask]);
    const cat = groups[0];
    if (!cat || cat.id === 'other') {
      return { sameRegion: [], otherRegions: [], label: '', emoji: '' };
    }
    const regionSet = new Set<Region>(unlocked);
    const candidates = ALL_TASKS_LIST.filter(
      (t) =>
        t.id !== activeTask.id &&
        regionSet.has(t.region) &&
        !completed.has(t.id) &&
        (!hasLevels || isEligibleOrUnknown(t, playerLevels)),
    );
    const inCategory = categorize(candidates).find((g) => g.id === cat.id)?.tasks ?? [];

    const same: Task[] = [];
    const other: Task[] = [];
    for (const t of inCategory) {
      if (t.region === activeTask.region) same.push(t);
      else other.push(t);
    }
    return {
      sameRegion: same.slice(0, SAME_REGION_MAX),
      otherRegions: other.slice(0, OTHER_REGION_MAX),
      label: cat.label,
      emoji: cat.emoji ?? '',
    };
  }, [activeTask, completed, unlocked, playerLevels, hasLevels]);

  if (sameRegion.length === 0 && otherRegions.length === 0) return null;

  return (
    <section className="similar-tasks">
      <h4 className="similar-tasks-head">
        <span aria-hidden>{emoji}</span> Similar — {label}
      </h4>
      {sameRegion.length > 0 && (
        <>
          <div className="similar-tasks-group-head">
            In <b>{activeTask.region}</b> (batch with your locked task)
          </div>
          <ul className="similar-tasks-list">
            {sameRegion.map((t) => (
              <SimilarRow key={t.id} task={t} showRegion={false} />
            ))}
          </ul>
        </>
      )}
      {otherRegions.length > 0 && (
        <>
          <div className="similar-tasks-group-head">In other unlocked regions</div>
          <ul className="similar-tasks-list">
            {otherRegions.map((t) => (
              <SimilarRow key={t.id} task={t} showRegion={true} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function SimilarRow({ task, showRegion }: { task: Task; showRegion: boolean }) {
  return (
    <li className="similar-tasks-row">
      <span className={`pill pill-${task.tier} similar-tier-pill`}>{TIER_LABELS[task.tier]}</span>
      <span className="similar-tasks-name">{task.name}</span>
      {showRegion && (
        <span className="pill pill-region similar-region-pill" data-region={task.region}>
          {task.region}
        </span>
      )}
    </li>
  );
}
