// Pure parser for the Demonic_Pacts_League/Relics wiki page.
// Exports: parseRelicsWikitext(wikitext) -> { relics: Relic[], warnings: string[] }
//
// Unlike Tasks (which use a {{DPLTaskRow|...}} template), Relics live inside
// per-tier wikitable blocks under === Tier N (X points) === section headers.
// Each table row is: icon | name link | multi-line effect text.

const RELIC_TIERS = [1, 2, 3, 4, 5, 6, 7, 8];

// Strip wiki markup from a relic name link. We expect [[Page|Display]] or [[Page]];
// take the visible/display half.
function stripRelicName(s) {
  if (!s) return '';
  return s
    .replace(/<ref[\s\S]*?<\/ref>/gi, '')
    .replace(/{{[^{}]+}}/g, '')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''([^']+)'''/g, '$1')
    .replace(/''([^']+)''/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip wiki markup from a relic effect, preserving newlines and bullet
// characters so the rendered text retains its list structure.
function stripRelicEffect(s) {
  if (!s) return '';
  let out = s
    .replace(/<ref[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/{{SCP\|([^|}]+)\|([^|}]+)(?:\|[^}]*)?}}/gi, (_, skill, level) => `${level} ${skill}`)
    .replace(/{{plink\|([^|}]+)(?:\|[^}]*)?}}/gi, '$1')
    .replace(/{{efn[^}]*?}}/gi, '');
  // Strip remaining single-level templates a couple of passes for safety.
  for (let i = 0; i < 3; i++) out = out.replace(/{{[^{}]+}}/g, '');
  out = out
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''([^']+)'''/g, '$1')
    .replace(/''([^']+)''/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out;
}

function parseTierHeader(line) {
  // Matches "=== Tier 3 (1,200 points) ===" with flexible spacing/case.
  // Capture group 1 is the tier number.
  const m = line.match(/^={2,4}\s*Tier\s+(\d+)\s*(?:\([^)]*\))?\s*={2,4}\s*$/i);
  return m ? parseInt(m[1], 10) : null;
}

// Find every "{| ... |}" wikitable block within a body of wikitext, returning
// the raw cell content between the opening fence (after the first newline)
// and the closing "|}".
function findWikitables(body) {
  const tables = [];
  const re = /\{\|[^\n]*\n([\s\S]*?)\n\|\}/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    tables.push(m[1]);
  }
  return tables;
}

// Split a table body on `|-` row separators into row chunks. The first chunk
// is whatever precedes the first separator (typically the header rows).
function splitTableRows(table) {
  return table.split(/^\s*\|-\s*$/m);
}

// Within a row chunk, split on lines that begin with `|` to recover the
// individual cells. Cells may span multiple lines until the next line that
// starts with `|` (or the end of the row chunk). Header marker `!` is treated
// the same way.
function splitRowCells(row) {
  // Drop any leading whitespace/newlines so the first `|` is at column 0.
  const trimmed = row.replace(/^[\s\n]+/, '');
  const lines = trimmed.split('\n');
  const cells = [];
  let buf = null;
  // A new cell starts on a line beginning with `|` (but not `||` for inline
  // cell separators or `|}` for table close) or `!` for header cells. The
  // line may have content after, or be just `|` introducing a multi-line cell.
  const cellLineRe = /^\s*\|(?!\|)(?!\})/;
  const headerLineRe = /^\s*!/;
  for (const line of lines) {
    if (cellLineRe.test(line) || headerLineRe.test(line)) {
      if (buf !== null) cells.push(buf);
      buf = line.replace(/^\s*[|!]\s?/, '');
    } else {
      if (buf === null) buf = '';
      buf += (buf ? '\n' : '') + line;
    }
  }
  if (buf !== null) cells.push(buf);
  // Keep cells even if empty so that |\n* ... patterns still produce a cell
  // we can append continuation lines into. Trim trailing whitespace.
  return cells.map((c) => c.replace(/\s+$/, ''));
}

export function parseRelicsWikitext(wikitext) {
  const relics = [];
  const warnings = [];

  // Locate every Tier-N section header and the body following it (up to the
  // next tier header or end of input).
  const lines = wikitext.split('\n');
  const sections = [];
  for (let i = 0; i < lines.length; i++) {
    const tier = parseTierHeader(lines[i]);
    if (tier !== null) sections.push({ tier, lineStart: i });
  }
  for (let i = 0; i < sections.length; i++) {
    const lineEnd = i + 1 < sections.length ? sections[i + 1].lineStart : lines.length;
    sections[i].body = lines.slice(sections[i].lineStart + 1, lineEnd).join('\n');
  }

  for (const sec of sections) {
    if (!RELIC_TIERS.includes(sec.tier)) {
      warnings.push(`unexpected tier number: ${sec.tier}`);
      continue;
    }
    const tables = findWikitables(sec.body);
    if (tables.length === 0) {
      warnings.push(`tier ${sec.tier}: no wikitable found`);
      continue;
    }
    // Use the first wikitable in the tier section.
    const rows = splitTableRows(tables[0]);
    // rows[0] is the header preamble (before the first |-). Remaining are data rows.
    for (let r = 1; r < rows.length; r++) {
      const raw = rows[r];
      if (!raw.trim()) continue; // formatting artifact (empty row)
      const cells = splitRowCells(raw);
      // We expect at least 3 cells: icon, name, effect.
      if (cells.length < 3) {
        warnings.push(`tier ${sec.tier} row ${r}: only ${cells.length} cells`);
        continue;
      }
      // Skip header rows that wikitable tooling sometimes emits.
      if (/^!/.test(raw.trim())) continue;
      const nameCell = cells[1];
      const effectCell = cells.slice(2).join('\n');
      const name = stripRelicName(nameCell);
      const effect = stripRelicEffect(effectCell);
      if (!name) {
        warnings.push(`tier ${sec.tier} row ${r}: missing name`);
        continue;
      }
      relics.push({ tier: sec.tier, name, effect });
    }
  }

  return { relics, warnings };
}

export const __test_helpers = {
  stripRelicName,
  stripRelicEffect,
  parseTierHeader,
  findWikitables,
  splitTableRows,
  splitRowCells,
};
