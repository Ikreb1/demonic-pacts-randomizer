import { useEffect, useState } from 'react';
import type { Region } from '../types';

const TILE_W = 140;
const TILE_GAP = 8;
const TILE_TOTAL = TILE_W + TILE_GAP;
const STRIP_LEN = 60;
const WINNER_INDEX = 52;
const SPIN_MS = 5500;

interface Props {
  choices: readonly Region[];
  onAccept: (region: Region) => void;
}

export function RegionRoulette({ choices, onAccept }: Props) {
  // Lock the winner, the strip layout, and the final scroll target on first
  // render so React re-renders during animation don't reshuffle anything.
  const [{ strip, winner, finalOffset }] = useState(() => buildSpin(choices));
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    // Kick the transition off on the next frame: render with offset=0 first,
    // then change to finalOffset so the browser interpolates between them.
    const id = requestAnimationFrame(() => {
      setPhase('spinning');
      setOffset(finalOffset);
    });
    return () => cancelAnimationFrame(id);
  }, [finalOffset]);

  return (
    <div className="roulette">
      <p className="roulette-caption">
        {phase === 'done' ? 'The wheel has spoken.' : 'Spinning the wheel of regions…'}
      </p>
      <div className="roulette-track" aria-live="polite">
        <div
          className="roulette-strip"
          style={{
            transform: `translateX(-${offset}px)`,
            transition:
              phase === 'spinning' ? `transform ${SPIN_MS}ms cubic-bezier(.18, .85, .22, 1)` : 'none',
          }}
          onTransitionEnd={() => setPhase('done')}
        >
          {strip.map((r, i) => (
            <div
              key={i}
              data-region={r}
              className={`roulette-tile${
                phase === 'done' && i === WINNER_INDEX ? ' roulette-tile-winner' : ''
              }`}
            >
              {r}
            </div>
          ))}
        </div>
        <div className="roulette-marker" aria-hidden />
      </div>
      {phase === 'done' && (
        <div className="modal-actions">
          <button className="primary" onClick={() => onAccept(winner)}>
            Unlock {winner}
          </button>
        </div>
      )}
    </div>
  );
}

function buildSpin(choices: readonly Region[]): {
  strip: Region[];
  winner: Region;
  finalOffset: number;
} {
  const winner = choices[Math.floor(Math.random() * choices.length)];
  const strip: Region[] = [];
  for (let i = 0; i < STRIP_LEN; i++) {
    if (i === WINNER_INDEX) {
      strip.push(winner);
      continue;
    }
    // Forbid: the previous tile, AND the winner if we're directly before it
    // (otherwise we could end up with the winner sitting next to itself).
    const forbidden = new Set<Region>();
    if (i > 0) forbidden.add(strip[i - 1]);
    if (i === WINNER_INDEX - 1) forbidden.add(winner);
    const pool = choices.filter((c) => !forbidden.has(c));
    // If everything is forbidden (only possible with 1–2 total choices),
    // fall back to the full list rather than throwing.
    const candidates = pool.length > 0 ? pool : choices;
    strip.push(candidates[Math.floor(Math.random() * candidates.length)]);
  }
  // Off-center jitter so the marker doesn't always hit dead-center on the winner.
  const jitter = (Math.random() - 0.5) * (TILE_W - 30);
  const finalOffset = WINNER_INDEX * TILE_TOTAL + TILE_W / 2 + jitter;
  return { strip, winner, finalOffset };
}
