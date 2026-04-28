// Fetches Demonic_Pacts_League/Tasks wikitext from the OSRS Wiki and
// writes a normalized tasks.json into src/data/. Safe to re-run.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWikitext } from './parse-wikitext.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'src', 'data', 'tasks.json');
const PAGE = 'Demonic_Pacts_League/Tasks';
const URL =
  `https://oldschool.runescape.wiki/api.php?action=parse&page=${encodeURIComponent(PAGE)}&prop=wikitext&format=json&origin=*`;

async function main() {
  console.log(`fetching ${URL}`);
  const res = await fetch(URL, {
    headers: {
      'User-Agent': 'demonic-pacts-randomizer (https://github.com/Breki/demonic-pacts-randomizer)',
    },
  });
  if (!res.ok) {
    throw new Error(`wiki API responded ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const wikitext = json?.parse?.wikitext?.['*'];
  if (typeof wikitext !== 'string') {
    throw new Error('unexpected wiki API shape; missing parse.wikitext["*"]');
  }
  console.log(`wikitext length: ${wikitext.length} chars`);

  const { tasks, warnings } = parseWikitext(wikitext);

  if (warnings.length) {
    console.warn(`parser warnings (${warnings.length}):`);
    for (const w of warnings.slice(0, 20)) console.warn('  -', w);
    if (warnings.length > 20) console.warn(`  ... ${warnings.length - 20} more`);
  }

  if (tasks.length < 100) {
    throw new Error(`only ${tasks.length} tasks parsed; refusing to write`);
  }

  const tierCounts = tasks.reduce((acc, t) => ((acc[t.tier] = (acc[t.tier] ?? 0) + 1), acc), {});
  const regionCounts = tasks.reduce((acc, t) => ((acc[t.region] = (acc[t.region] ?? 0) + 1), acc), {});
  console.log(`parsed ${tasks.length} tasks`);
  console.log('  tiers:  ', tierCounts);
  console.log('  regions:', regionCounts);

  mkdirSync(dirname(OUT), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    sourcePage: PAGE,
    tasks,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
