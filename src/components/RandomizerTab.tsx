import { useEffect, useMemo, useState } from 'react';
import {
  useStore,
  selectActiveTask,
  selectRollTasks,
  ALL_TASKS_LIST,
  selectCompleted,
  selectPendingRegionPicks,
  selectRelicScore,
} from '../state/store';
import { eligibleByTier } from '../lib/filters';
import { TIERS, TIER_LABELS, TIER_POINTS } from '../types';
import type { Tier } from '../types';
import { TaskCard } from './TaskCard';
import { FlipCard } from './FlipCard';
import { LockedRelicsStrip } from './LockedRelicsStrip';
import { SimilarTasks } from './SimilarTasks';
import type { Region } from '../types';

const REVEAL_STAGGER_MS = 380;
const REVEAL_INITIAL_DELAY_MS = 250;
const PICK_SWEEP_MS = 450;

export function RandomizerTab() {
  const roll = useStore((s) => s.roll);
  const pickTier = useStore((s) => s.pickTier);
  const markActiveComplete = useStore((s) => s.markActiveComplete);
  const abandonActive = useStore((s) => s.abandonActive);
  const activeTask = useStore(selectActiveTask);
  const rollTasks = useStore(selectRollTasks);
  const completed = useStore(selectCompleted);
  const unlockedRegions = useStore((s) => s.unlockedRegions);
  const hasRoll = useStore((s) => s.currentRoll !== null);
  const score = useStore((s) => s.score);
  const points = useStore(selectRelicScore);
  const currentRoll = useStore((s) => s.currentRoll);
  const pendingRegionPicks = useStore(selectPendingRegionPicks);

  const [revealed, setRevealed] = useState<Set<Tier>>(new Set());
  const [pickedTier, setPickedTier] = useState<Tier | null>(null);

  // Auto-roll on first visit and after the modal closes — but never while a
  // region pick is pending, so the next roll can include the new region.
  useEffect(() => {
    if (!activeTask && !hasRoll && pendingRegionPicks === 0) roll();
  }, [activeTask, hasRoll, roll, pendingRegionPicks]);

  // Stagger the card flips whenever the active roll changes (including the
  // initial render after a refresh, where zustand-persist hands us a roll
  // synchronously).
  useEffect(() => {
    if (!currentRoll) return;
    setRevealed(new Set());
    setPickedTier(null);
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    TIERS.forEach((tier, i) => {
      timeouts.push(
        setTimeout(() => {
          setRevealed((prev) => {
            const next = new Set(prev);
            next.add(tier);
            return next;
          });
        }, REVEAL_INITIAL_DELAY_MS + i * REVEAL_STAGGER_MS),
      );
    });
    return () => timeouts.forEach(clearTimeout);
  }, [currentRoll]);

  function handlePick(tier: Tier) {
    if (pickedTier !== null) return;
    setPickedTier(tier);
    setTimeout(() => pickTier(tier), PICK_SWEEP_MS);
  }

  // NOTE: keep all hooks above the activeTask early-return below. Hooks called
  // after a conditional return change React's per-render hook count when
  // activeTask flips, which crashes the tree on Lock in / Mark complete.
  const totalsByTier = useMemo(() => {
    const out = { easy: 0, medium: 0, hard: 0, elite: 0, master: 0 } as Record<Tier, number>;
    const regionSet = new Set<Region>(unlockedRegions);
    for (const t of ALL_TASKS_LIST) {
      if (regionSet.has(t.region)) out[t.tier]++;
    }
    return out;
  }, [unlockedRegions]);

  if (activeTask) {
    const penalty = 2 * TIER_POINTS[activeTask.tier];
    return (
      <div className="randomizer locked">
        <Scoreboard score={score} points={points} />
        <LockedRelicsStrip />
        <div className="locked-banner">
          <span className="lock-icon" aria-hidden>🔒</span>
          <span>
            <b>Locked in.</b> Finish this task before rolling again.
          </span>
        </div>
        <TaskCard
          task={activeTask}
          variant="active"
          actions={
            <>
              <button className="primary" onClick={markActiveComplete}>
                Mark complete (+{TIER_POINTS[activeTask.tier]} pts)
              </button>
              <button
                className="link"
                onClick={() => {
                  if (
                    confirm(
                      `Abandon this task? You will lose ${penalty} points (2× the tier value) and reroll.`,
                    )
                  ) {
                    abandonActive();
                  }
                }}
              >
                Abandon (−{penalty} pts)
              </button>
            </>
          }
        />
        <SimilarTasks activeTask={activeTask} />
      </div>
    );
  }

  const buckets = eligibleByTier(ALL_TASKS_LIST, new Set<Region>(unlockedRegions), completed);

  function emptyMessage(tier: Tier, poolSize: number): { msg: string; celebratory?: boolean } {
    if (poolSize > 0) return { msg: 'Roll to see a candidate.' };
    const totalInRegions = totalsByTier[tier];
    if (totalInRegions === 0) {
      return { msg: `No ${TIER_LABELS[tier]} tasks in your unlocked regions yet.` };
    }
    return { msg: `All ${TIER_LABELS[tier]} tasks done in your unlocked regions. ✨`, celebratory: true };
  }

  return (
    <div className="randomizer">
      <Scoreboard score={score} points={points} />
      <LockedRelicsStrip />
      <div className="randomizer-toolbar">
        <p className="hint">
          One candidate per tier. Pick exactly one — that becomes your locked task until you mark it complete.
          Completing earns the tier&rsquo;s points; abandoning costs 2× the tier&rsquo;s points.
        </p>
      </div>
      <div className="tier-grid">
        {TIERS.map((tier) => {
          const task = rollTasks[tier];
          const poolSize = buckets[tier].length;
          const isRevealed = revealed.has(tier);
          const isPicked = pickedTier === tier;
          const isFading = pickedTier !== null && pickedTier !== tier;
          return (
            <div key={tier} className={`tier-column tier-${tier}`}>
              <h3 className="tier-heading">
                {TIER_LABELS[tier]} <span className="hint">({poolSize} eligible)</span>
              </h3>
              {task ? (
                <FlipCard
                  tier={tier}
                  task={task}
                  revealed={isRevealed}
                  picked={isPicked}
                  fading={isFading}
                  actions={
                    <button
                      className="primary"
                      disabled={!isRevealed || pickedTier !== null}
                      onClick={() => handlePick(tier)}
                    >
                      Lock in
                    </button>
                  }
                />
              ) : (
                (() => {
                  const { msg, celebratory } = emptyMessage(tier, poolSize);
                  return <div className={celebratory ? 'empty-tier empty-tier-done' : 'empty-tier'}>{msg}</div>;
                })()
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Scoreboard({ score, points }: { score: number; points: number }) {
  // Score = competitive tally with bonuses, penalties, half-points-on-sync.
  // Points = raw sum of TIER_POINTS over completed tasks; gates relic
  // tier unlocks and is the un-modified completion total.
  const scoreCls =
    score > 0
      ? 'scoreboard-cell scoreboard-cell-positive'
      : score < 0
        ? 'scoreboard-cell scoreboard-cell-negative'
        : 'scoreboard-cell';
  return (
    <div className="scoreboard" aria-live="polite">
      <div className={scoreCls}>
        <span className="scoreboard-label">Score</span>
        <span className="scoreboard-value">{score.toLocaleString()}</span>
      </div>
      <div className="scoreboard-divider" aria-hidden />
      <div className="scoreboard-cell">
        <span className="scoreboard-label">Points</span>
        <span className="scoreboard-value">{points.toLocaleString()}</span>
      </div>
    </div>
  );
}
