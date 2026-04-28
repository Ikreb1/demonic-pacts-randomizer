// Fetches Demonic_Pacts_League/Relics wikitext from the OSRS Wiki and
// writes a normalized relics.json into src/data/. Safe to re-run.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRelicsWikitext } from './parse-relics-wikitext.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'src', 'data', 'relics.json');
const PAGE = 'Demonic_Pacts_League/Relics';
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

  const { relics, warnings } = parseRelicsWikitext(wikitext);

  if (warnings.length) {
    console.warn(`parser warnings (${warnings.length}):`);
    for (const w of warnings.slice(0, 20)) console.warn('  -', w);
    if (warnings.length > 20) console.warn(`  ... ${warnings.length - 20} more`);
  }

  if (relics.length < 20) {
    throw new Error(`only ${relics.length} relics parsed; refusing to write`);
  }

  const tierCounts = relics.reduce((acc, r) => ((acc[r.tier] = (acc[r.tier] ?? 0) + 1), acc), {});
  console.log(`parsed ${relics.length} relics`);
  console.log('  tiers:', tierCounts);

  mkdirSync(dirname(OUT), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    sourcePage: PAGE,
    relics,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
