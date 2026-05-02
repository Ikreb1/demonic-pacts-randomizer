import { useRef } from 'react';
import { PERSIST_KEY, useStore } from '../state/store';

const RESET_WARNING =
  'Reset everything?\n\n' +
  'This permanently clears:\n' +
  ' • Your score\n' +
  ' • All unlocked regions (back to General + Varlamore)\n' +
  ' • Manually-completed tasks\n' +
  ' • Synced completions and last-sync info\n' +
  ' • The current roll and any locked task\n' +
  ' • Your saved proxy URL\n\n' +
  'There is no undo.';

const IMPORT_WARNING =
  'Replace ALL local progress with this backup?\n\n' +
  'Your current score, completions, regions, pacts, relics, and settings ' +
  'will be overwritten. There is no undo unless you exported first.';

function exportProgress() {
  const data = localStorage.getItem(PERSIST_KEY);
  if (!data) {
    window.alert('Nothing to export — no saved progress yet.');
    return;
  }
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dpl-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importProgress(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? '');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Couldn't parse that file as JSON. (${msg})`);
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      window.alert('Backup file did not contain a JSON object.');
      return;
    }
    if (!window.confirm(IMPORT_WARNING)) return;
    // Write the raw JSON exactly as exported. Zustand's persist middleware
    // will read it on the next page load, run `migrate` for any schema
    // bump (additive merge — see store.ts), and rehydrate the store.
    localStorage.setItem(PERSIST_KEY, text);
    location.reload();
  };
  reader.onerror = () => {
    window.alert(`Couldn't read the file: ${reader.error?.message ?? 'unknown error'}`);
  };
  reader.readAsText(file);
}

export function ResetPanel() {
  const resetAll = useStore((s) => s.resetAll);
  const fileRef = useRef<HTMLInputElement>(null);

  function onReset() {
    if (window.confirm(RESET_WARNING)) resetAll();
  }

  function onPickFile() {
    fileRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) importProgress(f);
    // Allow re-importing the same file later by resetting the input.
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <section className="panel">
      <h2>Backup & Reset</h2>
      <p className="hint">
        Save your progress to a file (or restore from one) so a browser cache wipe can't lose it.
        Reset clears everything locally — your hiscores row stays on the server until you remove it
        from the Hiscores tab.
      </p>
      <div className="reset-actions">
        <button onClick={exportProgress}>Export progress</button>
        <button onClick={onPickFile}>Import progress</button>
        <button className="danger" onClick={onReset}>
          Reset all data
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
    </section>
  );
}
