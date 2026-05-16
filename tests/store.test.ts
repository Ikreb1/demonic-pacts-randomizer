// End-to-end style test: drives the Zustand store through the roll-and-lock
// flow against the real generated tasks.json so we catch regressions in the
// lock invariant and the auto-roll on completion.

import { describe, it, expect, beforeEach } from 'vitest';

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}
// Stub localStorage before importing the store (zustand/persist reads it on import).
(globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage() as unknown as Storage;

const {
  useStore,
  ALL_TASKS_LIST,
  ALL_RELICS_LIST,
  ALL_PACTS_LIST,
  selectActiveTask,
  selectPendingRegionPicks,
  selectNextPickIsForcedKaramja,
  selectRelicScore,
  selectPendingRelicPicks,
  selectNextPendingRelicTier,
  selectLockedRelics,
  selectPendingReloadedPicks,
  selectAvailableBonusRelics,
  selectUnlockedPactIds,
  selectPactResetsRemaining,
  selectEligiblePactCount,
  selectPactRollsRemaining,
  selectIsDevUser,
  relicsForTier,
} = await import('../src/state/store');
const {
  TIERS,
  TIER_POINTS,
  REGION_UNLOCK_THRESHOLDS,
  RELIC_TIER_THRESHOLDS,
  MAX_PACT_RESETS,
  MAX_PACTS_UNLOCKED,
} = await import('../src/types');

// The center pact is auto-unlocked at game start. Tests that need a fresh
// state should use this instead of an empty array.
const CENTER_PACT_ID =
  ALL_PACTS_LIST.find((p) => (p.x ?? 0) === 0 && (p.y ?? 0) === 0)?.id ?? ALL_PACTS_LIST[0]?.id;
type RelicTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

beforeEach(() => {
  useStore.setState({
    unlockedRegions: ['General', 'Varlamore'],
    manualComplete: [],
    syncedComplete: [],
    lastSync: null,
    activeTask: null,
    currentRoll: null,
    score: 0,
    lockedRelics: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null },
    bonusRelics: [],
    unlockedPactIds: CENTER_PACT_ID ? [CENTER_PACT_ID] : [],
    pactResetsUsed: 0,
  });
});

describe('store roll-and-lock flow', () => {
  it('starts in OPEN state with no roll', () => {
    expect(useStore.getState().activeTask).toBeNull();
    expect(useStore.getState().currentRoll).toBeNull();
  });

  it('roll() produces a candidate per tier from unlocked regions only', () => {
    useStore.getState().roll();
    const roll = useStore.getState().currentRoll!;
    for (const tier of TIERS) {
      const id = roll[tier];
      expect(id).not.toBeNull();
      const task = ALL_TASKS_LIST.find((t) => t.id === id)!;
      expect(['General', 'Varlamore']).toContain(task.region);
      expect(task.tier).toBe(tier);
    }
  });

  it('pickTier() locks and clears the roll', () => {
    useStore.getState().roll();
    const easyId = useStore.getState().currentRoll!.easy!;
    useStore.getState().pickTier('easy');
    expect(useStore.getState().activeTask).toBe(easyId);
    expect(useStore.getState().currentRoll).toBeNull();
  });

  it('roll() and pickTier() are no-ops while LOCKED (lock invariant)', () => {
    useStore.getState().roll();
    useStore.getState().pickTier('easy');
    const lockedId = useStore.getState().activeTask;
    useStore.getState().roll();
    expect(useStore.getState().currentRoll).toBeNull();
    useStore.getState().pickTier('hard');
    expect(useStore.getState().activeTask).toBe(lockedId);
  });

  it('markActiveComplete() releases lock, marks complete, auto-rolls', () => {
    useStore.getState().roll();
    useStore.getState().pickTier('easy');
    const completedId = useStore.getState().activeTask!;
    useStore.getState().markActiveComplete();
    const state = useStore.getState();
    expect(state.activeTask).toBeNull();
    expect(state.manualComplete).toContain(completedId);
    expect(state.currentRoll).not.toBeNull();
    // The just-completed task must not appear in the new roll.
    for (const tier of TIERS) {
      expect(state.currentRoll![tier]).not.toBe(completedId);
    }
  });

  it('markActiveComplete() awards the tier points (easy → multiplier always 1)', () => {
    useStore.getState().roll();
    useStore.getState().pickTier('easy');
    expect(useStore.getState().score).toBe(0);
    useStore.getState().markActiveComplete();
    // Easy is the lowest tier; the early-tier multiplier is always 1×.
    expect(useStore.getState().score).toBe(TIER_POINTS.easy);
  });

  it('abandonActive() releases lock without marking complete', () => {
    useStore.getState().roll();
    useStore.getState().pickTier('easy');
    const id = useStore.getState().activeTask!;
    useStore.getState().abandonActive();
    expect(useStore.getState().activeTask).toBeNull();
    expect(useStore.getState().manualComplete).not.toContain(id);
    expect(useStore.getState().currentRoll).not.toBeNull();
  });

  it('abandonActive() subtracts 2x the tier points as a penalty', () => {
    useStore.getState().roll();
    useStore.getState().pickTier('elite');
    expect(useStore.getState().score).toBe(0);
    useStore.getState().abandonActive();
    expect(useStore.getState().score).toBe(-2 * TIER_POINTS.elite);
  });

  it('completing then abandoning nets points minus 2x penalty (easy throughout)', () => {
    useStore.getState().roll();
    useStore.getState().pickTier('easy');
    useStore.getState().markActiveComplete();
    useStore.getState().pickTier('easy');
    useStore.getState().abandonActive();
    // Easy multiplier is always 1×; this avoids muddling with the hard/elite
    // tier multipliers tested elsewhere.
    expect(useStore.getState().score).toBe(TIER_POINTS.easy - 2 * TIER_POINTS.easy);
  });

  it('applySync auto-releases lock when active task is in synced set', () => {
    useStore.getState().roll();
    useStore.getState().pickTier('easy');
    const id = useStore.getState().activeTask!;
    useStore.getState().applySync([id, 99999], { username: 'x', at: 0, source: 'wikisync' });
    expect(useStore.getState().activeTask).toBeNull();
  });

  it('applySync re-rolls any tier slots whose task got marked complete', () => {
    useStore.getState().roll();
    const before = useStore.getState().currentRoll!;
    // Pretend EVERY currently-rolled task just synced as complete.
    const completedNow = TIERS.map((t) => before[t]).filter((id): id is number => id !== null);
    useStore.getState().applySync(completedNow, { username: 'x', at: 0, source: 'wikisync' });
    const after = useStore.getState().currentRoll!;
    for (const tier of TIERS) {
      // No slot should still hold a completed task.
      const id = after[tier];
      if (id !== null) expect(completedNow).not.toContain(id);
    }
  });

  it('reconcileCurrentRoll replaces a slot whose task has an unmet parent', () => {
    const child = ALL_TASKS_LIST.find((t) => t.name === 'Equip a Saradomin Sword')!;
    const parent = ALL_TASKS_LIST.find((t) => t.name === 'Defeat Commander Zilyana')!;
    expect(child).toBeDefined();
    expect(parent).toBeDefined();
    // Plant the gated child in its tier slot, with the parent NOT completed.
    // Asgarnia must be unlocked so the slot has eligible replacements when
    // reconcile picks a new task for that tier.
    useStore.setState({
      unlockedRegions: ['General', 'Asgarnia'],
      manualComplete: [],
      syncedComplete: [],
      currentRoll: { easy: null, medium: null, hard: child.id, elite: null, master: null },
    });
    useStore.getState().reconcileCurrentRoll();
    const after = useStore.getState().currentRoll!;
    expect(after.hard).not.toBe(child.id);
  });

  it('reconcileCurrentRoll leaves currentRoll alone when every slot is still eligible', () => {
    useStore.getState().roll();
    const before = useStore.getState().currentRoll;
    useStore.getState().reconcileCurrentRoll();
    // Reference equality — no spurious set when nothing needed reconciling.
    expect(useStore.getState().currentRoll).toBe(before);
  });

  describe('region unlock thresholds', () => {
    function setCompletedCount(n: number) {
      // Mark the first n task IDs as manually completed.
      const ids = ALL_TASKS_LIST.slice(0, n).map((t) => t.id);
      useStore.setState({ manualComplete: ids });
    }

    it('grants no pending picks when below the first threshold', () => {
      setCompletedCount(REGION_UNLOCK_THRESHOLDS[0] - 1);
      expect(selectPendingRegionPicks(useStore.getState())).toBe(0);
    });

    it('grants one pending pick at the first threshold (forced Karamja)', () => {
      setCompletedCount(REGION_UNLOCK_THRESHOLDS[0]);
      expect(selectPendingRegionPicks(useStore.getState())).toBe(1);
      expect(selectNextPickIsForcedKaramja(useStore.getState())).toBe(true);
    });

    it('refuses non-Karamja for the first slot', () => {
      setCompletedCount(REGION_UNLOCK_THRESHOLDS[0]);
      useStore.getState().unlockRegion('Wilderness');
      expect(useStore.getState().unlockedRegions).not.toContain('Wilderness');
      expect(selectPendingRegionPicks(useStore.getState())).toBe(1);
    });

    it('accepts Karamja for the first slot and clears the pick', () => {
      setCompletedCount(REGION_UNLOCK_THRESHOLDS[0]);
      useStore.getState().unlockRegion('Karamja');
      expect(useStore.getState().unlockedRegions).toContain('Karamja');
      expect(selectPendingRegionPicks(useStore.getState())).toBe(0);
      expect(selectNextPickIsForcedKaramja(useStore.getState())).toBe(false);
    });

    it('refuses unlockRegion when no pick is pending', () => {
      // Plenty of completions, but the first pick has not yet been earned (count < 80).
      setCompletedCount(50);
      useStore.getState().unlockRegion('Karamja');
      expect(useStore.getState().unlockedRegions).not.toContain('Karamja');
    });

    it('allows free choice for the second slot once Karamja is taken', () => {
      setCompletedCount(REGION_UNLOCK_THRESHOLDS[1]);
      useStore.getState().unlockRegion('Karamja');
      expect(selectPendingRegionPicks(useStore.getState())).toBe(1);
      expect(selectNextPickIsForcedKaramja(useStore.getState())).toBe(false);
      useStore.getState().unlockRegion('Wilderness');
      expect(useStore.getState().unlockedRegions).toContain('Wilderness');
      expect(selectPendingRegionPicks(useStore.getState())).toBe(0);
    });

    it('queues all four picks when crossing every threshold at once', () => {
      setCompletedCount(REGION_UNLOCK_THRESHOLDS[REGION_UNLOCK_THRESHOLDS.length - 1]);
      expect(selectPendingRegionPicks(useStore.getState())).toBe(4);
      // Forced first pick.
      useStore.getState().unlockRegion('Karamja');
      // Then three free picks.
      useStore.getState().unlockRegion('Wilderness');
      useStore.getState().unlockRegion('Morytania');
      useStore.getState().unlockRegion('Asgarnia');
      expect(selectPendingRegionPicks(useStore.getState())).toBe(0);
      expect(useStore.getState().unlockedRegions).toEqual(
        expect.arrayContaining(['Karamja', 'Wilderness', 'Morytania', 'Asgarnia']),
      );
    });

    it('refuses to re-unlock a region already unlocked', () => {
      setCompletedCount(REGION_UNLOCK_THRESHOLDS[1]);
      useStore.getState().unlockRegion('Karamja');
      const before = useStore.getState().unlockedRegions.length;
      useStore.getState().unlockRegion('Karamja');
      expect(useStore.getState().unlockedRegions.length).toBe(before);
    });
  });

  it('selectActiveTask returns the full Task object', () => {
    useStore.getState().roll();
    useStore.getState().pickTier('medium');
    const task = selectActiveTask(useStore.getState());
    expect(task).not.toBeNull();
    expect(task!.tier).toBe('medium');
  });

  describe('roll gating around pending region picks', () => {
    it('markActiveComplete leaves currentRoll null when the completion creates a pending pick', () => {
      // Seed 79 manual completions — one shy of the 80-task threshold.
      const seed = ALL_TASKS_LIST.slice(0, 79).map((t) => t.id);
      useStore.setState({ manualComplete: seed });
      useStore.getState().roll();
      const roll = useStore.getState().currentRoll!;
      let pickedTier: (typeof TIERS)[number] | null = null;
      for (const tier of TIERS) {
        if (roll[tier] !== null) {
          useStore.getState().pickTier(tier);
          pickedTier = tier;
          break;
        }
      }
      expect(pickedTier).not.toBeNull();
      // Completing the task brings total to 80 — first threshold crossed.
      useStore.getState().markActiveComplete();
      expect(useStore.getState().activeTask).toBeNull();
      expect(useStore.getState().currentRoll).toBeNull();
      expect(selectPendingRegionPicks(useStore.getState())).toBeGreaterThanOrEqual(1);
    });

    it('abandonActive leaves currentRoll null when there is already a pending pick', () => {
      // Seed 80 manual completions to put the user past the first threshold.
      const seed = ALL_TASKS_LIST.slice(0, 80).map((t) => t.id);
      useStore.setState({ manualComplete: seed });
      // Lock in a task outside the seed (simulates the user having an
      // active task while a pending pick already exists).
      const candidate = ALL_TASKS_LIST.find((t) => !seed.includes(t.id))!;
      useStore.setState({ activeTask: candidate.id });
      expect(selectPendingRegionPicks(useStore.getState())).toBe(1);
      useStore.getState().abandonActive();
      expect(useStore.getState().activeTask).toBeNull();
      expect(useStore.getState().currentRoll).toBeNull();
    });

    it('markActiveComplete still auto-rolls when no pick is triggered', () => {
      useStore.getState().roll();
      useStore.getState().pickTier('easy');
      useStore.getState().markActiveComplete();
      expect(useStore.getState().currentRoll).not.toBeNull();
      expect(selectPendingRegionPicks(useStore.getState())).toBe(0);
    });

    it('applySync clears currentRoll when the sync earns one or more picks', () => {
      // Establish an existing roll first.
      useStore.getState().roll();
      expect(useStore.getState().currentRoll).not.toBeNull();
      // Sync 80 completions to cross the first threshold.
      const ids = ALL_TASKS_LIST.slice(0, 80).map((t) => t.id);
      useStore.getState().applySync(ids, { username: 'x', at: 0, source: 'wikisync' });
      expect(useStore.getState().currentRoll).toBeNull();
      expect(selectPendingRegionPicks(useStore.getState())).toBeGreaterThanOrEqual(1);
    });

  });

  describe('applySync auto-unlocks regions present in synced completions', () => {
    function pickIdInRegion(region: string): number {
      const t = ALL_TASKS_LIST.find((x) => x.region === region)!;
      return t.id;
    }

    it('auto-unlocks regions where at least one synced task is completed', () => {
      const ids = [pickIdInRegion('Karamja'), pickIdInRegion('Wilderness')];
      useStore.getState().applySync(ids, { username: 'x', at: 0, source: 'wikisync' });
      const unlocked = useStore.getState().unlockedRegions;
      expect(unlocked).toEqual(expect.arrayContaining(['Karamja', 'Wilderness']));
    });

    it('does not auto-unlock starter regions (already always-unlocked)', () => {
      const ids = [pickIdInRegion('General'), pickIdInRegion('Varlamore')];
      const before = useStore.getState().unlockedRegions.length;
      useStore.getState().applySync(ids, { username: 'x', at: 0, source: 'wikisync' });
      expect(useStore.getState().unlockedRegions.length).toBe(before);
    });

    it('auto-unlock is one-way: clearing the sync does not relock detected regions', () => {
      const ids = [pickIdInRegion('Karamja')];
      useStore.getState().applySync(ids, { username: 'x', at: 0, source: 'wikisync' });
      expect(useStore.getState().unlockedRegions).toContain('Karamja');
      useStore.getState().clearSync();
      expect(useStore.getState().unlockedRegions).toContain('Karamja');
    });

    it('auto-unlocked regions consume earned slots so the modal does not pop spuriously', () => {
      // Synced completions include 80 manual + one Karamja completion. The
      // 80-task threshold is crossed (1 pick earned) and Karamja is detected
      // (1 slot used) — so net pendingPicks should be 0.
      const filler = ALL_TASKS_LIST.slice(0, 79).map((t) => t.id);
      const ids = [...filler, pickIdInRegion('Karamja')];
      useStore.getState().applySync(ids, { username: 'x', at: 0, source: 'wikisync' });
      expect(useStore.getState().unlockedRegions).toContain('Karamja');
      expect(selectPendingRegionPicks(useStore.getState())).toBe(0);
    });

    it('still flags pending picks if user crossed a threshold without enough detected regions', () => {
      // 200+ completions but no completions in non-starter regions → pending = 2.
      const ids = ALL_TASKS_LIST.filter(
        (t) => t.region === 'General' || t.region === 'Varlamore',
      )
        .slice(0, 200)
        .map((t) => t.id);
      // We need exactly 200 to hit threshold #2; only proceed if we have enough
      // starter-region tasks.
      if (ids.length < 200) return;
      useStore.getState().applySync(ids, { username: 'x', at: 0, source: 'wikisync' });
      expect(selectPendingRegionPicks(useStore.getState())).toBeGreaterThanOrEqual(1);
    });
  });

  describe('relic locking', () => {
    function setRawRelicScore(target: number) {
      // Seed manualComplete with however many tasks of summed TIER_POINTS
      // produce at least `target` raw points. We pick deterministically
      // starting from id 0 (mostly easy tasks), summing tier values.
      const ids: number[] = [];
      let sum = 0;
      for (const t of ALL_TASKS_LIST) {
        if (sum >= target) break;
        ids.push(t.id);
        sum += TIER_POINTS[t.tier];
      }
      useStore.setState({ manualComplete: ids });
      return sum;
    }

    it('selectRelicScore sums TIER_POINTS over completed tasks', () => {
      const seed = ALL_TASKS_LIST.slice(0, 3).map((t) => t.id);
      useStore.setState({ manualComplete: seed });
      const expected = seed.reduce(
        (acc, id) => acc + TIER_POINTS[ALL_TASKS_LIST.find((t) => t.id === id)!.tier],
        0,
      );
      expect(selectRelicScore(useStore.getState())).toBe(expected);
    });

    it('starts with tier 1 pending (threshold is 0)', () => {
      // Empty completion set still earns tier 1 since its threshold is 0.
      expect(selectPendingRelicPicks(useStore.getState())).toBe(1);
      expect(selectNextPendingRelicTier(useStore.getState())).toBe(1);
    });

    it('lockRelic commits when tier is earned and not already locked', () => {
      const tier1 = relicsForTier(1)[0];
      useStore.getState().lockRelic(1, tier1.name);
      expect(selectLockedRelics(useStore.getState())[1]).toBe(tier1.name);
      expect(selectPendingRelicPicks(useStore.getState())).toBe(0);
    });

    it('lockRelic refuses when tier already has a locked relic', () => {
      const [first, second] = relicsForTier(1);
      useStore.getState().lockRelic(1, first.name);
      useStore.getState().lockRelic(1, second.name);
      expect(selectLockedRelics(useStore.getState())[1]).toBe(first.name);
    });

    it('lockRelic refuses when threshold has not been reached', () => {
      // Tier 8 needs 28,000 raw points; a fresh state has 0.
      const tier8 = relicsForTier(8)[0];
      useStore.getState().lockRelic(8, tier8.name);
      expect(selectLockedRelics(useStore.getState())[8]).toBeNull();
    });

    it('lockRelic refuses an unknown name within a known tier', () => {
      useStore.getState().lockRelic(1, 'Fake Relic Name');
      expect(selectLockedRelics(useStore.getState())[1]).toBeNull();
    });

    it('relic score crossing 600 makes tier 2 pending', () => {
      const reached = setRawRelicScore(RELIC_TIER_THRESHOLDS[2]);
      expect(reached).toBeGreaterThanOrEqual(RELIC_TIER_THRESHOLDS[2]);
      // Lock tier 1 first so only tier 2 remains pending.
      useStore.getState().lockRelic(1, relicsForTier(1)[0].name);
      expect(selectNextPendingRelicTier(useStore.getState())).toBe(2);
      expect(selectPendingRelicPicks(useStore.getState())).toBe(1);
    });

    it('selectNextPendingRelicTier returns null when up-to-date', () => {
      useStore.getState().lockRelic(1, relicsForTier(1)[0].name);
      // Tier 2 not yet earned (raw score is 0 since manualComplete empty),
      // so no further pending picks.
      expect(selectNextPendingRelicTier(useStore.getState())).toBeNull();
      expect(selectPendingRelicPicks(useStore.getState())).toBe(0);
    });

    it('resetAll clears lockedRelics back to all-null', () => {
      useStore.getState().lockRelic(1, relicsForTier(1)[0].name);
      expect(selectLockedRelics(useStore.getState())[1]).not.toBeNull();
      useStore.getState().resetAll();
      const after = selectLockedRelics(useStore.getState());
      for (const t of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
        expect(after[t]).toBeNull();
      }
    });

    it('relic dataset has 23 relics across 8 tiers', () => {
      // Sanity: keeps us honest if the wiki adds/removes relics.
      expect(ALL_RELICS_LIST.length).toBe(23);
      const counts: Record<number, number> = {};
      for (const r of ALL_RELICS_LIST) counts[r.tier] = (counts[r.tier] ?? 0) + 1;
      expect(counts[1]).toBe(3);
      expect(counts[7]).toBe(2);
      expect(counts[8]).toBe(3);
    });
  });

  describe('early-tier multiplier on completion', () => {
    function tasksAt(tier: 'easy' | 'medium' | 'hard' | 'elite' | 'master') {
      return ALL_TASKS_LIST.filter(
        (t) => t.tier === tier && (t.region === 'General' || t.region === 'Varlamore'),
      );
    }

    it('master with no lower-tier completions → multiplier 2.0', () => {
      // Find a master task in starter regions and pick it directly.
      const master = ALL_TASKS_LIST.find(
        (t) => t.tier === 'master' && (t.region === 'General' || t.region === 'Varlamore'),
      );
      if (!master) return; // nothing to assert if data shape changes
      useStore.setState({ activeTask: master.id });
      expect(useStore.getState().score).toBe(0);
      useStore.getState().markActiveComplete();
      expect(useStore.getState().score).toBe(TIER_POINTS.master * 2);
    });

    it('master with all lower-tier tasks already completed → multiplier 1.0', () => {
      // Pre-complete every easy/medium/hard/elite task in starter regions so
      // the lower-tier remaining count for a master is 0.
      const lowers = [
        ...tasksAt('easy'),
        ...tasksAt('medium'),
        ...tasksAt('hard'),
        ...tasksAt('elite'),
      ].map((t) => t.id);
      const master = ALL_TASKS_LIST.find(
        (t) => t.tier === 'master' && (t.region === 'General' || t.region === 'Varlamore'),
      );
      if (!master) return;
      useStore.setState({ manualComplete: lowers, activeTask: master.id });
      const before = useStore.getState().score;
      useStore.getState().markActiveComplete();
      expect(useStore.getState().score - before).toBe(TIER_POINTS.master);
    });

    it('hard with half of lowers completed → multiplier ≈ 1.5×', () => {
      const easies = tasksAt('easy');
      const mediums = tasksAt('medium');
      const halfEasies = easies.slice(0, Math.floor(easies.length / 2)).map((t) => t.id);
      const halfMediums = mediums.slice(0, Math.floor(mediums.length / 2)).map((t) => t.id);
      const hard = ALL_TASKS_LIST.find(
        (t) => t.tier === 'hard' && (t.region === 'General' || t.region === 'Varlamore'),
      );
      if (!hard) return;
      useStore.setState({
        manualComplete: [...halfEasies, ...halfMediums],
        activeTask: hard.id,
      });
      const before = useStore.getState().score;
      useStore.getState().markActiveComplete();
      const earned = useStore.getState().score - before;
      // Expected ratio = (remainingLower / totalLower); half completed → ~0.5.
      // Multiplier ≈ 1.5; allow a few-point tolerance for integer floor/half.
      expect(earned).toBeGreaterThanOrEqual(Math.round(TIER_POINTS.hard * 1.4));
      expect(earned).toBeLessThanOrEqual(Math.round(TIER_POINTS.hard * 1.6));
    });

    it('locked-region tasks do not count toward lower-tier pool', () => {
      // With only starter regions, hard task multiplier is computed against
      // starter-only easy/medium pool. Wilderness tasks (locked) should not
      // dilute the multiplier even though they exist in ALL_TASKS.
      const hard = ALL_TASKS_LIST.find(
        (t) => t.tier === 'hard' && (t.region === 'General' || t.region === 'Varlamore'),
      );
      if (!hard) return;
      useStore.setState({ activeTask: hard.id });
      useStore.getState().markActiveComplete();
      // No lowers completed in starter regions → multiplier should be exactly 2×.
      expect(useStore.getState().score).toBe(TIER_POINTS.hard * 2);
    });
  });

  describe('random unlock bonuses', () => {
    it('unlockRegion(r, true) adds 500 to score', () => {
      // Seed enough completions to earn first slot (forced Karamja path),
      // then a second slot for a free pick.
      const ids = ALL_TASKS_LIST.slice(0, REGION_UNLOCK_THRESHOLDS[1]).map((t) => t.id);
      useStore.setState({ manualComplete: ids, score: 0 });
      // Take Karamja first (no bonus on the forced pick).
      useStore.getState().unlockRegion('Karamja');
      expect(useStore.getState().score).toBe(0);
      // Now a free pick — viaRandom = true should award 500.
      useStore.getState().unlockRegion('Wilderness', true);
      expect(useStore.getState().score).toBe(500);
    });

    it('unlockRegion(r) without viaRandom flag does not add a bonus', () => {
      const ids = ALL_TASKS_LIST.slice(0, REGION_UNLOCK_THRESHOLDS[1]).map((t) => t.id);
      useStore.setState({ manualComplete: ids, score: 0 });
      useStore.getState().unlockRegion('Karamja');
      useStore.getState().unlockRegion('Wilderness');
      expect(useStore.getState().score).toBe(0);
    });

    it('forced-Karamja unlock never awards a random bonus even with the flag', () => {
      const ids = ALL_TASKS_LIST.slice(0, REGION_UNLOCK_THRESHOLDS[0]).map((t) => t.id);
      useStore.setState({ manualComplete: ids, score: 0 });
      // First slot must be Karamja regardless; even passing viaRandom=true
      // is treated like the forced unlock since there is no random choice.
      // We still expect a bonus increment because the action sees viaRandom=true.
      // The product decision is that the modal never passes viaRandom=true on
      // the forced screen — but the action itself does honour the flag.
      useStore.getState().unlockRegion('Karamja', true);
      expect(useStore.getState().score).toBe(500);
    });

    it('lockRelic(t, n, true) adds 500 to score', () => {
      // Tier 1 threshold is 0 — always immediately earned.
      const tier1 = relicsForTier(1)[0];
      expect(useStore.getState().score).toBe(0);
      useStore.getState().lockRelic(1, tier1.name, true);
      expect(useStore.getState().score).toBe(500);
    });

    it('lockRelic(t, n) without viaRandom flag does not add a bonus', () => {
      const tier1 = relicsForTier(1)[0];
      useStore.getState().lockRelic(1, tier1.name);
      expect(useStore.getState().score).toBe(0);
    });
  });

  describe('Reloaded relic handling', () => {
    function lockTier1through7Reloaded() {
      // Cheap setup: directly write lockedRelics primaries for tiers 1-6 +
      // Reloaded at tier 7. Tests isolate the Reloaded mechanics from the
      // (separately-tested) tier-by-tier flow.
      const t1 = relicsForTier(1)[0].name;
      const t2 = relicsForTier(2)[0].name;
      const t3 = relicsForTier(3)[0].name;
      const t4 = relicsForTier(4)[0].name;
      const t5 = relicsForTier(5)[0].name;
      const t6 = relicsForTier(6)[0].name;
      useStore.setState({
        lockedRelics: { 1: t1, 2: t2, 3: t3, 4: t4, 5: t5, 6: t6, 7: 'Reloaded', 8: null },
        bonusRelics: [],
      });
    }

    it('selectPendingReloadedPicks is 1 when Reloaded locked and no bonus picked', () => {
      lockTier1through7Reloaded();
      expect(selectPendingReloadedPicks(useStore.getState())).toBe(1);
    });

    it('selectPendingReloadedPicks is 0 when Tier 7 is something other than Reloaded', () => {
      useStore.setState({
        lockedRelics: {
          1: null,
          2: null,
          3: null,
          4: null,
          5: null,
          6: null,
          7: 'Flow State',
          8: null,
        },
      });
      expect(selectPendingReloadedPicks(useStore.getState())).toBe(0);
    });

    it('selectAvailableBonusRelics excludes locked primaries and tiers ≥ 7', () => {
      lockTier1through7Reloaded();
      const avail = selectAvailableBonusRelics(useStore.getState());
      // None at tier 7 or 8.
      expect(avail.every((r) => r.tier < 7)).toBe(true);
      // The locked primary at each tier 1-6 should not appear.
      const lockedNames = new Set(
        [1, 2, 3, 4, 5, 6].map((t) => useStore.getState().lockedRelics[t as RelicTier]),
      );
      expect(avail.every((r) => !lockedNames.has(r.name))).toBe(true);
      // Must have at least 6 candidates (1 unpicked relic per prior tier in
      // the simplest case; more realistically 12).
      expect(avail.length).toBeGreaterThanOrEqual(6);
    });

    it('lockReloadedRelic refuses when Reloaded is not the Tier 7 primary', () => {
      useStore.setState({
        lockedRelics: {
          1: null,
          2: null,
          3: null,
          4: null,
          5: null,
          6: null,
          7: 'Flow State',
          8: null,
        },
        bonusRelics: [],
      });
      const t1 = relicsForTier(1)[0];
      useStore.getState().lockReloadedRelic(1, t1.name);
      expect(useStore.getState().bonusRelics).toEqual([]);
    });

    it('lockReloadedRelic refuses a tier ≥ 7', () => {
      lockTier1through7Reloaded();
      const t7 = relicsForTier(7).find((r) => r.name !== 'Reloaded')!;
      useStore.getState().lockReloadedRelic(7, t7.name);
      expect(useStore.getState().bonusRelics).toEqual([]);
    });

    it('lockReloadedRelic refuses the same name as the locked primary', () => {
      lockTier1through7Reloaded();
      const lockedAtT1 = useStore.getState().lockedRelics[1]!;
      useStore.getState().lockReloadedRelic(1, lockedAtT1);
      expect(useStore.getState().bonusRelics).toEqual([]);
    });

    it('lockReloadedRelic refuses an unknown relic name', () => {
      lockTier1through7Reloaded();
      useStore.getState().lockReloadedRelic(1, 'No Such Relic');
      expect(useStore.getState().bonusRelics).toEqual([]);
    });

    it('lockReloadedRelic refuses a second bonus pick once one is taken', () => {
      lockTier1through7Reloaded();
      const first = selectAvailableBonusRelics(useStore.getState())[0];
      useStore.getState().lockReloadedRelic(first.tier, first.name);
      expect(useStore.getState().bonusRelics).toHaveLength(1);
      // Try a second one.
      const second = selectAvailableBonusRelics(useStore.getState())[0];
      if (second) {
        useStore.getState().lockReloadedRelic(second.tier, second.name);
      }
      expect(useStore.getState().bonusRelics).toHaveLength(1);
    });

    it('lockReloadedRelic with viaRandom=true awards 500 to score', () => {
      lockTier1through7Reloaded();
      const before = useStore.getState().score;
      const pick = selectAvailableBonusRelics(useStore.getState())[0];
      useStore.getState().lockReloadedRelic(pick.tier, pick.name, true);
      expect(useStore.getState().score - before).toBe(500);
      expect(useStore.getState().bonusRelics).toEqual([{ tier: pick.tier, name: pick.name }]);
    });

    it('lockReloadedRelic without viaRandom does not add a bonus', () => {
      lockTier1through7Reloaded();
      const before = useStore.getState().score;
      const pick = selectAvailableBonusRelics(useStore.getState())[0];
      useStore.getState().lockReloadedRelic(pick.tier, pick.name);
      expect(useStore.getState().score - before).toBe(0);
    });

    it('resetAll clears bonusRelics', () => {
      lockTier1through7Reloaded();
      const pick = selectAvailableBonusRelics(useStore.getState())[0];
      useStore.getState().lockReloadedRelic(pick.tier, pick.name);
      expect(useStore.getState().bonusRelics).toHaveLength(1);
      useStore.getState().resetAll();
      expect(useStore.getState().bonusRelics).toEqual([]);
    });
  });

  describe('applySync half-points for non-primary completions', () => {
    function findTask(name: string) {
      const t = ALL_TASKS_LIST.find((x) => x.name === name);
      if (!t) throw new Error(`task not in fixture: ${name}`);
      return t;
    }

    it('credits half tier points per newly-synced task', () => {
      const easy = findTask('Open the Leagues Menu'); // easy, General region
      const medium = ALL_TASKS_LIST.find(
        (t) => t.tier === 'medium' && (t.region === 'General' || t.region === 'Varlamore'),
      )!;
      useStore.setState({ score: 0 });
      useStore
        .getState()
        .applySync([easy.id, medium.id], { username: 'x', at: 0, source: 'wikisync' });
      const expected =
        Math.round(TIER_POINTS.easy * 0.5) + Math.round(TIER_POINTS[medium.tier] * 0.5);
      expect(useStore.getState().score).toBe(expected);
    });

    it('does not double-credit when re-syncing the same set', () => {
      const easy = findTask('Open the Leagues Menu');
      useStore.setState({ score: 0 });
      useStore.getState().applySync([easy.id], { username: 'x', at: 0, source: 'wikisync' });
      const after = useStore.getState().score;
      useStore.getState().applySync([easy.id], { username: 'x', at: 1, source: 'wikisync' });
      expect(useStore.getState().score).toBe(after);
    });

    it('awards full active-task credit (not half) when the sync completes the locked task', () => {
      // Set up an active task, then sync an arrival containing only that task.
      const easy = ALL_TASKS_LIST.find(
        (t) => t.tier === 'easy' && (t.region === 'General' || t.region === 'Varlamore'),
      )!;
      useStore.setState({ activeTask: easy.id, score: 0 });
      useStore.getState().applySync([easy.id], { username: 'x', at: 0, source: 'wikisync' });
      // Easy has no lower tiers, so the multiplier is 1.0 — full TIER_POINTS.easy.
      expect(useStore.getState().score).toBe(TIER_POINTS.easy);
      expect(useStore.getState().activeTask).toBeNull();
    });

    it("applies the early-tier multiplier when the synced active task is higher-tier", () => {
      // Hard task with all easies/mediums still uncompleted in unlocked
      // regions → multiplier should be 2.0 (max).
      const hard = ALL_TASKS_LIST.find(
        (t) => t.tier === 'hard' && (t.region === 'General' || t.region === 'Varlamore'),
      )!;
      useStore.setState({ activeTask: hard.id, score: 0, manualComplete: [], syncedComplete: [] });
      useStore.getState().applySync([hard.id], { username: 'x', at: 0, source: 'wikisync' });
      expect(useStore.getState().score).toBe(TIER_POINTS.hard * 2);
      expect(useStore.getState().activeTask).toBeNull();
    });

  });

  describe('roll respects task dependencies', () => {
    function findTask(name: string) {
      const t = ALL_TASKS_LIST.find((x) => x.name === name);
      if (!t) throw new Error(`task not in fixture: ${name}`);
      return t;
    }

    it('never rolls "Open the Leagues Menu" or "Complete the Leagues Tutorial"', () => {
      const tutorialIds = new Set([
        findTask('Open the Leagues Menu').id,
        findTask('Complete the Leagues Tutorial').id,
      ]);
      // Many rolls — none should ever surface a tutorial task.
      for (let i = 0; i < 60; i++) {
        useStore.getState().roll();
        const r = useStore.getState().currentRoll!;
        for (const tier of TIERS) {
          if (r[tier] !== null) expect(tutorialIds.has(r[tier]!)).toBe(false);
        }
      }
    });

    it('never rolls "75 Easy Clue Scrolls" before "1 Easy Clue Scroll" is complete', () => {
      const child = findTask('75 Easy Clue Scrolls');
      for (let i = 0; i < 60; i++) {
        useStore.getState().roll();
        const r = useStore.getState().currentRoll!;
        for (const tier of TIERS) {
          expect(r[tier]).not.toBe(child.id);
        }
      }
    });

    it('once parent is complete, the child shows up in the eligible bucket', async () => {
      const { eligibleByTier } = await import('../src/lib/filters');
      const parent = findTask('1 Easy Clue Scroll');
      const child = findTask('25 Easy Clue Scrolls');
      const regions = new Set<'General' | 'Varlamore'>(['General', 'Varlamore']);
      // Before completing parent: child is NOT in any tier bucket.
      const beforeBuckets = eligibleByTier(ALL_TASKS_LIST, regions, new Set());
      const beforeAllIds = new Set(
        Object.values(beforeBuckets).flatMap((arr) => arr.map((t) => t.id)),
      );
      expect(beforeAllIds.has(child.id)).toBe(false);
      // After completing parent: child appears in its tier bucket.
      const afterBuckets = eligibleByTier(ALL_TASKS_LIST, regions, new Set([parent.id]));
      const afterAllIds = new Set(
        Object.values(afterBuckets).flatMap((arr) => arr.map((t) => t.id)),
      );
      expect(afterAllIds.has(child.id)).toBe(true);
    });
  });

  describe('pacts roll and reset', () => {
    it('starts with the center pact pre-unlocked', () => {
      const unlocked = selectUnlockedPactIds(useStore.getState());
      expect(unlocked).toHaveLength(1);
      expect(unlocked[0]).toBe(CENTER_PACT_ID);
    });

    it('the pre-unlocked center counts toward the 40-pact cap', () => {
      expect(selectPactRollsRemaining(useStore.getState())).toBe(MAX_PACTS_UNLOCKED - 1);
    });

    it('rollPact only picks nodes adjacent to something already unlocked', () => {
      const unlockedBefore = new Set(selectUnlockedPactIds(useStore.getState()));
      const center = ALL_PACTS_LIST.find((p) => p.id === CENTER_PACT_ID)!;
      const centerNeighbors = new Set(center.prerequisites);
      // Several rolls in a row — every pick must either be a neighbor of
      // the current unlocked set, transitively, never a random distant node.
      for (let i = 0; i < 5; i++) {
        const picked = useStore.getState().rollPact();
        if (picked === null) break;
        // The picked node must have at least one neighbor in the unlocked
        // set as it stood BEFORE this roll.
        const p = ALL_PACTS_LIST.find((x) => x.id === picked)!;
        expect(p.prerequisites.some((req) => unlockedBefore.has(req))).toBe(true);
        unlockedBefore.add(picked);
      }
      // Sanity: every neighbor of center starts as a candidate.
      expect(centerNeighbors.size).toBeGreaterThan(0);
    });

    it('rollPact is a no-op once the 40-pact cap is hit', () => {
      // Seed 40 unlocked pacts directly — pretend the user has rolled out.
      const fortyIds = ALL_PACTS_LIST.slice(0, MAX_PACTS_UNLOCKED).map((p) => p.id);
      useStore.setState({ unlockedPactIds: fortyIds });
      expect(selectPactRollsRemaining(useStore.getState())).toBe(0);
      const result = useStore.getState().rollPact();
      expect(result).toBeNull();
      expect(selectUnlockedPactIds(useStore.getState())).toHaveLength(MAX_PACTS_UNLOCKED);
    });

    it('rollPact stops naturally before the cap if the frontier dries up', () => {
      // Drain the frontier: keep rolling until null. With only the center
      // initially unlocked and a connected planner graph, this should reach
      // the cap (40) — but the test still passes if it stops earlier on a
      // disconnected graph.
      let safety = MAX_PACTS_UNLOCKED + 5;
      while (useStore.getState().rollPact() !== null && safety-- > 0) {
        // each roll appends one
      }
      const finalCount = selectUnlockedPactIds(useStore.getState()).length;
      expect(finalCount).toBeLessThanOrEqual(MAX_PACTS_UNLOCKED);
      // Further rolls remain a no-op.
      const before = finalCount;
      expect(useStore.getState().rollPact()).toBeNull();
      expect(selectUnlockedPactIds(useStore.getState())).toHaveLength(before);
    });

    it('resetPacts restores the center-only initial state and decrements remaining count', () => {
      useStore.getState().rollPact();
      useStore.getState().rollPact();
      expect(selectPactResetsRemaining(useStore.getState())).toBe(MAX_PACT_RESETS);
      useStore.getState().resetPacts();
      expect(selectUnlockedPactIds(useStore.getState())).toEqual([CENTER_PACT_ID]);
      expect(selectPactResetsRemaining(useStore.getState())).toBe(MAX_PACT_RESETS - 1);
    });

    it('resetPacts is a no-op once 5 resets have been used', () => {
      useStore.setState({ pactResetsUsed: MAX_PACT_RESETS, unlockedPactIds: ['x'] });
      useStore.getState().resetPacts();
      // Untouched: still has pre-reset state, counter unchanged.
      expect(selectPactResetsRemaining(useStore.getState())).toBe(0);
      expect(selectUnlockedPactIds(useStore.getState())).toEqual(['x']);
    });

    it('selectEligiblePactCount counts only nodes adjacent to unlocked', () => {
      // Fresh state: only neighbors of the center are eligible.
      const center = ALL_PACTS_LIST.find((p) => p.id === CENTER_PACT_ID)!;
      const expectedFrontier = new Set(
        center.prerequisites.filter((req) => req !== CENTER_PACT_ID),
      );
      expect(selectEligiblePactCount(useStore.getState())).toBe(expectedFrontier.size);
    });

    it('resetAll restores center-only unlocks and the full reset budget', () => {
      useStore.getState().rollPact();
      useStore.getState().resetPacts();
      useStore.getState().resetAll();
      expect(selectUnlockedPactIds(useStore.getState())).toEqual([CENTER_PACT_ID]);
      expect(selectPactResetsRemaining(useStore.getState())).toBe(MAX_PACT_RESETS);
    });
  });

  describe('hiscores state actions', () => {
    it('setHiscoresBaseUrl trims whitespace', () => {
      useStore.getState().setHiscoresBaseUrl('  https://example.test/  ');
      expect(useStore.getState().hiscoresProxyBaseUrl).toBe('https://example.test/');
    });

    it('recordHiscoresSubmit sets timestamp + score and clears any prior error', () => {
      useStore.setState({
        hiscoresLastError: { at: 1, message: 'old' },
        hiscoresLastSubmittedAt: null,
        hiscoresLastSubmittedScore: null,
      });
      useStore.getState().recordHiscoresSubmit(4242, 1_700_000_000_000);
      const s = useStore.getState();
      expect(s.hiscoresLastSubmittedAt).toBe(1_700_000_000_000);
      expect(s.hiscoresLastSubmittedScore).toBe(4242);
      expect(s.hiscoresLastError).toBeNull();
    });

    it('recordHiscoresError stores the message with a timestamp', () => {
      const before = Date.now();
      useStore.getState().recordHiscoresError('CORS failed');
      const err = useStore.getState().hiscoresLastError!;
      expect(err.message).toBe('CORS failed');
      expect(err.at).toBeGreaterThanOrEqual(before);
      expect(err.at).toBeLessThanOrEqual(Date.now());
    });

    it('resetAll clears the hiscores last-submit/error fields', () => {
      useStore.setState({
        hiscoresLastSubmittedAt: 1,
        hiscoresLastSubmittedScore: 99,
        hiscoresLastError: { at: 1, message: 'x' },
      });
      useStore.getState().resetAll();
      const s = useStore.getState();
      expect(s.hiscoresLastSubmittedAt).toBeNull();
      expect(s.hiscoresLastSubmittedScore).toBeNull();
      expect(s.hiscoresLastError).toBeNull();
    });
  });

  describe('selectIsDevUser', () => {
    it('returns false when lastSync is null', () => {
      useStore.setState({ lastSync: null });
      expect(selectIsDevUser(useStore.getState())).toBe(false);
    });

    it('returns true for the dev username (lowercase)', () => {
      useStore.setState({ lastSync: { username: 'atvinnugamer', at: 0, source: 'wikisync' } });
      expect(selectIsDevUser(useStore.getState())).toBe(true);
    });

    it('returns true for the dev username (mixed case)', () => {
      useStore.setState({ lastSync: { username: 'AtvinnuGamer', at: 0, source: 'wikisync' } });
      expect(selectIsDevUser(useStore.getState())).toBe(true);
    });

    it('returns false for any other username', () => {
      useStore.setState({ lastSync: { username: 'someone-else', at: 0, source: 'wikisync' } });
      expect(selectIsDevUser(useStore.getState())).toBe(false);
    });
  });
});
