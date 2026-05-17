import type { Task } from '../types';

export const SKILL_NAMES = [
  'attack', 'strength', 'defence', 'magic', 'ranged', 'prayer', 'hitpoints',
  'agility', 'herblore', 'thieving', 'crafting', 'fletching', 'slayer', 'hunter',
  'construction', 'farming', 'mining', 'smithing', 'fishing', 'cooking',
  'firemaking', 'woodcutting', 'runecraft',
] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

export type PlayerLevels = Partial<Record<SkillName, number>>;

export interface SkillReq {
  skill: SkillName;
  level: number;
}

const PAIR_RE =
  /\b(\d{1,3})\s+(attack|strength|defence|magic|ranged|prayer|hitpoints|agility|herblore|thieving|crafting|fletching|slayer|hunter|construction|farming|mining|smithing|fishing|cooking|firemaking|woodcutting|runecraft(?:ing)?)\b/gi;

/**
 * Pull out all `<level> <skill>` pairs from a free-text requirements string.
 * Skips obvious non-level numbers (>99) and normalizes runecrafting → runecraft.
 *
 * Limitations: treats all pairs as ANDed. "either 50 Attack or 50 Defence"
 * becomes two separate AND requirements (so a player with one but not the
 * other shows as ineligible). Conservative for now — false-negatives are
 * fine since the "show all" escape hatch exists.
 */
export function parseSkillReqs(text: string | null | undefined): SkillReq[] {
  if (!text) return [];
  const out: SkillReq[] = [];
  for (const m of text.matchAll(PAIR_RE)) {
    const level = parseInt(m[1], 10);
    if (!Number.isFinite(level) || level < 1 || level > 99) continue;
    const raw = m[2].toLowerCase();
    const skill = (raw === 'runecrafting' ? 'runecraft' : raw) as SkillName;
    out.push({ skill, level });
  }
  return out;
}

/**
 * True when the task is eligible or has no parseable skill reqs.
 * Unparseable reqs (quest/item gates) default to true — false-positives
 * are better than hiding work the player can do.
 */
export function isEligibleOrUnknown(task: Task, levels: PlayerLevels): boolean {
  for (const r of parseSkillReqs(task.requirements)) {
    if ((levels[r.skill] ?? 0) < r.level) return false;
  }
  return true;
}

/**
 * Normalize WikiSync's `levels` field (e.g. `{"Mining": 99, "Sailing": 1}`)
 * to our lowercase canonical names. Unknown skills are dropped silently.
 */
export function normalizeWikiSyncLevels(raw: unknown): PlayerLevels {
  if (!raw || typeof raw !== 'object') return {};
  const out: PlayerLevels = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const lower = k.toLowerCase();
    const skill = (lower === 'runecrafting' ? 'runecraft' : lower) as SkillName;
    if ((SKILL_NAMES as readonly string[]).includes(skill)) {
      out[skill] = Math.max(1, Math.min(99, Math.floor(v)));
    }
  }
  return out;
}
