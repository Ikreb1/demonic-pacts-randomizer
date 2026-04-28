import type { Task, Tier } from '../types';
import { TIERS } from '../types';
import { eligibleByTier } from './filters';
import type { Region } from '../types';

export type RollResult = Record<Tier, number | null>;

export function rollOnePerTier(
  tasks: readonly Task[],
  regions: ReadonlySet<Region>,
  completed: ReadonlySet<number>,
  rng: () => number = Math.random,
): RollResult {
  const buckets = eligibleByTier(tasks, regions, completed);
  const out = {} as RollResult;
  for (const tier of TIERS) {
    const pool = buckets[tier];
    if (pool.length === 0) {
      out[tier] = null;
    } else {
      const pick = pool[Math.floor(rng() * pool.length)];
      out[tier] = pick.id;
    }
  }
  return out;
}
