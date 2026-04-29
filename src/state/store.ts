import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Region, Task, Tier, Relic, RelicTier } from '../types';
import type { PlayerLevels } from '../lib/eligibility';
import {
  ALWAYS_UNLOCKED,
  TIERS,
  TIER_POINTS,
  REGION_UNLOCK_THRESHOLDS,
  FIRST_FORCED_REGION,
  RELIC_TIERS,
  RELIC_TIER_THRESHOLDS,
} from '../types';
import type { RollResult } from '../lib/randomizer';
import { rollOnePerTier } from '../lib/randomizer';
import { eligibleByTier } from '../lib/filters';
import tasksFile from '../data/tasks.json';
import relicsFile from '../data/relics.json';

const ALL_TASKS: readonly Task[] = (tasksFile as { tasks: Task[] }).tasks;
const ALL_RELICS: readonly Relic[] = (relicsFile as { relics: Relic[] }).relics;

export interface SyncMeta {
  username: string;
  at: number;
  source: 'wikisync' | 'plugin';
}

interface PersistedState {
  unlockedRegions: Region[];
  manualComplete: number[];
  syncedComplete: number[];
  lastSync: SyncMeta | null;
  activeTask: number | null;
  currentRoll: RollResult | null;
  proxyBaseUrl: string;
  score: number;
  recentUsernames: string[];
  lockedRelics: Record<RelicTier, string | null>;
  bonusRelics: Array<{ tier: RelicTier; name: string }>;
  // Player skill levels from WikiSync, used to gate task eligibility.
  // Empty until the user runs WikiSync at least once.
  playerLevels: PlayerLevels;
  schemaVersion: number;
}

interface StoreState extends PersistedState {
  // Runtime-only counter for dev/test buttons. Adds to pending region picks
  // without touching completion counts. Cleared on reload.
  devExtraPendingRegions: number;
  unlockRegion: (region: Region, viaRandom?: boolean) => void;
  toggleManualComplete: (taskId: number) => void;
  applySync: (completedIds: number[], meta: SyncMeta, levels?: PlayerLevels) => void;
  clearSync: () => void;
  setProxyBaseUrl: (url: string) => void;
  rememberUsername: (name: string) => void;
  forgetUsername: (name: string) => void;
  roll: () => void;
  pickTier: (tier: Tier) => void;
  markActiveComplete: () => void;
  abandonActive: () => void;
  lockRelic: (tier: RelicTier, name: string, viaRandom?: boolean) => void;
  lockReloadedRelic: (tier: RelicTier, name: string, viaRandom?: boolean) => void;
  devQueueRegionPick: () => void;
  resetAll: () => void;
}

const SCHEMA_VERSION = 6;
const DEFAULT_PROXY_BASE_URL = 'https://dpl-wikisync-proxy.breki.workers.dev';
const RECENT_USERNAMES_MAX = 5;
export const RANDOM_REGION_BONUS = 500;
export const RANDOM_RELIC_BONUS = 500;

const EMPTY_LOCKED_RELICS: Record<RelicTier, string | null> = {
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
  7: null,
  8: null,
};

const initialPersisted: PersistedState = {
  unlockedRegions: [...ALWAYS_UNLOCKED],
  manualComplete: [],
  syncedComplete: [],
  lastSync: null,
  activeTask: null,
  currentRoll: null,
  proxyBaseUrl: DEFAULT_PROXY_BASE_URL,
  score: 0,
  recentUsernames: [],
  lockedRelics: { ...EMPTY_LOCKED_RELICS },
  bonusRelics: [],
  playerLevels: {},
  schemaVersion: SCHEMA_VERSION,
};

function dedupeRegions(regions: readonly Region[]): Region[] {
  const set = new Set<Region>(regions);
  for (const r of ALWAYS_UNLOCKED) set.add(r);
  return [...set];
}

// Returns true iff the given completion count grants more region picks than
// the user has currently used (i.e. a modal would be open or about to open).
function pendingPicksFor(completedCount: number, unlockedRegionCount: number): boolean {
  const earned = REGION_UNLOCK_THRESHOLDS.filter((t) => completedCount >= t).length;
  const used = unlockedRegionCount - ALWAYS_UNLOCKED.length;
  return earned > used;
}

// Multiplier for completing a task at `tier` while lower-tier tasks remain
// uncompleted within unlocked regions. Range: 1.0× (no lowers, or all lowers
// already done) to 2.0× (all lowers still untouched). Encourages doing
// harder tasks early. Easy tasks are always 1.0× (no lower tiers exist).
function computeEarlyTierMultiplier(
  tier: Tier,
  completed: ReadonlySet<number>,
  unlockedRegions: readonly Region[],
): number {
  const tierIdx = TIERS.indexOf(tier);
  if (tierIdx <= 0) return 1;
  const lowerTiers = new Set<Tier>(TIERS.slice(0, tierIdx));
  const regions = new Set<Region>(unlockedRegions);
  let total = 0;
  let remaining = 0;
  for (const t of ALL_TASKS) {
    if (!lowerTiers.has(t.tier)) continue;
    if (!regions.has(t.region)) continue;
    total++;
    if (!completed.has(t.id)) remaining++;
  }
  if (total === 0) return 1;
  return 1 + remaining / total;
}

// Re-sample only the tier slots whose current task is no longer eligible
// (because it was completed externally, the region was disabled, etc.).
// Slots that are still valid stay put so the user doesn't lose a candidate
// they were considering.
function reconcileRoll(
  roll: RollResult | null,
  regions: ReadonlySet<Region>,
  completed: ReadonlySet<number>,
): RollResult | null {
  if (!roll) return null;
  const buckets = eligibleByTier(ALL_TASKS, regions, completed);
  let changed = false;
  const next: RollResult = { ...roll };
  for (const tier of TIERS) {
    const id = next[tier];
    const stillValid = id !== null && buckets[tier].some((t) => t.id === id);
    if (stillValid) continue;
    const pool = buckets[tier];
    next[tier] = pool.length === 0 ? null : pool[Math.floor(Math.random() * pool.length)].id;
    changed = true;
  }
  return changed ? next : roll;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...initialPersisted,
      devExtraPendingRegions: 0,

      unlockRegion: (region, viaRandom = false) => {
        if ((ALWAYS_UNLOCKED as readonly Region[]).includes(region)) return;
        const state = get();
        if (state.unlockedRegions.includes(region)) return;
        const completedSize = new Set([...state.manualComplete, ...state.syncedComplete]).size;
        const earned = REGION_UNLOCK_THRESHOLDS.filter((t) => completedSize >= t).length;
        const used = state.unlockedRegions.length - ALWAYS_UNLOCKED.length;
        const dev = state.devExtraPendingRegions;
        // Natural picks take priority; dev counter is only consumed once
        // earned slots are exhausted, so the test flow stacks on top of any
        // real pending picks instead of cancelling them.
        const consumeDev = used >= earned && dev > 0;
        if (used >= earned && !consumeDev) return;
        if (used === 0 && region !== FIRST_FORCED_REGION) return;
        set({
          unlockedRegions: dedupeRegions([...state.unlockedRegions, region]),
          score: state.score + (viaRandom ? RANDOM_REGION_BONUS : 0),
          devExtraPendingRegions: consumeDev ? dev - 1 : dev,
        });
      },

      toggleManualComplete: (taskId) => {
        const state = get();
        const cur = new Set(state.manualComplete);
        if (cur.has(taskId)) cur.delete(taskId);
        else cur.add(taskId);
        const nextManual = [...cur];
        const completed = new Set([...nextManual, ...state.syncedComplete]);
        const regions = new Set<Region>(state.unlockedRegions);
        // If this toggle just earned a region pick, drop the existing roll so
        // the post-pick auto-roll redraws from the expanded region pool.
        const willPend = pendingPicksFor(completed.size, state.unlockedRegions.length);
        const next: Partial<StoreState> = {
          manualComplete: nextManual,
          currentRoll: willPend ? null : reconcileRoll(state.currentRoll, regions, completed),
        };
        if (state.activeTask !== null && cur.has(state.activeTask)) {
          next.activeTask = null;
        }
        set(next);
      },

      applySync: (completedIds, meta, levels) => {
        const state = get();
        const nextSynced = [...new Set(completedIds)];
        const completed = new Set([...state.manualComplete, ...nextSynced]);
        // Trust the sync: if the user has completed tasks in a region, they
        // must have unlocked that region in-game. Auto-add it to our model
        // (one-way; we never lock a region back). Bypasses the
        // Karamja-first rule, which is only for the in-app modal flow.
        const detected = new Set<Region>();
        for (const id of completed) {
          const task = TASKS_BY_ID.get(id);
          if (!task) continue;
          if ((ALWAYS_UNLOCKED as readonly Region[]).includes(task.region)) continue;
          detected.add(task.region);
        }
        const nextUnlockedRegions = dedupeRegions([...state.unlockedRegions, ...detected]);
        const regions = new Set<Region>(nextUnlockedRegions);
        // Re-evaluate pending-picks against the new region count: any newly
        // auto-unlocked region consumes an earned slot.
        const willPend = pendingPicksFor(completed.size, nextUnlockedRegions.length);
        const next: Partial<StoreState> = {
          syncedComplete: nextSynced,
          lastSync: meta,
          unlockedRegions: nextUnlockedRegions,
          currentRoll: willPend ? null : reconcileRoll(state.currentRoll, regions, completed),
        };
        // Only overwrite stored levels when the caller passed them — a
        // plugin import has none, but a WikiSync fetch does.
        if (levels && Object.keys(levels).length > 0) next.playerLevels = levels;
        if (state.activeTask !== null && completed.has(state.activeTask)) {
          next.activeTask = null;
        }
        set(next);
      },

      clearSync: () => set({ syncedComplete: [], lastSync: null, playerLevels: {} }),

      setProxyBaseUrl: (url) => set({ proxyBaseUrl: url.trim() }),

      rememberUsername: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const current = get().recentUsernames ?? [];
        const next = [trimmed, ...current.filter((n) => n.toLowerCase() !== trimmed.toLowerCase())].slice(
          0,
          RECENT_USERNAMES_MAX,
        );
        set({ recentUsernames: next });
      },

      forgetUsername: (name) => {
        const trimmed = name.trim().toLowerCase();
        if (!trimmed) return;
        const current = get().recentUsernames ?? [];
        set({ recentUsernames: current.filter((n) => n.toLowerCase() !== trimmed) });
      },

      roll: () => {
        const { activeTask, unlockedRegions, manualComplete, syncedComplete } = get();
        if (activeTask !== null) return;
        const completed = new Set([...manualComplete, ...syncedComplete]);
        const regions = new Set<Region>(unlockedRegions);
        const result = rollOnePerTier(ALL_TASKS, regions, completed);
        set({ currentRoll: result });
      },

      pickTier: (tier) => {
        const { currentRoll, activeTask } = get();
        if (activeTask !== null) return;
        if (!currentRoll) return;
        const id = currentRoll[tier];
        if (id == null) return;
        set({ activeTask: id, currentRoll: null });
      },

      markActiveComplete: () => {
        const { activeTask, manualComplete, unlockedRegions, syncedComplete, score } = get();
        if (activeTask === null) return;
        const task = TASKS_BY_ID.get(activeTask);
        const newManual = [...new Set([...manualComplete, activeTask])];
        const completed = new Set([...newManual, ...syncedComplete]);
        const regions = new Set<Region>(unlockedRegions);
        // If this completion just earned a region pick, leave currentRoll
        // empty so the next roll draws from the post-pick region pool.
        // RandomizerTab re-rolls automatically once pendingPicks hits 0.
        const willPend = pendingPicksFor(completed.size, unlockedRegions.length);
        const result = willPend ? null : rollOnePerTier(ALL_TASKS, regions, completed);
        // Score this completion using the early-tier multiplier evaluated
        // against state BEFORE adding this task to the completed set, so
        // doing a hard task while lowers remain pays out the bonus.
        const completedBefore = new Set([...manualComplete, ...syncedComplete]);
        const earned = task
          ? Math.round(
              TIER_POINTS[task.tier] *
                computeEarlyTierMultiplier(task.tier, completedBefore, unlockedRegions),
            )
          : 0;
        set({
          manualComplete: newManual,
          activeTask: null,
          currentRoll: result,
          score: score + earned,
        });
      },

      abandonActive: () => {
        const { activeTask, unlockedRegions, manualComplete, syncedComplete, score } = get();
        if (activeTask === null) return;
        const task = TASKS_BY_ID.get(activeTask);
        const completed = new Set([...manualComplete, ...syncedComplete]);
        const regions = new Set<Region>(unlockedRegions);
        // Same gate as markActiveComplete: don't roll over a pending pick.
        const willPend = pendingPicksFor(completed.size, unlockedRegions.length);
        const result = willPend ? null : rollOnePerTier(ALL_TASKS, regions, completed);
        set({
          activeTask: null,
          currentRoll: result,
          score: score - (task ? 2 * TIER_POINTS[task.tier] : 0),
        });
      },

      lockRelic: (tier, name, viaRandom = false) => {
        const state = get();
        if (!RELIC_TIERS.includes(tier)) return;
        if (state.lockedRelics[tier] !== null) return;
        // Threshold gate: caller must have earned this tier via raw points.
        const earnedScore = computeRelicScore(state);
        if (earnedScore < RELIC_TIER_THRESHOLDS[tier]) return;
        // Name must match a relic in this tier.
        const exists = ALL_RELICS.some((r) => r.tier === tier && r.name === name);
        if (!exists) return;
        set({
          lockedRelics: { ...state.lockedRelics, [tier]: name },
          score: state.score + (viaRandom ? RANDOM_RELIC_BONUS : 0),
        });
      },

      lockReloadedRelic: (tier, name, viaRandom = false) => {
        const state = get();
        if (!RELIC_TIERS.includes(tier)) return;
        // Reloaded must be the locked Tier 7 primary, and only one bonus pick.
        if (state.lockedRelics[7] !== 'Reloaded') return;
        if ((state.bonusRelics ?? []).length > 0) return;
        // Bonus pick must come from a tier strictly below 7.
        if (tier >= 7) return;
        // Cannot be the same relic that is already locked at that tier.
        if (state.lockedRelics[tier] === name) return;
        // Cannot already be a bonus pick (defensive — guarded by length check above).
        if ((state.bonusRelics ?? []).some((b) => b.tier === tier && b.name === name)) return;
        // Name must match an actual relic in that tier.
        const exists = ALL_RELICS.some((r) => r.tier === tier && r.name === name);
        if (!exists) return;
        set({
          bonusRelics: [...(state.bonusRelics ?? []), { tier, name }],
          score: state.score + (viaRandom ? RANDOM_RELIC_BONUS : 0),
        });
      },

      devQueueRegionPick: () => {
        set({ devExtraPendingRegions: get().devExtraPendingRegions + 1 });
      },

      resetAll: () => {
        set({
          ...initialPersisted,
          lockedRelics: { ...EMPTY_LOCKED_RELICS },
          bonusRelics: [],
          playerLevels: {},
          devExtraPendingRegions: 0,
        });
      },
    }),
    {
      name: 'demonic-pacts-randomizer',
      storage: createJSONStorage(() => localStorage),
      version: SCHEMA_VERSION,
      partialize: (state): PersistedState => ({
        unlockedRegions: state.unlockedRegions,
        manualComplete: state.manualComplete,
        syncedComplete: state.syncedComplete,
        lastSync: state.lastSync,
        activeTask: state.activeTask,
        currentRoll: state.currentRoll,
        proxyBaseUrl: state.proxyBaseUrl,
        score: state.score,
        recentUsernames: state.recentUsernames,
        lockedRelics: state.lockedRelics,
        bonusRelics: state.bonusRelics,
        playerLevels: state.playerLevels,
        schemaVersion: state.schemaVersion,
      }),
      // Pre-release: any state persisted under an older schema is wiped.
      // The region-unlock model changed from free toggling to threshold-gated picks,
      // and stale flag-style toggles can't be safely interpreted under the new rules.
      migrate: (persisted: unknown) => {
        if (!persisted || typeof persisted !== 'object') return initialPersisted;
        const p = persisted as Partial<PersistedState>;
        if (p.schemaVersion === SCHEMA_VERSION) return { ...initialPersisted, ...p };
        return initialPersisted;
      },
    },
  ),
);

export const TASKS_BY_ID: ReadonlyMap<number, Task> = new Map(ALL_TASKS.map((t) => [t.id, t]));
export const ALL_TASKS_LIST: readonly Task[] = ALL_TASKS;

export function selectCompleted(state: StoreState): Set<number> {
  return new Set([...state.manualComplete, ...state.syncedComplete]);
}

export function selectActiveTask(state: StoreState): Task | null {
  if (state.activeTask === null) return null;
  return TASKS_BY_ID.get(state.activeTask) ?? null;
}

export function selectRollTasks(state: StoreState): Record<Tier, Task | null> {
  const out = {} as Record<Tier, Task | null>;
  for (const t of TIERS) {
    const id = state.currentRoll?.[t] ?? null;
    out[t] = id !== null ? TASKS_BY_ID.get(id) ?? null : null;
  }
  return out;
}

export function selectCompletedCount(state: StoreState): number {
  return new Set([...state.manualComplete, ...state.syncedComplete]).size;
}

// Score awarded for completing this task right now, with the early-tier
// multiplier applied. Lets cards preview what they'll earn before pickup.
export function selectTaskEarnedScore(task: Task, state: StoreState): number {
  const completed = new Set([...state.manualComplete, ...state.syncedComplete]);
  const mult = computeEarlyTierMultiplier(task.tier, completed, state.unlockedRegions);
  return Math.round(TIER_POINTS[task.tier] * mult);
}

export function selectTaskMultiplier(task: Task, state: StoreState): number {
  const completed = new Set([...state.manualComplete, ...state.syncedComplete]);
  return computeEarlyTierMultiplier(task.tier, completed, state.unlockedRegions);
}

export function selectEarnedRegionSlots(state: StoreState): number {
  const count = selectCompletedCount(state);
  return REGION_UNLOCK_THRESHOLDS.filter((t) => count >= t).length;
}

export function selectUsedRegionSlots(state: StoreState): number {
  return state.unlockedRegions.length - ALWAYS_UNLOCKED.length;
}

export function selectPendingRegionPicks(state: StoreState): number {
  const natural = Math.max(0, selectEarnedRegionSlots(state) - selectUsedRegionSlots(state));
  return natural + (state.devExtraPendingRegions ?? 0);
}

export function selectNextPickIsForcedKaramja(state: StoreState): boolean {
  return selectUsedRegionSlots(state) === 0 && selectPendingRegionPicks(state) > 0;
}

export function selectNextUnlockThreshold(state: StoreState): number | null {
  const used = selectUsedRegionSlots(state);
  return REGION_UNLOCK_THRESHOLDS[used] ?? null;
}

// ----- Relics -----

export const ALL_RELICS_LIST: readonly Relic[] = ALL_RELICS;

const RELICS_BY_TIER: Record<RelicTier, Relic[]> = (() => {
  const out = {} as Record<RelicTier, Relic[]>;
  for (const t of RELIC_TIERS) out[t] = [];
  for (const r of ALL_RELICS) out[r.tier].push(r);
  return out;
})();

export function relicsForTier(tier: RelicTier): readonly Relic[] {
  return RELICS_BY_TIER[tier] ?? [];
}

// Raw relic score = sum of TIER_POINTS over completed (manual ∪ synced) tasks.
// Distinct from `state.score` which carries the +/-2× competitive math.
function computeRelicScore(state: { manualComplete: number[]; syncedComplete: number[] }): number {
  const completed = new Set([...state.manualComplete, ...state.syncedComplete]);
  let total = 0;
  for (const id of completed) {
    const task = TASKS_BY_ID.get(id);
    if (task) total += TIER_POINTS[task.tier];
  }
  return total;
}

export function selectRelicScore(state: StoreState): number {
  return computeRelicScore(state);
}

export function selectEarnedRelicSlots(state: StoreState): number {
  const score = computeRelicScore(state);
  return RELIC_TIERS.filter((t) => score >= RELIC_TIER_THRESHOLDS[t]).length;
}

export function selectUsedRelicSlots(state: StoreState): number {
  return RELIC_TIERS.filter((t) => state.lockedRelics?.[t] != null).length;
}

export function selectPendingRelicPicks(state: StoreState): number {
  return Math.max(0, selectEarnedRelicSlots(state) - selectUsedRelicSlots(state));
}

// Lowest tier whose threshold is reached and which has no relic locked yet.
export function selectNextPendingRelicTier(state: StoreState): RelicTier | null {
  const score = computeRelicScore(state);
  for (const t of RELIC_TIERS) {
    if (score < RELIC_TIER_THRESHOLDS[t]) break;
    if (!state.lockedRelics?.[t]) return t;
  }
  return null;
}

export function selectLockedRelics(state: StoreState): Record<RelicTier, string | null> {
  return state.lockedRelics ?? { ...EMPTY_LOCKED_RELICS };
}

export function selectBonusRelics(
  state: StoreState,
): readonly { tier: RelicTier; name: string }[] {
  return state.bonusRelics ?? [];
}

// One pending Reloaded bonus pick exists when "Reloaded" is the locked Tier 7
// primary AND no bonus relic has been chosen yet.
export function selectPendingReloadedPicks(state: StoreState): 0 | 1 {
  const tier7 = state.lockedRelics?.[7];
  if (tier7 !== 'Reloaded') return 0;
  return (state.bonusRelics ?? []).length === 0 ? 1 : 0;
}

// All relics from tiers 1–6 the user could still pick as their Reloaded
// bonus: not the locked primary at that tier, not already a bonus pick.
export function selectAvailableBonusRelics(state: StoreState): readonly Relic[] {
  const locked = state.lockedRelics ?? EMPTY_LOCKED_RELICS;
  const bonuses = new Set((state.bonusRelics ?? []).map((b) => `${b.tier}/${b.name}`));
  const out: Relic[] = [];
  for (const r of ALL_RELICS) {
    if (r.tier >= 7) continue;
    if (locked[r.tier] === r.name) continue;
    if (bonuses.has(`${r.tier}/${r.name}`)) continue;
    out.push(r);
  }
  return out;
}
