import { useStore, selectPendingRegionPicks } from '../state/store';

export function DevPanel() {
  const queueRegion = useStore((s) => s.devQueueRegionPick);
  const pendingRegions = useStore(selectPendingRegionPicks);

  return (
    <section className="panel">
      <h2>Dev / Test</h2>
      <p className="hint">
        Force-trigger modals without grinding completions. State clears on
        page reload or Reset.
      </p>
      <div className="dev-panel-actions">
        <button type="button" onClick={queueRegion}>
          Trigger region pick
        </button>
        {pendingRegions > 0 && (
          <span className="dev-panel-status">
            {pendingRegions} pending
          </span>
        )}
      </div>
    </section>
  );
}
