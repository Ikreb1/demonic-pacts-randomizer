// Downloads the OSRS Wiki demonic-pacts planner JS bundle and extracts the
// pact tree (nodes, positions, kinds, undirected adjacency, effect text)
// into src/data/pacts.json. The Demonic_Pacts_League/Demonic_Pacts wiki
// page only carries flat effect descriptions; the actual tree topology
// lives in the planner's JS bundle, so we go to the source.
//
// The asset filename is content-hashed and changes on every planner deploy.
// We discover it by scraping the planner index HTML, then download the
// hashed JS file and run the pure extractor in extract-planner-tree.mjs.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPactsFromBundle } from './extract-planner-tree.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'src', 'data', 'pacts.json');
const PLANNER_INDEX = 'https://tools.runescape.wiki/demonic-pacts/';

const MIN_PACTS = 50;

async function main() {
  console.log(`fetching planner index ${PLANNER_INDEX}`);
  const indexRes = await fetch(PLANNER_INDEX, {
    headers: {
      'User-Agent': 'demonic-pacts-randomizer (https://github.com/Breki/demonic-pacts-randomizer)',
    },
  });
  if (!indexRes.ok) {
    throw new Error(`planner index responded ${indexRes.status} ${indexRes.statusText}`);
  }
  const html = await indexRes.text();
  // The bundle reference looks like: <link rel="modulepreload" href="/demonic-pacts/assets/main-XXXXX.js"/>
  // We only need the main bundle — the data inlines there.
  const m = /["']\/demonic-pacts\/(assets\/main-[A-Za-z0-9_-]+\.js)["']/.exec(html);
  if (!m) {
    throw new Error('could not locate main JS bundle URL in planner index HTML');
  }
  const bundleUrl = `https://tools.runescape.wiki/demonic-pacts/${m[1]}`;
  console.log(`fetching planner bundle ${bundleUrl}`);
  const bundleRes = await fetch(bundleUrl, {
    headers: {
      'User-Agent': 'demonic-pacts-randomizer (https://github.com/Breki/demonic-pacts-randomizer)',
    },
  });
  if (!bundleRes.ok) {
    throw new Error(`planner bundle responded ${bundleRes.status} ${bundleRes.statusText}`);
  }
  const bundle = await bundleRes.text();
  console.log(`bundle size: ${bundle.length} chars`);

  const pacts = extractPactsFromBundle(bundle);

  if (pacts.length < MIN_PACTS) {
    throw new Error(
      `only ${pacts.length} pacts extracted (need ≥ ${MIN_PACTS}); the planner bundle ` +
        `format may have changed. Update extract-planner-tree.mjs.`,
    );
  }

  const kindCounts = pacts.reduce((acc, p) => ((acc[p.kind] = (acc[p.kind] ?? 0) + 1), acc), {});
  console.log(`extracted ${pacts.length} pacts`);
  console.log('  kinds:', kindCounts);

  mkdirSync(dirname(OUT), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    sourcePage: 'tools.runescape.wiki/demonic-pacts (planner JS bundle)',
    pacts,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
