import { describe, it, expect } from 'vitest';
import { rollOnePerTier } from '../src/lib/randomizer';
import { eligibleByTier } from '../src/lib/filters';
import { REGIONS, TIERS } from '../src/types';
import type { Region, Task, Tier } from '../src/types';
import tasksFile from '../src/data/tasks.json';

const TASKS: readonly Task[] = (tasksFile as { tasks: Task[] }).tasks;
const ITERATIONS = 10_000;

// Default scenario: every region unlocked, nothing completed. This is the
// "is the picker uniform" diagnostic — pools are at their largest, so any
// bias toward specific IDs would show up cleanly.
const REGIONS_ALL: ReadonlySet<Region> = new Set(REGIONS);
const COMPLETED_NONE: ReadonlySet<number> = new Set();

interface TierStats {
  tier: Tier;
  poolSize: number;
  expected: number;
  hottest: { name: string; count: number; ratio: number }[];
  coldest: { name: string; count: number; ratio: number }[];
  chiSquared: number;
  // Approx 99% threshold for chi-squared with (k-1) dof.
  // chi^2_{0.99, k-1} ≈ (k-1) + 3.29 * sqrt(2*(k-1))
  threshold99: number;
}

function analyze(
  tasks: readonly Task[],
  regions: ReadonlySet<Region>,
  completed: ReadonlySet<number>,
): TierStats[] {
  const buckets = eligibleByTier(tasks, regions, completed);
  const counts = new Map<number, number>();

  for (let i = 0; i < ITERATIONS; i++) {
    const result = rollOnePerTier(tasks, regions, completed);
    for (const tier of TIERS) {
      const id = result[tier];
      if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const stats: TierStats[] = [];

  for (const tier of TIERS) {
    const pool = buckets[tier];
    if (pool.length === 0) continue;
    const expected = ITERATIONS / pool.length;

    const rows = pool.map((t) => {
      const count = counts.get(t.id) ?? 0;
      return { name: t.name, count, ratio: count / expected };
    });

    rows.sort((a, b) => b.count - a.count);
    const hottest = rows.slice(0, 5);
    const coldest = rows.slice(-5).reverse();

    const chiSquared = rows.reduce(
      (sum, r) => sum + ((r.count - expected) ** 2) / expected,
      0,
    );
    const dof = pool.length - 1;
    const threshold99 = dof + 3.29 * Math.sqrt(2 * dof);

    stats.push({
      tier,
      poolSize: pool.length,
      expected,
      hottest,
      coldest,
      chiSquared,
      threshold99,
    });
  }

  return stats;
}

function format(stats: TierStats[]): string {
  const lines: string[] = [];
  lines.push(`\nRandomizer distribution — ${ITERATIONS.toLocaleString()} rolls per tier`);
  lines.push('='.repeat(72));
  for (const s of stats) {
    lines.push(
      `\n[${s.tier.toUpperCase()}]  pool=${s.poolSize}  expected=${s.expected.toFixed(1)}/task  ` +
        `chi²=${s.chiSquared.toFixed(1)} (99% bound ≈ ${s.threshold99.toFixed(1)})  ` +
        (s.chiSquared <= s.threshold99 ? 'OK' : '*** SKEW ***'),
    );
    lines.push(`  Hottest:`);
    for (const r of s.hottest) {
      lines.push(`    ${r.count.toString().padStart(5)}  (×${r.ratio.toFixed(2)})  ${r.name}`);
    }
    lines.push(`  Coldest:`);
    for (const r of s.coldest) {
      lines.push(`    ${r.count.toString().padStart(5)}  (×${r.ratio.toFixed(2)})  ${r.name}`);
    }
  }
  return lines.join('\n');
}

describe('randomizer distribution', () => {
  it('produces uniform per-tier picks (all regions, no completions)', () => {
    const stats = analyze(TASKS, REGIONS_ALL, COMPLETED_NONE);
    console.log(format(stats));
    for (const s of stats) {
      // 99% bound: under H0 (true uniform) this fails ~1% of the time.
      // Generous enough not to be flaky, tight enough to catch real bias.
      expect(s.chiSquared, `${s.tier} chi-squared exceeded 99% bound`).toBeLessThan(s.threshold99);
    }
  });
});
