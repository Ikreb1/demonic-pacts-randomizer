import { useStore, selectLockedRelics, selectBonusRelics } from '../state/store';
import { RELIC_TIERS } from '../types';
import type { RelicTier } from '../types';
import { RelicIcon } from './RelicIcon';

export function LockedRelicsStrip() {
  const locked = useStore(selectLockedRelics);
  const bonus = useStore(selectBonusRelics);
  const lockedTiers = RELIC_TIERS.filter((t) => locked[t] !== null);
  if (lockedTiers.length === 0 && bonus.length === 0) return null;
  return (
    <div className="locked-relics-strip" aria-label="Locked relics">
      {lockedTiers.map((tier) => (
        <RelicChip key={`p-${tier}`} tier={tier} name={locked[tier] as string} />
      ))}
      {bonus.map((b, i) => (
        <RelicChip key={`b-${b.tier}-${i}`} tier={b.tier} name={b.name} isBonus />
      ))}
    </div>
  );
}

function RelicChip({
  tier,
  name,
  isBonus,
}: {
  tier: RelicTier;
  name: string;
  isBonus?: boolean;
}) {
  const cls = isBonus ? 'relic-chip relic-chip-bonus' : 'relic-chip';
  const title = isBonus ? `Reloaded bonus from Tier ${tier}` : `Tier ${tier} relic`;
  return (
    <span className={cls} data-relic-tier={tier} title={title}>
      <RelicIcon name={name} size={28} className="relic-chip-icon-wrap" />
      <span className="relic-chip-tier">
        {isBonus && (
          <span className="relic-chip-bonus-glyph" aria-hidden>
            🔁
          </span>
        )}
        T{tier}
      </span>
      <span className="relic-chip-name">{name}</span>
    </span>
  );
}
