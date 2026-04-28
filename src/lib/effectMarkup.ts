// Parse the wiki-style bullet markup that lives in relics.json effects into
// nested-list blocks. Source format examples:
//
//   * top-level point
//   ** sub-point under the previous top-level
//   prose paragraph (no leading asterisk) breaks the current list
//
// The wiki source is inconsistent about spacing after asterisks (`* foo` vs
// `*foo`) and occasionally has trailing whitespace; we normalise both.

export interface ListItem {
  text: string;
  children?: ListItem[];
}

export type EffectBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: ListItem[] };

export function parseEffectMarkup(text: string): EffectBlock[] {
  const blocks: EffectBlock[] = [];
  if (!text) return blocks;
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.length > 0);

  let currentList: ListItem[] | null = null;
  let lastTopLevel: ListItem | null = null;

  for (const raw of lines) {
    const line = raw.replace(/^\s+/, '');
    let level = 0;
    let content = line;
    if (line.startsWith('**')) {
      level = 2;
      content = line.slice(2).replace(/^\s+/, '');
    } else if (line.startsWith('*')) {
      level = 1;
      content = line.slice(1).replace(/^\s+/, '');
    }

    if (level === 0) {
      // Plain prose breaks the current list.
      currentList = null;
      lastTopLevel = null;
      blocks.push({ kind: 'p', text: content });
      continue;
    }

    if (!currentList) {
      currentList = [];
      blocks.push({ kind: 'list', items: currentList });
    }

    if (level === 2 && lastTopLevel) {
      lastTopLevel.children = lastTopLevel.children ?? [];
      lastTopLevel.children.push({ text: content });
    } else {
      // Either a top-level item, or an orphan `**` at the start of a list
      // (no parent yet) — treat as top-level so we don't drop content.
      const item: ListItem = { text: content };
      currentList.push(item);
      lastTopLevel = item;
    }
  }

  return blocks;
}
