import { useState } from 'react';
import {
  useStore,
  ALL_PACTS_LIST,
  selectUnlockedPactIds,
  selectPactResetsRemaining,
  selectEligiblePactCount,
  selectPactRollsRemaining,
  selectPactById,
} from '../state/store';
import { MAX_PACT_RESETS, MAX_PACTS_UNLOCKED } from '../types';
import { PactsTree } from './PactsTree';

export function PactsTab() {
  const unlocked = useStore(selectUnlockedPactIds);
  const resetsLeft = useStore(selectPactResetsRemaining);
  const eligibleCount = useStore(selectEligiblePactCount);
  const rollsRemaining = useStore(selectPactRollsRemaining);
  const rollPact = useStore((s) => s.rollPact);
  const resetPacts = useStore((s) => s.resetPacts);
  const [recentId, setRecentId] = useState<string | null>(null);

  const unlockedSet = new Set(unlocked);
  const atCap = rollsRemaining === 0;
  const canRoll = !atCap && eligibleCount > 0;

  function handleRoll() {
    const picked = rollPact();
    if (picked) setRecentId(picked);
  }

  function handleReset() {
    if (resetsLeft === 0) return;
    if (
      !confirm(
        `Reset all unlocked pacts? This will use one of your ${resetsLeft} remaining resets ` +
          `(out of ${MAX_PACT_RESETS} total). There is no undo.`,
      )
    ) {
      return;
    }
    resetPacts();
    setRecentId(null);
  }

  const recentPact = recentId ? selectPactById(recentId) : null;
  const rollDisabledTitle = atCap
    ? `You've hit the ${MAX_PACTS_UNLOCKED}-pact cap. Reset to roll again.`
    : eligibleCount === 0
      ? 'No adjacent nodes left to roll.'
      : undefined;

  return (
    <div className="pacts-tab">
      <header className="pacts-header">
        <div className="pacts-header-status">
          <span className="pacts-status-pill">
            {unlocked.length} / {MAX_PACTS_UNLOCKED} unlocked
          </span>
          <span className="pacts-status-pill">{eligibleCount} on the frontier</span>
          <span className="pacts-status-pill">
            {resetsLeft} / {MAX_PACT_RESETS} resets left
          </span>
        </div>
        <div className="pacts-header-actions">
          <button
            type="button"
            className="primary"
            disabled={!canRoll}
            onClick={handleRoll}
            title={rollDisabledTitle}
          >
            🎲 Roll a pact
          </button>
          <button
            type="button"
            className="danger"
            disabled={resetsLeft === 0}
            onClick={handleReset}
            title={resetsLeft === 0 ? 'No resets remaining' : undefined}
          >
            Reset tree
          </button>
        </div>
      </header>

      {recentPact && (
        <div className="pacts-recent" aria-live="polite">
          <span className="pacts-recent-glyph" aria-hidden>
            ✨
          </span>
          Just unlocked: <strong>{recentPact.name}</strong>
          <span className={`pacts-recent-kind pacts-recent-kind-${recentPact.kind}`}>
            {recentPact.kind}
          </span>
        </div>
      )}

      {atCap && (
        <p className="hint pacts-empty-hint">
          You've reached the {MAX_PACTS_UNLOCKED}-pact cap. Reset the tree to roll a different
          path.
        </p>
      )}

      {!atCap && unlocked.length === 1 && !recentPact && (
        <p className="hint pacts-empty-hint">
          You start with the central pact already unlocked (it counts toward the {MAX_PACTS_UNLOCKED}-pact cap).
          Each roll picks one of its neighbors, then expands outward — weighted toward paths that lead to a capstone.
        </p>
      )}

      <PactsTree pacts={ALL_PACTS_LIST} unlocked={unlockedSet} recentId={recentId} />
    </div>
  );
}
