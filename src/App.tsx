import { useEffect, useState } from 'react';
import { RandomizerTab } from './components/RandomizerTab';
import { CategoriesTab } from './components/CategoriesTab';
import { EligibleTab } from './components/EligibleTab';
import { PactsTab } from './components/PactsTab';
import { HiscoresTab } from './components/HiscoresTab';
import { RegionFilter } from './components/RegionFilter';
import { SyncPanel } from './components/SyncPanel';
import { ResetPanel } from './components/ResetPanel';
import { DevPanel } from './components/DevPanel';
import { RegionUnlockModal } from './components/RegionUnlockModal';
import { RelicUnlockModal } from './components/RelicUnlockModal';
import { useStore, selectRelicScore } from './state/store';
import { submitHiscoreFromState } from './lib/hiscoresAutoSubmit';

type TabId = 'randomizer' | 'categories' | 'eligible' | 'pacts' | 'hiscores';

// Debounce window: a flurry of completions in quick succession (e.g. a
// sync that lands a dozen new tasks at once) coalesces into one PUT.
const HISCORES_SUBMIT_DEBOUNCE_MS = 4000;

export function App() {
  const [tab, setTab] = useState<TabId>('randomizer');

  // Auto-submit hiscores when score/points change after a wikisync run.
  // Lives at the App level so it's mounted exactly once and survives tab
  // switches. The store stays free of fetch — see hiscoresAutoSubmit.ts.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.lastSync?.source !== 'wikisync') return;
      const scoreChanged = s.score !== prev.score;
      const pointsChanged = selectRelicScore(s) !== selectRelicScore(prev);
      const syncTimestampChanged = s.lastSync.at !== prev.lastSync?.at;
      if (!scoreChanged && !pointsChanged && !syncTimestampChanged) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        void submitHiscoreFromState(useStore.getState());
      }, HISCORES_SUBMIT_DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Demonic Pacts Randomizer</h1>
        <p className="tagline">Roll five tasks, lock one in, complete it, roll again.</p>
      </header>

      <aside className="sidebar">
        <RegionFilter />
        <SyncPanel />
        <DevPanel />
        <ResetPanel />
      </aside>

      <main className="main">
        <nav className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'randomizer'}
            className={tab === 'randomizer' ? 'tab tab-active' : 'tab'}
            onClick={() => setTab('randomizer')}
          >
            Randomizer
          </button>
          <button
            role="tab"
            aria-selected={tab === 'categories'}
            className={tab === 'categories' ? 'tab tab-active' : 'tab'}
            onClick={() => setTab('categories')}
          >
            Categories
          </button>
          <button
            role="tab"
            aria-selected={tab === 'eligible'}
            className={tab === 'eligible' ? 'tab tab-active' : 'tab'}
            onClick={() => setTab('eligible')}
          >
            Can Do Now
          </button>
          <button
            role="tab"
            aria-selected={tab === 'pacts'}
            className={tab === 'pacts' ? 'tab tab-active' : 'tab'}
            onClick={() => setTab('pacts')}
          >
            Pacts
          </button>
          <button
            role="tab"
            aria-selected={tab === 'hiscores'}
            className={tab === 'hiscores' ? 'tab tab-active' : 'tab'}
            onClick={() => setTab('hiscores')}
          >
            Hiscores
          </button>
        </nav>
        <div className="tab-panel" role="tabpanel">
          {tab === 'randomizer' && <RandomizerTab />}
          {tab === 'categories' && <CategoriesTab />}
          {tab === 'eligible' && <EligibleTab />}
          {tab === 'pacts' && <PactsTab />}
          {tab === 'hiscores' && <HiscoresTab />}
        </div>
      </main>

      {/* Region modal mounted before relic modal so when both render they
          stack predictably; both early-return when their pending count is 0
          so in practice only one is visible at a time. */}
      <RegionUnlockModal />
      <RelicUnlockModal />
    </div>
  );
}
