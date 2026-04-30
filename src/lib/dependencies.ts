import type { Task } from '../types';
import tasksFile from '../data/tasks.json';

const ALL_TASKS: readonly Task[] = (tasksFile as { tasks: Task[] }).tasks;

const TASK_BY_NAME: Map<string, Task> = (() => {
  const m = new Map<string, Task>();
  for (const t of ALL_TASKS) m.set(t.name, t);
  return m;
})();

const TUTORIAL_TASK_NAMES: ReadonlySet<string> = new Set([
  'Open the Leagues Menu',
  'Complete the Leagues Tutorial',
]);

const CLUE_CHAIN = [1, 25, 75] as const;
const CLUE_TIERS = ['Easy', 'Medium', 'Hard', 'Elite', 'Master'] as const;
const BOSS_CHAIN = [1, 3, 5, 10] as const;
const BASE_LEVEL_CHAIN = [5, 10, 20, 30, 40, 50, 60, 70] as const;

const SKILL_NAMES = [
  'Attack', 'Strength', 'Defence', 'Magic', 'Ranged', 'Prayer', 'Hitpoints',
  'Agility', 'Herblore', 'Thieving', 'Crafting', 'Fletching', 'Slayer',
  'Hunter', 'Construction', 'Farming', 'Mining', 'Smithing', 'Fishing',
  'Cooking', 'Firemaking', 'Woodcutting', 'Runecraft',
] as const;
const SKILL_NAME_SET: ReadonlySet<string> = new Set(SKILL_NAMES);

export function isAlwaysSkippedFromRoll(task: Task): boolean {
  return TUTORIAL_TASK_NAMES.has(task.name);
}

// Returns the parent task whose completion gates the given task, per the
// rules below. Returns null when the task has no parent rule, or when the
// rule fires but the parent isn't found in tasks.json (defensive — we'd
// rather show a task than block it on a bad lookup).
function parentOf(task: Task): Task | null {
  const name = task.name;

  // Clue chain: "1 Easy Clue Scroll" → "25 Easy Clue Scrolls" → "75 Easy Clue Scrolls"
  // (and the same for Medium/Hard/Elite/Master).
  const clueMatch = /^(\d+) (Easy|Medium|Hard|Elite|Master) Clue Scrolls?$/.exec(name);
  if (clueMatch) {
    const count = parseInt(clueMatch[1], 10);
    const tier = clueMatch[2];
    const idx = (CLUE_CHAIN as readonly number[]).indexOf(count);
    if (idx > 0) {
      const prev = CLUE_CHAIN[idx - 1];
      const prevName = prev === 1 ? `1 ${tier} Clue Scroll` : `${prev} ${tier} Clue Scrolls`;
      return TASK_BY_NAME.get(prevName) ?? null;
    }
    return null;
  }
  // The "Master" tier only has the "1 Master Clue Scroll" task in tasks.json
  // (no 25 or 75 master variants), so the chain naturally terminates above.
  void CLUE_TIERS;

  // Boss chain: 1 → 3 → 5 → 10 bosses.
  const bossMatch = /^Complete all tasks for (1 boss|3 bosses|5 bosses|10 bosses)$/.exec(name);
  if (bossMatch) {
    const n = parseInt(bossMatch[1], 10);
    const idx = (BOSS_CHAIN as readonly number[]).indexOf(n);
    if (idx > 0) {
      const prev = BOSS_CHAIN[idx - 1];
      const prevName =
        prev === 1 ? `Complete all tasks for 1 boss` : `Complete all tasks for ${prev} bosses`;
      return TASK_BY_NAME.get(prevName) ?? null;
    }
    return null;
  }

  // Base level chain: 5 → 10 → 20 → … → 70.
  const baseMatch = /^Reach Base Level (\d+)$/.exec(name);
  if (baseMatch) {
    const n = parseInt(baseMatch[1], 10);
    const idx = (BASE_LEVEL_CHAIN as readonly number[]).indexOf(n);
    if (idx > 0) {
      const prev = BASE_LEVEL_CHAIN[idx - 1];
      return TASK_BY_NAME.get(`Reach Base Level ${prev}`) ?? null;
    }
    return null;
  }

  // Skill XP milestone: any "Obtain N Million Skill XP" requires the skill's
  // 99 first. Aggregate "in 5 non-combat skills" tasks don't match because
  // their second token isn't a single skill name.
  const xpMatch = /^Obtain \d+ Million ([A-Za-z]+) XP$/.exec(name);
  if (xpMatch && SKILL_NAME_SET.has(xpMatch[1])) {
    return TASK_BY_NAME.get(`Reach Level 99 ${xpMatch[1]}`) ?? null;
  }

  return null;
}

export function hasUnmetDependency(task: Task, completed: ReadonlySet<number>): boolean {
  const parent = parentOf(task);
  if (!parent) return false;
  return !completed.has(parent.id);
}
