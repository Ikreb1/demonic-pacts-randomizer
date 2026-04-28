// Pure parser for the Demonic_Pacts_League/Tasks wiki page.
// Exports: parseWikitext(wikitext) -> { tasks: Task[], warnings: string[] }
//
// Each task on the page is a {{DPLTaskRow|key=value|...}} template.
// We split top-level params on '|', tracking {{ }} and [[ ]] depth so nested
// templates and links don't fragment the row.

const TIERS = ['easy', 'medium', 'hard', 'elite', 'master'];

const REGION_ALIASES = {
  general: 'General',
  varlamore: 'Varlamore',
  asgarnia: 'Asgarnia',
  desert: 'Kharidian Desert',
  'kharidian desert': 'Kharidian Desert',
  fremennik: 'Fremennik Provinces',
  'fremennik provinces': 'Fremennik Provinces',
  kandarin: 'Kandarin',
  karamja: 'Karamja',
  kourend: 'Kourend',
  morytania: 'Morytania',
  tirannwn: 'Tirannwn',
  wilderness: 'Wilderness',
};

function findTemplateBlocks(wikitext, name) {
  const blocks = [];
  const opener = `{{${name}`;
  let i = 0;
  while (i < wikitext.length) {
    const start = wikitext.indexOf(opener, i);
    if (start < 0) break;
    const next = wikitext[start + opener.length];
    if (next !== '|' && next !== '\n' && next !== '}' && next !== ' ') {
      i = start + opener.length;
      continue;
    }
    let depth = 0;
    let j = start;
    let end = -1;
    while (j < wikitext.length) {
      if (wikitext[j] === '{' && wikitext[j + 1] === '{') {
        depth++;
        j += 2;
      } else if (wikitext[j] === '}' && wikitext[j + 1] === '}') {
        depth--;
        j += 2;
        if (depth === 0) {
          end = j;
          break;
        }
      } else {
        j++;
      }
    }
    if (end < 0) break;
    blocks.push(wikitext.slice(start + 2, end - 2));
    i = end;
  }
  return blocks;
}

function splitTopLevelPipes(body) {
  const parts = [];
  let depth = 0;
  let linkDepth = 0;
  let buf = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    const c2 = body[i + 1];
    if (c === '{' && c2 === '{') {
      depth++;
      buf += '{{';
      i++;
    } else if (c === '}' && c2 === '}') {
      depth--;
      buf += '}}';
      i++;
    } else if (c === '[' && c2 === '[') {
      linkDepth++;
      buf += '[[';
      i++;
    } else if (c === ']' && c2 === ']') {
      linkDepth--;
      buf += ']]';
      i++;
    } else if (c === '|' && depth === 0 && linkDepth === 0) {
      parts.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  parts.push(buf);
  return parts;
}

// MediaWiki params can be positional (no `=`) or named (`key=value`).
// A positional param's effective key is its 1-based index across all positional
// args; a named param does NOT consume a positional slot. (Anchor for `=` is
// the first one outside any nested template/link, which our caller already
// handled by splitting on top-level `|` only.)
function parseParams(parts) {
  const out = {};
  let positional = 0;
  for (const part of parts) {
    const trimmedFront = part.replace(/^\s+/, '');
    const eq = part.indexOf('=');
    const looksNamed = eq > 0 && /^[A-Za-z0-9_-]+\s*=/.test(trimmedFront);
    if (looksNamed) {
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (key) out[key] = value;
    } else {
      positional++;
      out[String(positional)] = part.trim();
    }
  }
  return out;
}

function stripWikiMarkup(s) {
  if (!s) return '';
  return s
    .replace(/<ref[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/{{SCP\|([^|}]+)\|([^|}]+)(?:\|[^}]*)?}}/gi, (_, skill, level) => `${level} ${skill}`)
    .replace(/{{plink\|([^|}]+)(?:\|[^}]*)?}}/gi, '$1')
    .replace(/{{[^{}]+}}/g, '')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''([^']+)'''/g, '$1')
    .replace(/''([^']+)''/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTier(raw) {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  return TIERS.includes(v) ? v : null;
}

function normalizeRegion(raw) {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  return REGION_ALIASES[v] || null;
}

export function parseWikitext(wikitext) {
  const warnings = [];
  const tasks = [];
  const seen = new Set();

  const blocks = findTemplateBlocks(wikitext, 'DPLTaskRow');
  for (const block of blocks) {
    const parts = splitTopLevelPipes(block);
    parts.shift();
    const params = parseParams(parts);

    const idRaw = params.id ?? params.taskid ?? params.taskId;
    const id = idRaw ? Number.parseInt(idRaw, 10) : NaN;
    const tier = normalizeTier(params.tier ?? params.difficulty);
    const region = normalizeRegion(params.region ?? params.area);
    const name = stripWikiMarkup(params.name ?? params.task ?? params['1'] ?? '');
    const description = stripWikiMarkup(params.description ?? params.desc ?? params['2'] ?? '');
    const skillReqs = stripWikiMarkup(params.s ?? params.skills ?? '');
    const otherReqs = stripWikiMarkup(params.other ?? params.requirements ?? params.reqs ?? '');
    const requirements = [skillReqs, otherReqs].filter(Boolean).join('; ');
    const pointsRaw = params.points ?? params.pts;
    const points = pointsRaw ? Number.parseInt(pointsRaw, 10) : null;

    if (!Number.isFinite(id)) {
      warnings.push(`row missing/invalid id: ${JSON.stringify(params).slice(0, 120)}`);
      continue;
    }
    if (!tier) {
      warnings.push(`task ${id} unknown tier: ${params.tier}`);
      continue;
    }
    if (!region) {
      warnings.push(`task ${id} unknown region: ${params.region}`);
      continue;
    }
    if (!name) {
      warnings.push(`task ${id} missing name`);
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`duplicate id ${id}`);
      continue;
    }
    seen.add(id);

    tasks.push({
      id,
      tier,
      region,
      name,
      description,
      requirements,
      points: Number.isFinite(points) ? points : null,
    });
  }

  tasks.sort((a, b) => a.id - b.id);
  return { tasks, warnings };
}

export const __test_helpers = { findTemplateBlocks, splitTopLevelPipes, stripWikiMarkup };
