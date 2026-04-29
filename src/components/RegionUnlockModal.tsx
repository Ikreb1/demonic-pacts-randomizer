import { useState } from 'react';
import {
  useStore,
  selectPendingRegionPicks,
  selectNextPickIsForcedKaramja,
  RANDOM_REGION_BONUS,
} from '../state/store';
import { ALWAYS_UNLOCKED, FIRST_FORCED_REGION, REGIONS } from '../types';
import type { Region } from '../types';
import { RegionRoulette } from './RegionRoulette';

export function RegionUnlockModal() {
  const pending = useStore(selectPendingRegionPicks);
  const forced = useStore(selectNextPickIsForcedKaramja);
  const unlocked = useStore((s) => s.unlockedRegions);
  const unlockRegion = useStore((s) => s.unlockRegion);
  const [rolling, setRolling] = useState(false);

  if (pending === 0) return null;

  const lockedChoices = REGIONS.filter(
    (r) => !unlocked.includes(r) && !(ALWAYS_UNLOCKED as readonly Region[]).includes(r),
  );

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="region-unlock-title">
      <div className="modal modal-wide">
        <h2 id="region-unlock-title">
          {forced
            ? 'A new region awaits'
            : rolling
            ? 'Spinning…'
            : 'Choose your next region'}
        </h2>
        {pending > 1 && !rolling && (
          <p className="hint">
            You have <b>{pending}</b> region picks to make.
          </p>
        )}
        {forced ? (
          <>
            <p>
              You&rsquo;ve completed enough tasks to unlock your first additional region. By tradition,
              this one is fixed: <b>{FIRST_FORCED_REGION}</b>.
            </p>
            <div className="modal-actions">
              <button className="primary" onClick={() => unlockRegion(FIRST_FORCED_REGION)}>
                Unlock {FIRST_FORCED_REGION}
              </button>
            </div>
          </>
        ) : rolling ? (
          <RegionRoulette
            choices={lockedChoices}
            onAccept={(r) => {
              setRolling(false);
              unlockRegion(r, true);
            }}
          />
        ) : (
          <>
            <p>Pick a region to permanently add to your roll pool. This choice cannot be undone.</p>
            <p className="hint region-bonus-hint">
              🎲 Spin the wheel instead and earn a{' '}
              <b>+{RANDOM_REGION_BONUS.toLocaleString()}</b> score bonus for letting fate decide.
            </p>
            <ul className="region-choice-list">
              {lockedChoices.map((r) => (
                <li key={r}>
                  <button data-region={r} onClick={() => unlockRegion(r)}>
                    {r}
                  </button>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button
                className="primary"
                disabled={lockedChoices.length === 0}
                onClick={() => setRolling(true)}
              >
                🎲 Spin the wheel (+{RANDOM_REGION_BONUS.toLocaleString()} score)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
