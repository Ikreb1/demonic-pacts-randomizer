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
// Minimum share each first-ring major must hold on the frontier. The 3×
// boost alone gets swamped once the walk has gone deep into a branch
// (deep majors are much closer to capstones, so their raw weight
// dwarfs the still-on-frontier root majors). The floor guarantees each
// root has at least this much pick-probability until it's unlocked.
const FIRST_MAJOR_MIN_SHARE = 0.2;

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
  const { frontier, weights } = computeFrontierWeights(pacts, unlocked);
  if (frontier.length === 0) return null;
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < frontier.length; i++) {
    r -= weights[i];
    if (r <= 0) return frontier[i].id;
  }
  return frontier[frontier.length - 1].id;
}

/**
 * Diagnostic helper: returns the normalized weight share each frontier node
 * would contribute to a roll right now. Uses the same weighting (boost +
 * floor) as rollNextPact so the displayed numbers match real pick odds.
 * Returns an empty map when there's no frontier.
 */
export function frontierWeightShares(
  pacts: readonly Pact[],
  unlocked: ReadonlySet<string>,
): Map<string, number> {
  const { frontier, weights } = computeFrontierWeights(pacts, unlocked);
  if (frontier.length === 0) return new Map();
  const total = weights.reduce((a, b) => a + b, 0);
  return new Map(frontier.map((p, i) => [p.id, weights[i] / total]));
}

// Shared weight pipeline used by both the picker and the dev overlay.
//   1. Compute raw weights (capstone-pull × minor downweight × first-major boost).
//   2. Uniform fallback when no capstone is reachable.
//   3. Floor first-ring majors so each holds at least FIRST_MAJOR_MIN_SHARE
//      until it's unlocked — the boost alone gets swamped once the walk has
//      gone deep into a branch, leaving root majors at ~1% share.
// Returns the frontier in array form alongside parallel weights ready to be
// summed/normalized by the caller.
function computeFrontierWeights(
  pacts: readonly Pact[],
  unlocked: ReadonlySet<string>,
): { frontier: Pact[]; weights: number[] } {
  const frontier = pacts.filter(
    (p) => !unlocked.has(p.id) && p.prerequisites.some((req) => unlocked.has(req)),
  );
  if (frontier.length === 0) return { frontier, weights: [] };
  // Only un-claimed capstones contribute to the pull. Once a capstone is
  // unlocked, its gravity vanishes — otherwise the walk would stay glued
  // to the branch it just finished, since that branch's frontier remains
  // closest to the (now-redundant) capstone you already reached.
  const capstoneIds = new Set(
    pacts.filter((p) => p.kind === 'capstone' && !unlocked.has(p.id)).map((p) => p.id),
  );
  const remoteness = capstoneRemoteness(pacts);
  const firstMajors = firstMajorIds(pacts);
  const raw = frontier.map((p) => weightFor(p, pacts, capstoneIds, remoteness, firstMajors));
  const totalRaw = raw.reduce((a, b) => a + b, 0);
  // No capstone reachable from anywhere on the frontier → fall back to a
  // uniform distribution so a roll never silently fails.
  const weights = totalRaw > 0 ? raw : frontier.map(() => 1);
  return applyFirstMajorFloor(frontier, weights, firstMajors);
}

// Guarantee each on-frontier first-ring major holds at least
// FIRST_MAJOR_MIN_SHARE of the total weight. Solves for the floored weight
// Wf such that Wf / (Wf*k + Σnon-floored) = FIRST_MAJOR_MIN_SHARE, i.e.
// Wf = MIN * Σnon-floored / (1 − k*MIN). Only majors whose raw share is
// already below the floor get bumped; majors above the floor are left
// alone.
function applyFirstMajorFloor(
  frontier: Pact[],
  weights: number[],
  firstMajors: ReadonlySet<string>,
): { frontier: Pact[]; weights: number[] } {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return { frontier, weights };
  // Iterate: bumping one floored major reduces every other node's share,
  // which can push a previously-OK major below the floor. Re-check until
  // stable. Bounded by the number of first majors on the frontier (≤ 3
  // in the real graph), so this converges in a couple of passes.
  for (let pass = 0; pass < frontier.length; pass++) {
    const flooredIdx: number[] = [];
    let nonFlooredSum = 0;
    let runningTotal = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < frontier.length; i++) {
      if (firstMajors.has(frontier[i].id) && weights[i] / runningTotal < FIRST_MAJOR_MIN_SHARE) {
        flooredIdx.push(i);
      } else {
        nonFlooredSum += weights[i];
      }
    }
    if (flooredIdx.length === 0) return { frontier, weights };
    const k = flooredIdx.length;
    const denom = 1 - k * FIRST_MAJOR_MIN_SHARE;
    if (denom <= 0 || nonFlooredSum === 0) {
      // Edge case: every frontier slot wants the floor. Distribute the
      // floored share evenly; the non-floored set is empty so there's
      // nothing to scale against.
      const per = 1 / k;
      for (const idx of flooredIdx) weights[idx] = per;
      return { frontier, weights };
    }
    const wf = (FIRST_MAJOR_MIN_SHARE * nonFlooredSum) / denom;
    let changed = false;
    for (const idx of flooredIdx) {
      if (weights[idx] !== wf) {
        weights[idx] = wf;
        changed = true;
      }
    }
    if (!changed) return { frontier, weights };
  }
  return { frontier, weights };
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
