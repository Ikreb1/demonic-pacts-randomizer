import { describe, it, expect } from 'vitest';
import { rollNextPact, frontierWeightShares } from '../src/lib/pactsRandomizer';
import type { Pact } from '../src/types';
import pactsFile from '../src/data/pacts.json';

// Three branches, designed to exercise the weighting model:
//   - cap_close_*: capstone is 1 hop from root  (shorter path → higher weight)
//   - cap_far_*  : capstone is 2 hops from root (longer path → lower weight)
//   - mixed_*    : a minor side-branch alongside the path to a capstone
// Edges are undirected (planner-style), so prerequisites lists are symmetric.
const FIXTURE: readonly Pact[] = [
  { id: 'cap_close_root', name: 'Close root', kind: 'major', branch: 'close', prerequisites: ['cap_close'], effect: '' },
  { id: 'cap_close', name: 'Close capstone', kind: 'capstone', branch: 'close', prerequisites: ['cap_close_root'], effect: '' },

  { id: 'cap_far_root', name: 'Far root', kind: 'major', branch: 'far', prerequisites: ['cap_far_mid'], effect: '' },
  { id: 'cap_far_mid', name: 'Far mid', kind: 'major', branch: 'far', prerequisites: ['cap_far_root', 'cap_far'], effect: '' },
  { id: 'cap_far', name: 'Far capstone', kind: 'capstone', branch: 'far', prerequisites: ['cap_far_mid'], effect: '' },

  { id: 'mixed_root', name: 'Mixed root', kind: 'major', branch: 'mixed', prerequisites: ['mixed_minor', 'mixed_major'], effect: '' },
  { id: 'mixed_minor', name: 'Mixed minor', kind: 'minor', branch: 'mixed', prerequisites: ['mixed_root'], effect: '' },
  { id: 'mixed_major', name: 'Mixed major', kind: 'major', branch: 'mixed', prerequisites: ['mixed_root', 'mixed_cap'], effect: '' },
  { id: 'mixed_cap', name: 'Mixed capstone', kind: 'capstone', branch: 'mixed', prerequisites: ['mixed_major'], effect: '' },
];

describe('rollNextPact', () => {
  it('returns null when nothing is unlocked (no frontier yet)', () => {
    // Strict-frontier model: with empty unlocked, there's no adjacent node
    // to roll. The store is responsible for seeding the center node first.
    expect(rollNextPact(FIXTURE, new Set())).toBeNull();
  });

  it('returns null when the frontier is empty', () => {
    // Unlock both sides of the close branch — no neighbors left there, and
    // the other branches aren't reachable from this component.
    const unlocked = new Set(['cap_close_root', 'cap_close']);
    expect(rollNextPact(FIXTURE, unlocked)).toBeNull();
  });

  it('only picks nodes adjacent to something unlocked', () => {
    // Unlock cap_close_root → cap_close is the sole frontier node.
    const unlocked = new Set(['cap_close_root']);
    for (let i = 0; i < 30; i++) {
      const picked = rollNextPact(FIXTURE, unlocked, Math.random);
      expect(picked).toBe('cap_close');
    }
  });

  it('never picks a non-frontier node even when distant capstones beckon', () => {
    // Unlock mixed_root. The frontier is {mixed_minor, mixed_major}.
    // cap_close, cap_far etc. are NOT on the frontier and must never be
    // returned no matter how high their capstone-distance weight is.
    const unlocked = new Set(['mixed_root']);
    const allowed = new Set(['mixed_minor', 'mixed_major']);
    for (let i = 0; i < 200; i++) {
      const picked = rollNextPact(FIXTURE, unlocked, Math.random);
      expect(picked).not.toBeNull();
      expect(allowed.has(picked!)).toBe(true);
    }
  });

  it('downweights minor pacts vs non-minor pacts when both are on the frontier', () => {
    // Unlock mixed_root → mixed_minor (minor) and mixed_major (major)
    // both eligible. Major should win heavily: not minor, AND on the
    // capstone path.
    const unlocked = new Set(['mixed_root']);
    let majorCount = 0;
    let minorCount = 0;
    for (let i = 0; i < 400; i++) {
      const picked = rollNextPact(FIXTURE, unlocked, Math.random);
      if (picked === 'mixed_major') majorCount++;
      if (picked === 'mixed_minor') minorCount++;
    }
    expect(majorCount).toBeGreaterThan(minorCount * 2);
  });

  it('boosts majors adjacent to the centre node beyond the minor-downweight delta', () => {
    // Synthetic graph: a centre at (0,0), an adjacent major (boost-eligible)
    // and an adjacent minor. Both lead to a 1-hop capstone via separate
    // branches so their capstone-distance weights are equal — any deviation
    // beyond the 2× ratio implied by MINOR_WEIGHT_MULT alone must come from
    // the FIRST_MAJOR_BOOST.
    const fixture: Pact[] = [
      { id: 'centre', name: 'centre', kind: 'major', branch: 'c', prerequisites: ['boost_major', 'plain_minor'], effect: '', x: 0, y: 0 },
      { id: 'boost_major', name: 'boost', kind: 'major', branch: 'b', prerequisites: ['centre', 'b_cap'], effect: '' },
      { id: 'b_cap', name: 'b cap', kind: 'capstone', branch: 'b', prerequisites: ['boost_major'], effect: '' },
      { id: 'plain_minor', name: 'minor', kind: 'minor', branch: 'm', prerequisites: ['centre', 'm_cap'], effect: '' },
      { id: 'm_cap', name: 'm cap', kind: 'capstone', branch: 'm', prerequisites: ['plain_minor'], effect: '' },
    ];
    let majorCount = 0;
    let minorCount = 0;
    for (let i = 0; i < 800; i++) {
      const picked = rollNextPact(fixture, new Set(['centre']), Math.random);
      if (picked === 'boost_major') majorCount++;
      if (picked === 'plain_minor') minorCount++;
    }
    // Without boost the ratio would be 2× (minor downweight only). With a
    // 3× boost on the major the expected ratio is 6×; assert > 4× to leave
    // headroom for Math.random jitter at 800 trials.
    expect(majorCount).toBeGreaterThan(minorCount * 4);
  });

  it('falls back to uniform when no capstone is reachable from the frontier', () => {
    // Synthetic fixture: one unlocked seed plus two adjacent dead-end nodes,
    // no capstones at all. Weights collapse to 0 → uniform fallback picks
    // one of the two arbitrarily, never returns null.
    const flat: Pact[] = [
      { id: 'seed', name: 'seed', kind: 'major', branch: 'x', prerequisites: ['x', 'y'], effect: '' },
      { id: 'x', name: 'x', kind: 'major', branch: 'x', prerequisites: ['seed'], effect: '' },
      { id: 'y', name: 'y', kind: 'major', branch: 'x', prerequisites: ['seed'], effect: '' },
    ];
    const picked = rollNextPact(flat, new Set(['seed']), () => 0.1);
    expect(['x', 'y']).toContain(picked);
  });
});

// Behavioural test against the real 132-node planner graph: the random
// walk should explore multiple sides of the tree across runs, not commit
// to a single quadrant and stay there. This is what the user observed
// breaking when nearby capstones still pulled the walk after they were
// already unlocked.
describe('rollNextPact — full-run regional spread', () => {
  const ALL_PACTS = (pactsFile as { pacts: Pact[] }).pacts;
  const CENTER_ID = ALL_PACTS.find((p) => (p.x ?? 0) === 0 && (p.y ?? 0) === 0)?.id ?? ALL_PACTS[0].id;
  const CAPSTONES = ALL_PACTS.filter((p) => p.kind === 'capstone');

  // Partition capstones by quadrant. The planner centres at (0,0); the
  // tree has a clear three-region split: upper-left magic / upper-right
  // ranged / lower melee.
  function regionOf(p: Pact): 'upper-left' | 'upper-right' | 'lower' {
    if ((p.y ?? 0) > 0) return 'lower';
    return (p.x ?? 0) < 0 ? 'upper-left' : 'upper-right';
  }
  const REGION_BY_CAPSTONE = new Map(CAPSTONES.map((c) => [c.id, regionOf(c)] as const));

  // Run a single 40-roll game and report which capstones were hit.
  function runOnce(): Set<string> {
    const unlocked = new Set<string>([CENTER_ID]);
    for (let i = 0; i < 39; i++) {
      const picked = rollNextPact(ALL_PACTS, unlocked, Math.random);
      if (!picked) break;
      unlocked.add(picked);
    }
    const capsHit = new Set<string>();
    for (const id of unlocked) {
      if (REGION_BY_CAPSTONE.has(id)) capsHit.add(id);
    }
    return capsHit;
  }

  it('the first roll from the centre is biased toward the first-ring majors', () => {
    // The first-ring minors are closer to nearby capstones than the
    // first-ring majors (distance 6 vs 7–8), which gives them a non-trivial
    // raw weight. Without boost the major share is ~50%; with 3× boost it
    // climbs to ~75%. Assert > 65% to comfortably clear the unboosted
    // baseline while leaving headroom for Math.random jitter at 400 trials.
    const firstRingMajors = new Set(
      ALL_PACTS.filter((p) => p.kind === 'major' && p.prerequisites.includes(CENTER_ID)).map((p) => p.id),
    );
    expect(firstRingMajors.size).toBeGreaterThan(0);
    const trials = 400;
    let majorPicks = 0;
    for (let t = 0; t < trials; t++) {
      const picked = rollNextPact(ALL_PACTS, new Set([CENTER_ID]), Math.random);
      if (picked && firstRingMajors.has(picked)) majorPicks++;
    }
    expect(majorPicks / trials).toBeGreaterThan(0.65);
  });

  it('the planner has capstones in all three regions (sanity)', () => {
    const counts = { 'upper-left': 0, 'upper-right': 0, lower: 0 };
    for (const c of CAPSTONES) counts[regionOf(c)]++;
    expect(counts['upper-left']).toBeGreaterThan(0);
    expect(counts['upper-right']).toBeGreaterThan(0);
    expect(counts.lower).toBeGreaterThan(0);
  });

  // Aggregated stats from many runs — the assertions are property checks,
  // not exact counts, so they tolerate Math.random variation.
  function aggregate(trials: number) {
    const regionsHitDistribution = [0, 0, 0, 0]; // index = # regions hit in run
    const everReachedRegions = new Set<string>();
    let totalCaps = 0;
    for (let t = 0; t < trials; t++) {
      const caps = runOnce();
      const regions = new Set<string>();
      for (const id of caps) {
        const r = REGION_BY_CAPSTONE.get(id);
        if (r) {
          regions.add(r);
          everReachedRegions.add(r);
        }
      }
      regionsHitDistribution[regions.size]++;
      totalCaps += caps.size;
    }
    return {
      regionsHitDistribution,
      everReachedRegions,
      avgCapsPerRun: totalCaps / trials,
    };
  }

  it('reaches capstones in every region across many runs', () => {
    // Across 200 runs, every region should produce at least one capstone
    // hit. Failing this means the walk is geographically biased and never
    // tries some part of the tree.
    const { everReachedRegions } = aggregate(200);
    expect(everReachedRegions.has('upper-left')).toBe(true);
    expect(everReachedRegions.has('upper-right')).toBe(true);
    expect(everReachedRegions.has('lower')).toBe(true);
  });

  it('the majority of runs visit capstones in at least two regions', () => {
    // The user's complaint: "once it has committed to either left right
    // or down it never tries to get to capstones on the other sides".
    // We expect comfortably > 50% of runs to break out and hit ≥ 2
    // regions. With the current weights (skip-unlocked-capstones, BASE
    // ~0.45) we measure ~70%; the assertion is set generously to absorb
    // Math.random jitter.
    const trials = 200;
    const { regionsHitDistribution } = aggregate(trials);
    const multiRegionRuns =
      regionsHitDistribution[2] + regionsHitDistribution[3];
    expect(multiRegionRuns).toBeGreaterThan(trials * 0.5);
  });

  it('a non-trivial share of runs reach all three regions', () => {
    // Stronger property: at least some runs spread fully across the
    // tree. With the current model this happens in the low single
    // digits of percent — the threshold is set very low so the test
    // primarily catches a regression to "always one region".
    const trials = 400;
    const { regionsHitDistribution } = aggregate(trials);
    expect(regionsHitDistribution[3]).toBeGreaterThan(trials * 0.01);
  });

  it('a meaningful number of capstones are reached per run on average', () => {
    // Sanity that the walk progresses outward at all. With a 40-roll
    // budget and the closest capstone 7 hops from the centre, anything
    // less than ~2 capstones per run on average means the walk is
    // wandering uselessly.
    const { avgCapsPerRun } = aggregate(200);
    expect(avgCapsPerRun).toBeGreaterThan(2);
  });

  // Per-side saturation — the metric that actually matters. The planner
  // has 4 upper-left + 4 upper-right + 6 lower capstones, so individual
  // hit-rate equality is misleading: the bottom side genuinely *contains*
  // more goal nodes. What matters is whether each side gets a fair share
  // of attention relative to its size, i.e. each side's average fraction
  // of capstones unlocked per run should land in roughly the same band.
  it('each side reaches comparable saturation per run', () => {
    const trials = 400;
    const sideHits = { 'upper-left': 0, 'upper-right': 0, lower: 0 };
    const sideCapstoneCount = { 'upper-left': 0, 'upper-right': 0, lower: 0 };
    for (const c of CAPSTONES) sideCapstoneCount[regionOf(c)]++;
    for (let t = 0; t < trials; t++) {
      const caps = runOnce();
      for (const id of caps) {
        const r = REGION_BY_CAPSTONE.get(id);
        if (r) sideHits[r]++;
      }
    }
    // Saturation = avg fraction of side's capstones unlocked per run.
    const saturation = {
      'upper-left': sideHits['upper-left'] / (sideCapstoneCount['upper-left'] * trials),
      'upper-right': sideHits['upper-right'] / (sideCapstoneCount['upper-right'] * trials),
      lower: sideHits.lower / (sideCapstoneCount.lower * trials),
    };
    const sats = Object.values(saturation);
    const minSat = Math.min(...sats);
    const maxSat = Math.max(...sats);
    // Every side should reach at least 15% saturation per run. With the
    // current model all three sit around 30%; 15% catches a regression
    // where one side becomes geometrically starved.
    expect(minSat).toBeGreaterThan(0.15);
    // The three sides should be within ~1.5× of each other in average
    // saturation. Empirically we measure ~1.05× (basically flat); 1.5×
    // is a generous ceiling for Math.random jitter at 400 trials.
    expect(maxSat / minSat).toBeLessThan(1.5);
  });
});

describe('frontierWeightShares', () => {
  it('returns an empty map when nothing is unlocked (no frontier)', () => {
    const all = (pactsFile as { pacts: Pact[] }).pacts;
    expect(frontierWeightShares(all, new Set()).size).toBe(0);
  });

  it('returns an empty map when every node is unlocked (no frontier)', () => {
    const all = (pactsFile as { pacts: Pact[] }).pacts;
    const allIds = new Set(all.map((p) => p.id));
    expect(frontierWeightShares(all, allIds).size).toBe(0);
  });

  it('shares sum to ≈ 1.0 and only frontier nodes appear', () => {
    const all = (pactsFile as { pacts: Pact[] }).pacts;
    const center = all.find((p) => (p.x ?? 0) === 0 && (p.y ?? 0) === 0)!;
    const unlocked = new Set([center.id]);
    const shares = frontierWeightShares(all, unlocked);
    // Every entry must be a frontier node — not unlocked, and adjacent to
    // something that is.
    for (const id of shares.keys()) {
      expect(unlocked.has(id)).toBe(false);
      const p = all.find((x) => x.id === id)!;
      expect(p.prerequisites.some((req) => unlocked.has(req))).toBe(true);
    }
    const total = [...shares.values()].reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
  });

  it('floors first-ring major shares at ≥ 20% on the real graph mid-walk', () => {
    // Simulate a mid-game state: center + one full melee-branch walk
    // (so root majors for ranged/magic are still on the frontier but
    // compete against deep-branch nodes that are much closer to a
    // capstone). The 3× boost alone leaves the surviving root majors at
    // ~1% share — the floor must bump each to at least 20%.
    const all = (pactsFile as { pacts: Pact[] }).pacts;
    const center = all.find((p) => (p.x ?? 0) === 0 && (p.y ?? 0) === 0)!;
    const meleeRoot = all.find((p) => p.id === 'node74')!;
    // Walk the melee branch out 5 hops to push frontier weight toward it.
    const unlocked = new Set<string>([center.id, meleeRoot.id]);
    let edge = meleeRoot.id;
    for (let i = 0; i < 5; i++) {
      const next = all.find(
        (p) =>
          !unlocked.has(p.id) &&
          p.prerequisites.includes(edge) &&
          p.kind !== 'minor' &&
          (p.x ?? 0) > 0,
      );
      if (!next) break;
      unlocked.add(next.id);
      edge = next.id;
    }
    const shares = frontierWeightShares(all, unlocked);
    // The two remaining first-ring majors (ranged + magic) should each
    // hold at least the floor share.
    expect(shares.get('node2')).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(shares.get('node44')).toBeGreaterThanOrEqual(0.2 - 1e-9);
  });
});
