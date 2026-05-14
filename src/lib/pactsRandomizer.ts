import type { Pact } from '../types';

const MINOR_WEIGHT_MULT = 0.5;
// Per-step decay applied to the distance-to-nearest-capstone. Tuned
// against the real planner graph (132 nodes, 14 capstones, nearest
// capstone is 7 hops from the center): 0.45 plus the geometry
// compensation below gets the average player ~4 capstones out of 14
// in a full 40-roll run, with every capstone enjoying roughly equal
// odds (per-capstone hit rate ~20–40%). Lower BASE pulls harder.
const CAPSTONE_DECAY_BASE = 0.45;
// Compensation for capstones that sit further from the centre than the
// closest ones. The planner has three capstone depths: 7 (upper corners),
// 8 (upper inner), 9 (lower row). Two-tier formula:
//   - REMOTENESS_UNIFORM applies linearly to every hop of remoteness, so
//     d=8 inner capstones get a small boost over the raw-distance favourite
//     (d=7 corners). Without this, d=8 was starved (~25%) because d=7
//     dominates on raw graph distance.
//   - REMOTENESS_DEEP_BONUS applies *additionally* beyond DEADBAND hops,
//     compensating the d=9 lower row whose deeper geometry the linear term
//     alone can't recover.
// Tuned against the real planner so all three depth bands land in roughly
// the 30–35% hit-rate range and side saturations sit within ~1.1× of
// each other.
const REMOTENESS_UNIFORM = 0.2;
const REMOTENESS_DEADBAND = 1;
const REMOTENESS_DEEP_BONUS = 0.6;
// Boost applied to major-tier pacts directly adjacent to the center node
// (the three combat-branch roots — melee, ranged, magic). Keeps the early
// game reliably opening a combat direction before drifting into first-ring
// minors. 3× shifts the first-pick share of those majors from ~67% to ~86%
// without forcing a deterministic opening.
const FIRST_MAJOR_BOOST = 3;

/**
 * Pick the next pact to unlock, weighted toward nodes that lead to a
 * capstone. Eligibility is strict: only nodes adjacent to something
 * already unlocked can be rolled. Returns null when the frontier is empty.
 *
 * Weight is driven by the *nearest* reachable capstone (not the sum
 * across all capstones — summing rewards central-but-far nodes over
 * truly capstone-adjacent ones, which is the opposite of what we want).
 * Distance is undirected BFS along the planner's adjacency. Minor pacts
 * are downweighted by MINOR_WEIGHT_MULT.
 */
export function rollNextPact(
  pacts: readonly Pact[],
  unlocked: ReadonlySet<string>,
  rng: () => number = Math.random,
): string | null {
  const frontier = pacts.filter(
    (p) => !unlocked.has(p.id) && p.prerequisites.some((req) => unlocked.has(req)),
  );
  if (frontier.length === 0) return null;

  // Only un-claimed capstones contribute to the pull. Once a capstone is
  // unlocked, its gravity vanishes — otherwise the walk would stay glued
  // to the branch it just finished, since that branch's frontier remains
  // closest to the (now-redundant) capstone you already reached. Removing
  // hit capstones from the candidate set lets unvisited capstones in
  // other directions take over the weighting.
  const capstoneIds = new Set(
    pacts.filter((p) => p.kind === 'capstone' && !unlocked.has(p.id)).map((p) => p.id),
  );
  // Per-capstone "remoteness" — how many hops further from the centre this
  // capstone sits than the nearest one. Used to give geometrically distant
  // capstones (e.g. the planner's bottom row at 9 hops vs. top at 7) a
  // virtual head-start so the walk visits them at comparable rates.
  const remoteness = capstoneRemoteness(pacts);
  const firstMajors = firstMajorIds(pacts);
  const weights = frontier.map((p) => weightFor(p, pacts, capstoneIds, remoteness, firstMajors));
  const totalRaw = weights.reduce((a, b) => a + b, 0);
  // Defensive fallback: if every frontier candidate weights 0 (e.g. no
  // capstones reachable from anywhere on the frontier), fall back to a
  // uniform pick so a roll never silently fails.
  const finalWeights = totalRaw > 0 ? weights : frontier.map(() => 1);
  const total = finalWeights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < frontier.length; i++) {
    r -= finalWeights[i];
    if (r <= 0) return frontier[i].id;
  }
  return frontier[frontier.length - 1].id;
}

function weightFor(
  p: Pact,
  pacts: readonly Pact[],
  capstoneIds: ReadonlySet<string>,
  remoteness: ReadonlyMap<string, number>,
  firstMajors: ReadonlySet<string>,
): number {
  // Effective distance to each unclaimed capstone, with the planner's
  // geometric inequality smoothed out: capstones that sit further from
  // the centre than the nearest one get a virtual head-start so they
  // can compete on the weighting. We then take the highest score across
  // all capstones (equivalent to picking the one with the smallest
  // effective distance).
  const distances = forwardDistancesFrom(p.id, pacts);
  let bestScore = 0;
  for (const [id, d] of distances) {
    if (!capstoneIds.has(id)) continue;
    const rem = remoteness.get(id) ?? 0;
    const compensation =
      rem * REMOTENESS_UNIFORM +
      Math.max(0, rem - REMOTENESS_DEADBAND) * REMOTENESS_DEEP_BONUS;
    const effective = Math.max(0, d - compensation);
    const score = Math.pow(CAPSTONE_DECAY_BASE, effective);
    if (score > bestScore) bestScore = score;
  }
  if (bestScore === 0) return 0;
  if (p.kind === 'minor') bestScore *= MINOR_WEIGHT_MULT;
  if (firstMajors.has(p.id)) bestScore *= FIRST_MAJOR_BOOST;
  return bestScore;
}

// Per-capstone "remoteness from the centre", expressed as hops further
// from the centre than the nearest capstone. The closest capstone(s) get
// 0; a capstone two hops further out gets 2. Cached per `pacts` reference.
const REMOTENESS_CACHE = new WeakMap<readonly Pact[], Map<string, number>>();

function capstoneRemoteness(pacts: readonly Pact[]): Map<string, number> {
  const cached = REMOTENESS_CACHE.get(pacts);
  if (cached) return cached;
  const center = pacts.find((p) => (p.x ?? 0) === 0 && (p.y ?? 0) === 0) ?? pacts[0];
  const out = new Map<string, number>();
  if (!center) {
    REMOTENESS_CACHE.set(pacts, out);
    return out;
  }
  const distFromCenter = forwardDistancesFrom(center.id, pacts);
  let minCenterDist = Infinity;
  for (const p of pacts) {
    if (p.kind !== 'capstone') continue;
    const d = distFromCenter.get(p.id);
    if (d !== undefined && d < minCenterDist) minCenterDist = d;
  }
  if (!Number.isFinite(minCenterDist)) {
    REMOTENESS_CACHE.set(pacts, out);
    return out;
  }
  for (const p of pacts) {
    if (p.kind !== 'capstone') continue;
    const d = distFromCenter.get(p.id);
    if (d === undefined) continue;
    out.set(p.id, d - minCenterDist);
  }
  REMOTENESS_CACHE.set(pacts, out);
  return out;
}

// Major-tier pacts adjacent to the centre node — the "first" combat-branch
// roots that earn FIRST_MAJOR_BOOST whenever they're on the frontier.
// Today these are node2 (ranged), node44 (magic), node74 (melee), but the
// detection is purely structural so the boost survives a data regen.
const FIRST_MAJORS_CACHE = new WeakMap<readonly Pact[], Set<string>>();

function firstMajorIds(pacts: readonly Pact[]): Set<string> {
  const cached = FIRST_MAJORS_CACHE.get(pacts);
  if (cached) return cached;
  const center = pacts.find((p) => (p.x ?? 0) === 0 && (p.y ?? 0) === 0) ?? pacts[0];
  const out = new Set<string>();
  if (!center) {
    FIRST_MAJORS_CACHE.set(pacts, out);
    return out;
  }
  for (const p of pacts) {
    if (p.kind !== 'major') continue;
    if (p.prerequisites.includes(center.id)) out.add(p.id);
  }
  FIRST_MAJORS_CACHE.set(pacts, out);
  return out;
}

// Undirected BFS from `start` along the prereq adjacency list. Returns a
// map of reachable pact id → shortest distance (start itself is at 0).
function forwardDistancesFrom(start: string, pacts: readonly Pact[]): Map<string, number> {
  const adjacency = adjacencyMap(pacts);
  const out = new Map<string, number>();
  out.set(start, 0);
  const queue: string[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = out.get(cur)!;
    const next = adjacency.get(cur) ?? [];
    for (const n of next) {
      if (out.has(n)) continue;
      out.set(n, d + 1);
      queue.push(n);
    }
  }
  return out;
}

const ADJACENCY_CACHE = new WeakMap<readonly Pact[], Map<string, string[]>>();

function adjacencyMap(pacts: readonly Pact[]): Map<string, string[]> {
  const cached = ADJACENCY_CACHE.get(pacts);
  if (cached) return cached;
  const m = new Map<string, string[]>();
  for (const p of pacts) {
    m.set(p.id, [...p.prerequisites]);
  }
  ADJACENCY_CACHE.set(pacts, m);
  return m;
}
