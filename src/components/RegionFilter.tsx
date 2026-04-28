import { useStore, selectCompletedCount, selectNextUnlockThreshold } from '../state/store';
import { ALWAYS_UNLOCKED, REGIONS, REGION_UNLOCK_THRESHOLDS } from '../types';

export function RegionFilter() {
  const unlocked = useStore((s) => s.unlockedRegions);
  const completedCount = useStore(selectCompletedCount);
  const nextThreshold = useStore(selectNextUnlockThreshold);
  const set = new Set(unlocked);

  return (
    <section className="panel">
      <h2>Regions</h2>
      <p className="hint">
        General &amp; Varlamore are starters. Earn additional region picks at{' '}
        {REGION_UNLOCK_THRESHOLDS.join(', ')} completed tasks.
      </p>
      <ul className="region-list">
        {REGIONS.map((r) => {
          const isStarter = (ALWAYS_UNLOCKED as readonly string[]).includes(r);
          const isUnlocked = set.has(r);
          let badge: string | null = null;
          let cls = 'region';
          if (isStarter) {
            badge = 'starter';
            cls += ' region-starter';
          } else if (isUnlocked) {
            badge = 'unlocked';
            cls += ' region-unlocked';
          } else {
            cls += ' region-locked';
          }
          return (
            <li key={r} className={cls} data-region={r}>
              <span className="region-swatch" aria-hidden />
              <span className="region-name">
                {!isStarter && !isUnlocked && <span aria-hidden>🔒 </span>}
                {r}
              </span>
              {badge && <span className={`badge badge-${badge}`}>{badge}</span>}
            </li>
          );
        })}
      </ul>
      {nextThreshold !== null && (
        <p className="hint region-next">
          Next region pick at <b>{nextThreshold}</b> completed ({completedCount}/{nextThreshold}).
        </p>
      )}
      {nextThreshold === null && unlocked.length > ALWAYS_UNLOCKED.length && (
        <p className="hint region-next">All region picks earned. ✨</p>
      )}
    </section>
  );
}
