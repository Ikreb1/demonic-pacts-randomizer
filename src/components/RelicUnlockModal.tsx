import { useEffect, useRef, useState } from 'react';
import {
  useStore,
  selectPendingRelicPicks,
  selectNextPendingRelicTier,
  selectPendingReloadedPicks,
  selectAvailableBonusRelics,
  relicsForTier,
  RANDOM_RELIC_BONUS,
} from '../state/store';
import { RELIC_TIER_THRESHOLDS, RELIC_TIERS } from '../types';
import type { Relic, RelicTier } from '../types';
import { RelicIcon } from './RelicIcon';

const SPIN_INTERVALS_MS = [400, 380, 350, 320, 290, 260, 220, 180, 140, 100, 70, 50] as const;
const CELEBRATE_MS = 2200;

type Mode = 'choosing' | 'manual' | 'spinning' | 'celebrating';
type PickKind = 'tier' | 'reloaded';
type RelicRef = { tier: RelicTier; name: string };

function sameRelic(a: RelicRef | null, b: Relic): boolean {
  return a !== null && a.tier === b.tier && a.name === b.name;
}

export function RelicUnlockModal() {
  const pending = useStore(selectPendingRelicPicks);
  const tier = useStore(selectNextPendingRelicTier);
  const pendingReloaded = useStore(selectPendingReloadedPicks);
  const bonusCandidates = useStore(selectAvailableBonusRelics);
  const lockRelic = useStore((s) => s.lockRelic);
  const lockReloadedRelic = useStore((s) => s.lockReloadedRelic);

  const [mode, setMode] = useState<Mode>('choosing');
  const [selected, setSelected] = useState<RelicRef | null>(null);
  const [highlighted, setHighlighted] = useState<RelicRef | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  };

  // Decide which kind of pick this opening represents. Tier picks take
  // priority over Reloaded bonus picks (they're earlier in the user's flow).
  const pickKind: PickKind | null =
    tier !== null ? 'tier' : pendingReloaded === 1 ? 'reloaded' : null;

  // Reset selection state whenever the modal advances to a new pick. We key
  // off both `tier` and `pickKind` so the transition from a tier pick to the
  // Reloaded bonus pick clears state cleanly within the same modal opening.
  useEffect(() => {
    setMode('choosing');
    setSelected(null);
    setHighlighted(null);
    clearTimers();
    return clearTimers;
  }, [tier, pickKind]);

  if (pending === 0 && pendingReloaded === 0) return null;
  if (pickKind === null) return null;

  // Candidate pool depends on the pick kind.
  const candidates: readonly Relic[] =
    pickKind === 'tier' && tier !== null ? relicsForTier(tier) : bonusCandidates;

  function startManual() {
    setMode('manual');
    setSelected(null);
  }

  function backToChooser() {
    clearTimers();
    setMode('choosing');
    setSelected(null);
    setHighlighted(null);
  }

  function selectCard(c: Relic) {
    if (mode !== 'manual') return;
    setSelected({ tier: c.tier, name: c.name });
  }

  function commitSelected(viaRandom: boolean, ref: RelicRef) {
    if (pickKind === 'tier') {
      lockRelic(ref.tier, ref.name, viaRandom);
    } else {
      lockReloadedRelic(ref.tier, ref.name, viaRandom);
    }
    // The pickKind/tier-change effect resets state once the store updates.
  }

  function handleConfirm() {
    if (mode !== 'manual' || !selected) return;
    commitSelected(false, selected);
  }

  function startRandom() {
    if (candidates.length === 0) return;
    clearTimers();
    setMode('spinning');
    setSelected(null);
    setHighlighted(null);

    const winnerIdx = Math.floor(Math.random() * candidates.length);
    const winner = candidates[winnerIdx];

    let cumulative = 0;
    let prevIdx = -1;
    for (let i = 0; i < SPIN_INTERVALS_MS.length; i++) {
      cumulative += SPIN_INTERVALS_MS[i];
      const isLast = i === SPIN_INTERVALS_MS.length - 1;
      let targetIdx: number;
      if (isLast) {
        targetIdx = winnerIdx;
      } else {
        targetIdx = Math.floor(Math.random() * candidates.length);
        if (candidates.length > 1 && targetIdx === prevIdx) {
          targetIdx = (targetIdx + 1) % candidates.length;
        }
      }
      prevIdx = targetIdx;
      timersRef.current.push(
        setTimeout(() => {
          const c = candidates[targetIdx];
          setHighlighted({ tier: c.tier, name: c.name });
          if (isLast) setMode('celebrating');
        }, cumulative),
      );
    }
    // Random commits itself — no Confirm step. The celebrate hold is the
    // visible payoff before the relic is locked.
    timersRef.current.push(
      setTimeout(() => {
        commitSelected(true, { tier: winner.tier, name: winner.name });
      }, cumulative + CELEBRATE_MS),
    );
  }

  const heading = headingFor(mode, pickKind, tier);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="relic-unlock-title"
    >
      <div className="modal modal-wide">
        <h2 id="relic-unlock-title">
          <span className="relic-modal-glyph" aria-hidden>
            {pickKind === 'reloaded' ? '🔁' : '🔮'}
          </span>{' '}
          {heading}
        </h2>
        {pending > 1 && mode === 'choosing' && pickKind === 'tier' && (
          <p className="hint">
            You have <b>{pending}</b> relic picks to make.
          </p>
        )}

        {mode === 'choosing' && (
          <ChooseModeScreen
            pickKind={pickKind}
            tier={tier}
            onRandom={startRandom}
            onManual={startManual}
          />
        )}

        {mode !== 'choosing' && (
          <>
            <CandidateList
              pickKind={pickKind}
              candidates={candidates}
              mode={mode}
              highlighted={highlighted}
              selected={selected}
              onSelect={selectCard}
            />

            {mode === 'manual' && (
              <div className="modal-actions">
                <button type="button" className="link" onClick={backToChooser}>
                  ← Back
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!selected}
                  onClick={handleConfirm}
                >
                  Confirm
                </button>
              </div>
            )}
            {/* No buttons during spinning/celebrating — the random path is
                committal and locks itself once the celebrate hold elapses. */}
          </>
        )}
      </div>
    </div>
  );
}

function headingFor(mode: Mode, pickKind: PickKind, tier: RelicTier | null): string {
  if (pickKind === 'reloaded') {
    switch (mode) {
      case 'choosing':
        return 'Reloaded — Bonus Pick — How will you choose?';
      case 'manual':
        return 'Reloaded — Pick a relic from a prior tier';
      case 'spinning':
        return 'Reloaded — Spinning…';
      case 'celebrating':
        return 'Reloaded — The wheel has chosen!';
    }
  }
  const t = tier ?? 1;
  switch (mode) {
    case 'choosing':
      return `Tier ${t} — How will you choose?`;
    case 'manual':
      return `Tier ${t} — Pick your relic`;
    case 'spinning':
      return `Tier ${t} — Spinning…`;
    case 'celebrating':
      return `Tier ${t} — The wheel has chosen!`;
  }
}

function ChooseModeScreen({
  pickKind,
  tier,
  onRandom,
  onManual,
}: {
  pickKind: PickKind;
  tier: RelicTier | null;
  onRandom: () => void;
  onManual: () => void;
}) {
  const blurb =
    pickKind === 'reloaded' ? (
      <>
        Reloaded grants you a second relic from any tier below 7. Choose how to pick.
      </>
    ) : (
      <>
        You&rsquo;ve crossed the {RELIC_TIER_THRESHOLDS[tier ?? 1].toLocaleString()}-point
        threshold. How do you want to choose your relic? This decision is permanent.
      </>
    );
  return (
    <div className="relic-choose-mode">
      <p>{blurb}</p>
      <div className="relic-choose-mode-options">
        <button type="button" className="relic-choose-mode-btn relic-choose-mode-btn-random" onClick={onRandom}>
          <span className="relic-choose-mode-bonus">
            +{RANDOM_RELIC_BONUS.toLocaleString()} score
          </span>
          <span className="relic-choose-mode-icon" aria-hidden>
            🎲
          </span>
          <span className="relic-choose-mode-title">Random Roll</span>
          <span className="relic-choose-mode-desc">
            Let fate decide. The wheel spins, lands on a relic, and locks it in. No takebacks —
            but you pocket a <b>+{RANDOM_RELIC_BONUS.toLocaleString()}</b> score bonus for trusting it.
          </span>
        </button>
        <button type="button" className="relic-choose-mode-btn" onClick={onManual}>
          <span className="relic-choose-mode-icon" aria-hidden>
            ✋
          </span>
          <span className="relic-choose-mode-title">Pick Yourself</span>
          <span className="relic-choose-mode-desc">
            Browse the options and choose deliberately. You&rsquo;ll confirm before locking.
          </span>
        </button>
      </div>
    </div>
  );
}

// Renders the candidate cards. Tier picks all share one tier and lay out as
// a flat list. Reloaded picks span tiers 1-6 with exactly 2 available per
// tier (3 relics minus the one the player locked at that threshold), so we
// render a 6-row grid with the tier number as a leading badge.
function CandidateList({
  candidates,
  pickKind,
  mode,
  highlighted,
  selected,
  onSelect,
}: {
  pickKind: PickKind;
  candidates: readonly Relic[];
  mode: Mode;
  highlighted: RelicRef | null;
  selected: RelicRef | null;
  onSelect: (r: Relic) => void;
}) {
  const renderCard = (r: Relic) => {
    const isCycling = mode === 'spinning' && sameRelic(highlighted, r);
    const isWinning = mode === 'celebrating' && sameRelic(highlighted, r);
    const isSelected = mode === 'manual' && sameRelic(selected, r);
    const cls = [
      'relic-card',
      mode === 'manual' && 'relic-card-clickable',
      isCycling && 'relic-card-highlighted',
      isWinning && 'relic-card-winner',
      isSelected && 'relic-card-selected',
    ]
      .filter(Boolean)
      .join(' ');
    const interactable = mode === 'manual';
    return (
      <div
        key={`${r.tier}/${r.name}`}
        className={cls}
        role={interactable ? 'button' : undefined}
        tabIndex={interactable ? 0 : -1}
        aria-pressed={isSelected}
        aria-disabled={!interactable}
        onClick={interactable ? () => onSelect(r) : undefined}
        onKeyDown={
          interactable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(r);
                }
              }
            : undefined
        }
      >
        <header className="relic-card-head">
          <RelicIcon name={r.name} size={48} className="relic-card-icon" />
          <h4 className="relic-card-name">{r.name}</h4>
        </header>
      </div>
    );
  };

  if (pickKind === 'tier') {
    return (
      <ul className="relic-choice-list">
        {candidates.map((r) => (
          <li key={`${r.tier}/${r.name}`}>{renderCard(r)}</li>
        ))}
      </ul>
    );
  }

  const byTier = new Map<RelicTier, Relic[]>();
  for (const r of candidates) {
    if (!byTier.has(r.tier)) byTier.set(r.tier, []);
    byTier.get(r.tier)!.push(r);
  }
  return (
    <div className="relic-choice-list relic-choice-list-grid">
      {RELIC_TIERS.filter((t) => t < 7 && byTier.has(t)).map((t) => (
        <div key={t} className="relic-choice-row">
          <div className="relic-choice-tier-badge" aria-hidden>
            <span className="relic-choice-tier-label">Tier</span>
            <span className="relic-choice-tier-number">{t}</span>
          </div>
          <div className="relic-choice-row-cards">
            {byTier.get(t)!.map(renderCard)}
          </div>
        </div>
      ))}
    </div>
  );
}
