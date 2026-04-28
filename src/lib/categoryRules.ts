import type { Task } from '../types';

export interface CategoryRule {
  id: string;
  label: string;
  emoji?: string;
  match: (haystack: string, task: Task) => boolean;
  sort?: number;
}

const re = (pattern: RegExp) => (h: string) => pattern.test(h);

export const CATEGORY_RULES: CategoryRule[] = [
  {
    id: 'quests',
    label: 'Quests',
    emoji: '📜',
    sort: 1,
    match: re(/\bquest\b|complete the .{2,40}|quest cape/i),
  },
  {
    id: 'diaries',
    label: 'Achievement Diaries',
    emoji: '📔',
    sort: 2,
    match: re(/achievement diary|easy diary|medium diary|hard diary|elite diary/i),
  },
  {
    id: 'combat-achievements',
    label: 'Combat Achievements',
    emoji: '⚔️',
    sort: 3,
    match: re(/combat achievement|combat task/i),
  },
  {
    id: 'slayer',
    label: 'Slayer',
    emoji: '💀',
    sort: 4,
    match: re(/\bslayer\b|on a slayer task|slayer master|slayer assignment|superior.*slayer/i),
  },
  {
    id: 'bossing',
    label: 'Bossing',
    emoji: '🐉',
    sort: 5,
    match: re(
      /\b(zulrah|vorkath|jad|tztok|tzkal|zuk|hydra|nightmare|nex|sire|kraken|cerberus|kalphite queen|corp|corporeal|tob|theatre of blood|cox|chambers of xeric|toa|tombs of amascut|leviathan|whisperer|vardorvis|duke sucellus|muspah|sarachnis|callisto|venenatis|vet'?ion|chaos elemental|crazy archaeologist|king black dragon|dagannoth (kings|prime|rex|supreme)|gauntlet|hespori|skotizo|wintertodt|tempoross|thermonuclear smoke devil|grotesque guardians|gargoyle.*alchemical|abyssal sire|mole|barrows brother|barrows)\b/i,
    ),
  },
  {
    id: 'minigames',
    label: 'Minigames & Activities',
    emoji: '🎯',
    sort: 6,
    match: re(
      /\b(barbarian assault|pest control|castle wars|last man standing|lms|mahogany homes|tempoross|wintertodt|guardians of the rift|gotr|soul wars|trouble brewing|fishing trawler|pyramid plunder|gnome restaurant|tithe farm|volcanic mine|brimhaven agility|sepulchre|hallowed sepulchre|shades of mort'?ton|nightmare zone|nmz|fight caves|inferno|gauntlet)\b/i,
    ),
  },
  {
    id: 'clues',
    label: 'Clue Scrolls',
    emoji: '🗺️',
    sort: 7,
    match: re(/clue scroll|treasure trail|casket|hard clue|elite clue|master clue|beginner clue/i),
  },
  {
    id: 'pets',
    label: 'Pets',
    emoji: '🐾',
    sort: 8,
    match: re(/\bpet\b|skilling pet/i),
  },
  {
    id: 'skill-levels',
    label: 'Skill Levels',
    emoji: '📈',
    sort: 9,
    match: re(
      /\bachieve (?:level\s*)?\d+\b|\breach (?:level\s*)?\d+\b|\b(?:level\s*)?\d{2,3}\s+(attack|strength|defence|magic|ranged|prayer|hitpoints|agility|herblore|thieving|crafting|fletching|slayer|hunter|construction|farming|mining|smithing|fishing|cooking|firemaking|woodcutting|runecraft(?:ing)?)\b|max cape|maxed/i,
    ),
  },
  {
    id: 'gathering',
    label: 'Gathering & Skilling',
    emoji: '⛏️',
    sort: 10,
    match: re(
      /\b(mine|smelt|smith|chop|fletch|catch|cook|burn|cut|harvest|pickpocket|thieve|gather|craft|brew|mix|create|smith)\b\s+\d+|\b\d+\s+(logs|ores|fish|herbs|gems|bars|runes|seeds|planks)\b/i,
    ),
  },
  {
    id: 'collection-log',
    label: 'Collection Log',
    emoji: '📚',
    sort: 11,
    match: re(/collection log/i),
  },
  {
    id: 'travel',
    label: 'Travel & Exploration',
    emoji: '🧭',
    sort: 12,
    match: re(/\b(visit|travel to|enter|reach|explore|discover|witness|view)\b/i),
  },
  {
    id: 'items',
    label: 'Items & Equipment',
    emoji: '🎒',
    sort: 13,
    match: re(/\b(equip|wear|wield|obtain|loot|receive|unlock|own)\b/i),
  },
];

const FALLBACK_ID = 'other';

export function categorize(tasks: readonly Task[]): { id: string; label: string; emoji?: string; tasks: Task[] }[] {
  const buckets = new Map<string, Task[]>();
  const labels = new Map<string, { label: string; emoji?: string; sort: number }>();
  for (const r of CATEGORY_RULES) {
    labels.set(r.id, { label: r.label, emoji: r.emoji, sort: r.sort ?? 99 });
  }
  labels.set(FALLBACK_ID, { label: 'Other', emoji: '❓', sort: 999 });

  for (const t of tasks) {
    const haystack = `${t.name} ${t.description} ${t.requirements}`.toLowerCase();
    let matched = false;
    for (const r of CATEGORY_RULES) {
      if (r.match(haystack, t)) {
        matched = true;
        const list = buckets.get(r.id) ?? [];
        list.push(t);
        buckets.set(r.id, list);
      }
    }
    if (!matched) {
      const list = buckets.get(FALLBACK_ID) ?? [];
      list.push(t);
      buckets.set(FALLBACK_ID, list);
    }
  }

  return [...buckets.entries()]
    .map(([id, ts]) => ({ id, ...labels.get(id)!, tasks: ts }))
    .sort((a, b) => a.sort - b.sort);
}
