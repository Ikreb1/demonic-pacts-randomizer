// Pure extractor for the OSRS Wiki demonic-pact planner's JS bundle.
// The planner inlines each pact node as an object literal with `draw_coord`,
// `effect`, `linked_nodes`, `name`, `node_size`, `row_id` keys. We slice
// each enclosing object and read the fields we need.
//
// Exports `extractPactsFromBundle(bundleSource)` for use by fetch-pacts.mjs.
// Also runnable standalone: `node scripts/extract-planner-tree.mjs <path>`
// which writes src/data/pacts.json (handy for local debugging when you've
// already saved the bundle to disk).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The planner only uses three kinds: minor, major, capstone. node_root
// (the central spawn node) and node_small (an older size token, not used
// in current planner data) collapse into major.
const NODE_SIZE_TO_KIND = {
  node_root: 'major',
  node_capstone: 'capstone',
  node_major: 'major',
  node_small: 'major',
  node_minor: 'minor',
  node_dot: 'minor',
};

export function extractPactsFromBundle(bundle) {
  const found = findNodeObjects(bundle);
  const seen = new Set();
  const nodes = [];
  for (const { rowId, raw } of found) {
    if (seen.has(rowId)) continue;
    seen.add(rowId);
    // Strip nested `effect: {...}` so the outer `name:` template literal
    // isn't shadowed by `effect.name` (which holds the talent-code key).
    const value = readEffectValue(raw);
    const stripped = raw.replace(/\beffect\s*:\s*\{[^{}]*\}/g, 'effect:null');
    const nameRaw = readField(stripped, 'name') ?? '';
    const sizeRaw = readField(stripped, 'node_size') ?? 'node_minor';
    const kind = NODE_SIZE_TO_KIND[sizeRaw] ?? 'major';
    const coord = readDrawCoord(raw);
    const linked = readLinkedNodes(raw);
    const cleaned = cleanName(nameRaw, value);
    nodes.push({
      id: rowId,
      name: shortLabel(cleaned) || rowId,
      kind,
      branch: 'tree',
      prerequisites: linked,
      effect: cleaned,
      x: coord.x,
      y: coord.y,
    });
  }

  // The planner's `linked_nodes` is undirected, but some pages list edges
  // from one side only. Symmetrise so adjacency is consistent in our model.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    for (const otherId of n.prerequisites) {
      const other = byId.get(otherId);
      if (!other) continue;
      if (!other.prerequisites.includes(n.id)) {
        other.prerequisites.push(n.id);
      }
    }
  }

  return nodes;
}

// ---- internal: object-literal slicing & field reading ----

function findNodeObjects(src) {
  const out = [];
  const idRe = /row_id\s*:\s*"(node\d+)"/g;
  let m;
  while ((m = idRe.exec(src)) !== null) {
    const rowId = m[1];
    const obj = sliceObjectAround(src, m.index);
    if (obj) out.push({ rowId, raw: obj });
  }
  return out;
}

function sliceObjectAround(src, pos) {
  let depth = 0;
  let start = -1;
  for (let i = pos; i >= 0; i--) {
    const c = src[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start < 0) return null;
  let i = start + 1;
  let braceDepth = 1;
  while (i < src.length && braceDepth > 0) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(src, i);
    } else if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) {
      i = skipComment(src, i);
    } else if (c === '{') {
      braceDepth++;
      i++;
    } else if (c === '}') {
      braceDepth--;
      i++;
    } else {
      i++;
    }
  }
  if (braceDepth !== 0) return null;
  return src.slice(start, i);
}

function skipString(src, i) {
  const quote = src[i];
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    if (quote === '`' && c === '$' && src[i + 1] === '{') {
      i = matchBrace(src, i + 1) + 1;
      continue;
    }
    i++;
  }
  return i;
}

function matchBrace(src, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(src, i);
    } else if (c === '{') {
      depth++;
      i++;
    } else if (c === '}') {
      depth--;
      i++;
    } else {
      i++;
    }
  }
  return i - 1;
}

function skipComment(src, i) {
  if (src[i + 1] === '/') {
    const nl = src.indexOf('\n', i);
    return nl < 0 ? src.length : nl + 1;
  }
  if (src[i + 1] === '*') {
    const end = src.indexOf('*/', i + 2);
    return end < 0 ? src.length : end + 2;
  }
  return i + 1;
}

function readField(raw, key) {
  const re = new RegExp(
    `[{,]\\s*${key}\\s*:\\s*("([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"|\`([^\`\\\\]*(?:\\\\.[^\`\\\\]*)*)\`|([\\-]?\\d+(?:\\.\\d+)?)|(\\w+))`,
  );
  const m = re.exec(raw);
  if (!m) return null;
  if (m[2] !== undefined) return JSON.parse('"' + m[2] + '"');
  if (m[3] !== undefined) return m[3];
  if (m[4] !== undefined) return Number(m[4]);
  if (m[5] !== undefined) return m[5];
  return null;
}

function readEffectValue(raw) {
  const re = /\beffect\s*:\s*\{[^{}]*?\bvalue\s*:\s*(-?\d+(?:\.\d+)?)/;
  const m = re.exec(raw);
  return m ? Number(m[1]) : null;
}

function readDrawCoord(raw) {
  const re = /draw_coord\s*:\s*\{\s*x\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*y\s*:\s*(-?\d+(?:\.\d+)?)\s*\}/;
  const m = re.exec(raw);
  if (!m) return { x: 0, y: 0 };
  return { x: Number(m[1]), y: Number(m[2]) };
}

function readLinkedNodes(raw) {
  const re = /linked_nodes\s*:\s*\[([^\]]*)\]/;
  const m = re.exec(raw);
  if (!m) return [];
  const ids = [];
  const nodeRe = /"(node\d+)"/g;
  let mm;
  while ((mm = nodeRe.exec(m[1])) !== null) ids.push(mm[1]);
  return ids;
}

function cleanName(s, value) {
  if (!s) return '';
  let out = s
    .replace(/<col=[^>]*>/g, '')
    .replace(/<\/col>/g, '')
    .replace(/<br\s*\/?>/gi, '\n');
  if (value !== null && value !== undefined) {
    out = out.replace(/#/g, String(value));
  }
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function shortLabel(name) {
  const first = name.split(/\n|[.!?](?=\s|$)/)[0] ?? name;
  const trimmed = first.trim();
  return trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed;
}

// ---- standalone CLI ----

const HERE = dirname(fileURLToPath(import.meta.url));
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const inputPath = process.argv[2] ?? resolve(HERE, '..', 'planner-main.js');
  const OUT = resolve(HERE, '..', 'src', 'data', 'pacts.json');
  const bundle = readFileSync(inputPath, 'utf8');
  const nodes = extractPactsFromBundle(bundle);
  const kindCounts = nodes.reduce((acc, n) => ((acc[n.kind] = (acc[n.kind] ?? 0) + 1), acc), {});
  console.log(`extracted ${nodes.length} pact nodes`);
  console.log('  kinds:', kindCounts);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourcePage: 'tools.runescape.wiki/demonic-pacts (planner JS bundle)',
        pacts: nodes,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`wrote ${OUT}`);
}
