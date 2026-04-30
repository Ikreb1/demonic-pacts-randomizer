// Downloads wiki icons for each pact and annotates src/data/pacts.json
// with their wiki icon codes. The OSRS wiki page lists ~70 unique pact
// effects with codes like AA, B1, H10; the planner has 132 nodes, many of
// which share an effect (and therefore an icon). We match each planner
// node to a wiki entry by effect-text similarity, then download each
// unique icon once into public/pact-icons/.
//
// Run after `npm run fetch:pacts`. Re-running is safe — already-downloaded
// icons are skipped.

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACTS_JSON = resolve(HERE, '..', 'src', 'data', 'pacts.json');
const ICONS_DIR = resolve(HERE, '..', 'public', 'pact-icons');
const WIKI_PAGE = 'Demonic_Pacts_League/Demonic_Pacts';
const WIKI_API = `https://oldschool.runescape.wiki/api.php?action=parse&page=${encodeURIComponent(WIKI_PAGE)}&prop=wikitext&format=json&origin=*`;

async function main() {
  const pactsFile = JSON.parse(readFileSync(PACTS_JSON, 'utf8'));
  const pacts = pactsFile.pacts;
  console.log(`loaded ${pacts.length} pacts from pacts.json`);

  console.log(`fetching wiki page wikitext`);
  const wikiRes = await fetch(WIKI_API, {
    headers: {
      'User-Agent': 'demonic-pacts-randomizer (https://github.com/Breki/demonic-pacts-randomizer)',
    },
  });
  if (!wikiRes.ok) throw new Error(`wiki API ${wikiRes.status} ${wikiRes.statusText}`);
  const wikiJson = await wikiRes.json();
  const wikitext = wikiJson?.parse?.wikitext?.['*'];
  if (typeof wikitext !== 'string') throw new Error('unexpected wiki API shape');

  const wikiEntries = parseWikiPactRows(wikitext);
  console.log(`parsed ${wikiEntries.length} wiki entries`);

  // Build a normalized-effect-text → iconCode lookup.
  const wikiByNormalizedEffect = new Map();
  for (const w of wikiEntries) {
    const key = normalizeEffect(w.effect);
    if (!key) continue;
    if (!wikiByNormalizedEffect.has(key)) wikiByNormalizedEffect.set(key, w.iconCode);
  }

  // Match planner nodes to wiki entries by best-effort text comparison.
  // For each pact, try its `effect` text first (longer, more specific),
  // then fall back to `name`. Use both exact normalized match and prefix
  // match to catch close-but-not-identical wordings.
  let matched = 0;
  let unmatched = 0;
  for (const p of pacts) {
    const code = matchToWiki(p, wikiByNormalizedEffect, wikiEntries);
    if (code) {
      p.iconCode = code;
      matched++;
    } else {
      delete p.iconCode;
      unmatched++;
    }
  }
  console.log(`matched ${matched} pacts to wiki icons; ${unmatched} unmatched`);

  // Download each unique icon (once).
  const uniqueCodes = [...new Set(pacts.map((p) => p.iconCode).filter(Boolean))];
  console.log(`downloading ${uniqueCodes.length} unique icons to ${ICONS_DIR}`);
  mkdirSync(ICONS_DIR, { recursive: true });
  let downloaded = 0;
  let cached = 0;
  let failed = 0;
  for (const code of uniqueCodes) {
    const outPath = resolve(ICONS_DIR, `Pact_${code}.png`);
    if (existsSync(outPath) && statSync(outPath).size > 100) {
      cached++;
      continue;
    }
    const url = `https://oldschool.runescape.wiki/w/Special:FilePath/Pact_${code}_%28Demonic_Pacts_League%29.png`;
    let succeeded = false;
    // Wiki throttles bursts (HTTP 429). Retry with backoff so a single
    // run can usually grab everything without manual re-runs.
    for (let attempt = 1; attempt <= 4 && !succeeded; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'demonic-pacts-randomizer (https://github.com/Breki/demonic-pacts-randomizer)',
          },
          redirect: 'follow',
        });
        if (res.status === 429) {
          await sleep(500 * attempt * attempt);
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 100) throw new Error(`response too small (${buf.length} bytes)`);
        writeFileSync(outPath, buf);
        downloaded++;
        succeeded = true;
      } catch (err) {
        if (attempt === 4) {
          console.warn(`  ! failed Pact_${code}: ${err.message}`);
          failed++;
        } else {
          await sleep(500 * attempt);
        }
      }
    }
    // Polite per-request delay so we don't hammer the wiki.
    await sleep(150);
  }
  console.log(`icons: ${downloaded} downloaded, ${cached} already cached, ${failed} failed`);

  // Re-write pacts.json with iconCode annotations.
  pactsFile.iconsGeneratedAt = new Date().toISOString();
  writeFileSync(PACTS_JSON, JSON.stringify(pactsFile, null, 2) + '\n', 'utf8');
  console.log(`wrote ${PACTS_JSON} with iconCode annotations`);
}

// ---- wiki wikitable parser ----
//
// The Skill tree section is a single wikitable where each row is:
//   |[[File:Pact AA (Demonic Pacts League).png|50px]]
//   |Effect description text spanning one or more lines
function parseWikiPactRows(wikitext) {
  const rows = [];
  const tableRe = /==\s*Skill tree\s*==[\s\S]*?\{\|[\s\S]*?\n\|\}/;
  const tableMatch = tableRe.exec(wikitext);
  if (!tableMatch) return rows;
  const tableBody = tableMatch[0];
  // Each row starts with `|-`. Within a row, find the icon File link and
  // the effect cell (the next `|` after the icon).
  const rowChunks = tableBody.split(/^\s*\|-\s*$/m);
  for (const chunk of rowChunks) {
    const iconMatch = /\[\[File:Pact\s+([A-Za-z0-9]+)\s+\(Demonic Pacts League\)\.png/.exec(chunk);
    if (!iconMatch) continue;
    const iconCode = iconMatch[1];
    // Effect cell is whatever comes after the icon's closing `]]` and the
    // next `|` introducing it. Find the line starting after the icon.
    const afterIcon = chunk.slice(iconMatch.index + iconMatch[0].length);
    const cellRe = /\]\]\s*\n?\s*\|([\s\S]*?)(?:\n\|-|\n\|\}|$)/;
    const cellMatch = cellRe.exec(afterIcon);
    if (!cellMatch) continue;
    const effect = cleanWikitext(cellMatch[1]);
    rows.push({ iconCode, effect });
  }
  return rows;
}

function cleanWikitext(s) {
  if (!s) return '';
  let out = s
    .replace(/<ref[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<nowiki>([^<]*)<\/nowiki>/g, '$1');
  for (let i = 0; i < 3; i++) out = out.replace(/{{[^{}]+}}/g, '');
  out = out
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''([^']+)'''/g, '$1')
    .replace(/''([^']+)''/g, '$1')
    .replace(/\{sic\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return out;
}

// Normalisation for matching: lowercase, strip styling and punctuation so
// trivial differences (the planner adds periods at the end of every
// sentence; the wiki doesn't) don't break a substring match. Keep only
// alphanumerics, % and spaces.
function normalizeEffect(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/<col=[^>]*>/g, '')
    .replace(/<\/col>/g, '')
    .replace(/[^a-z0-9% ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchToWiki(pact, exactByEffect, wikiEntries) {
  // Try the long effect text first (more specific), then the short name.
  const planText = pact.effect || pact.name || '';
  const planKey = normalizeEffect(planText);
  if (!planKey) return null;
  // Exact normalized match.
  if (exactByEffect.has(planKey)) return exactByEffect.get(planKey);
  // Substring / prefix match: try first 60 normalized chars vs each wiki
  // entry's first 60 normalized chars. This catches "+#% chance to..."
  // (planner) vs "#% chance to..." (wiki) style differences.
  const planHead = planKey.slice(0, 60);
  for (const w of wikiEntries) {
    const wikiKey = normalizeEffect(w.effect);
    if (!wikiKey) continue;
    const wikiHead = wikiKey.slice(0, 60);
    if (planKey.startsWith(wikiHead) || wikiKey.startsWith(planHead)) {
      return w.iconCode;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
