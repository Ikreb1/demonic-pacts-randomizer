import type { Region, Task, Tier } from '../types';

export function isEligible(task: Task, regions: ReadonlySet<Region>, completed: ReadonlySet<number>): boolean {
  return regions.has(task.region) && !completed.has(task.id);
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
