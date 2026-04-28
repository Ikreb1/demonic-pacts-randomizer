import { useStore } from '../state/store';

const WARNING =
  'Reset everything?\n\n' +
  'This permanently clears:\n' +
  ' • Your score\n' +
  ' • All unlocked regions (back to General + Varlamore)\n' +
  ' • Manually-completed tasks\n' +
  ' • Synced completions and last-sync info\n' +
  ' • The current roll and any locked task\n' +
  ' • Your saved proxy URL\n\n' +
  'There is no undo.';

export function ResetPanel() {
  const resetAll = useStore((s) => s.resetAll);

  function onClick() {
    if (confirm(WARNING)) resetAll();
  }

  return (
    <section className="panel">
      <h2>Reset</h2>
      <p className="hint">
        Wipe all locally-saved progress and settings for this site. Cannot be undone.
      </p>
      <button className="danger" onClick={onClick}>
        Reset all data
      </button>
    </section>
  );
}
