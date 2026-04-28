import { useState } from 'react';
import { RandomizerTab } from './components/RandomizerTab';
import { CategoriesTab } from './components/CategoriesTab';
import { RegionFilter } from './components/RegionFilter';
import { SyncPanel } from './components/SyncPanel';
import { ResetPanel } from './components/ResetPanel';
import { RegionUnlockModal } from './components/RegionUnlockModal';
import { RelicUnlockModal } from './components/RelicUnlockModal';

type TabId = 'randomizer' | 'categories';

export function App() {
  const [tab, setTab] = useState<TabId>('randomizer');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Demonic Pacts Randomizer</h1>
        <p className="tagline">Roll five tasks, lock one in, complete it, roll again.</p>
      </header>

      <aside className="sidebar">
        <RegionFilter />
        <SyncPanel />
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
        </nav>
        <div className="tab-panel" role="tabpanel">
          {tab === 'randomizer' ? <RandomizerTab /> : <CategoriesTab />}
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
