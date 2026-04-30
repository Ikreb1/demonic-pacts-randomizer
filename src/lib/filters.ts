import type { Region, Task, Tier } from '../types';
import { hasUnmetDependency, isAlwaysSkippedFromRoll } from './dependencies';

export function isEligible(task: Task, regions: ReadonlySet<Region>, completed: ReadonlySet<number>): boolean {
  if (!regions.has(task.region)) return false;
  if (completed.has(task.id)) return false;
  if (isAlwaysSkippedFromRoll(task)) return false;
  if (hasUnmetDependency(task, completed)) return false;
  return true;
}

export function eligibleByTier(
  tasks: readonly Task[],
  regions: ReadonlySet<Region>,
  completed: ReadonlySet<number>,
): Record<Tier, Task[]> {
  const out = { easy: [], medium: [], hard: [], elite: [], master: [] } as Record<Tier, Task[]>;
  for (const t of tasks) {
    if (isEligible(t, regions, completed)) out[t.tier].push(t);
  }
  return out;
}
