import type { Task } from '../types';
import tasksFile from '../data/tasks.json';

const ALL_TASKS: readonly Task[] = (tasksFile as { tasks: Task[] }).tasks;

const TASK_BY_NAME: Map<string, Task> = (() => {
  const m = new Map<string, Task>();
  for (const t of ALL_TASKS) m.set(t.name, t);
  return m;
})();

// Tasks that should never be rolled. Two reasons a task lives here:
//   - Tutorial tasks: assumed already completed in-game.
//   - Random events: hard time-gated — they can't be farmed on demand,
//     so rolling one wastes the user's locked-task slot waiting for an
//     event to spawn.
const ALWAYS_SKIP_TASK_NAMES: ReadonlySet<string> = new Set([
  // Leagues tutorial — auto-completed in-game.
  'Open the Leagues Menu',
  'Complete the Leagues Tutorial',
  // OSRS random events — time-gated, can't be triggered on demand.
  'Complete the Evil Bob random event',
  'Complete the Maze random event',
  'Complete the Pillory random event',
  'Complete the Pinball random event',
  'Complete the Postie Pete random event',
  'Complete the Prison Pete random event',
  'Complete the Surprise Exam random event',
  'Obtain a Kebab from a random event',
  'Trade a herb with Jekyll',
  // Random-event-rewarded outfits. Pieces drop only from their specific
  // random event (Gravedigger / Mime / Sandwich Lady / Drill Demon), so
  // these are time-gated in the same way as the events themselves.
  // (The Alchemist's outfit is a shop/minigame reward, NOT here.)
  'Equip a piece of Zombie Outfit',
  'Equip a piece of Mime Outfit',
  "Equip a piece of Beekeeper's Outfit",
  'Equip a piece of Camouflage outfit',
]);

// Count chains that don't fit the simple "single regex + count + naming
// formula" shape — those need bespoke handling in parentOf:
//   - Clue scrolls: 5 tiers × 3 counts, with singular/plural at N=1.
//   - Collection log slots: per-tier chain values.
//   - "Obtain N Million X XP": gated on the per-skill 99 milestone, not
//     on the previous milestone, so it isn't a count chain at all.
const CLUE_CHAIN = [1, 25, 75] as const;
const COLLECTION_LOG_CHAINS: Record<string, readonly number[]> = {
  Easy: [5, 20, 50],
  Medium: [5, 20, 40],
  Hard: [3, 15, 30],
  Elite: [3, 10, 25],
  Master: [5, 25],
};

const SKILL_NAMES = [
  'Attack', 'Strength', 'Defence', 'Magic', 'Ranged', 'Prayer', 'Hitpoints',
  'Agility', 'Herblore', 'Thieving', 'Crafting', 'Fletching', 'Slayer',
  'Hunter', 'Construction', 'Farming', 'Mining', 'Smithing', 'Fishing',
  'Cooking', 'Firemaking', 'Woodcutting', 'Runecraft',
] as const;
const SKILL_NAME_SET: ReadonlySet<string> = new Set(SKILL_NAMES);

// All "do this thing N times" chains follow the same shape: a regex with
// one numeric capture, a hardcoded list of valid counts in ascending
// order, and a function that builds the predecessor's task name. Many
// boss families share the canonical 50/150/300 chain so we factor that
// out; everything else lists its own counts so the values are visible at
// the call site without any indirection.
interface CountChain {
  re: RegExp;
  chain: readonly number[];
  format: (n: number) => string;
}

const BOSS_50_150_300 = [50, 150, 300] as const;
// Bosses where a separate "Defeat <Boss>" first-kill task exists; the
// singular task is the chain root (treated as N=1).
const BOSS_1_50_150_300 = [1, 50, 150, 300] as const;

const COUNT_CHAINS: readonly CountChain[] = [
  // Leagues progression (active gameplay)
  {
    re: /^Complete (\d+) Speed Tasks?$/,
    chain: [1, 5, 10, 20, 30],
    format: (n) => (n === 1 ? 'Complete 1 Speed Task' : `Complete ${n} Speed Tasks`),
  },
  {
    re: /^Defeat (\d+) unique Echo Boss(?:es)?$/,
    chain: [1, 2, 3, 4],
    format: (n) => (n === 1 ? 'Defeat 1 unique Echo Boss' : `Defeat ${n} unique Echo Bosses`),
  },
  {
    re: /^Defeat (\d+) Echo Bosses$/,
    chain: [25, 75, 150],
    format: (n) => `Defeat ${n} Echo Bosses`,
  },

  // "Complete all tasks for N bosses": 1 → 3 → 5 → 10. Singular at N=1.
  {
    re: /^Complete all tasks for (\d+) (?:boss|bosses)$/,
    chain: [1, 3, 5, 10],
    format: (n) =>
      n === 1 ? 'Complete all tasks for 1 boss' : `Complete all tasks for ${n} bosses`,
  },

  // Level milestones (auto-progress in-game but still nice to gate so
  // higher tiers don't get rolled out of order).
  {
    re: /^Reach Base Level (\d+)$/,
    chain: [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95],
    format: (n) => `Reach Base Level ${n}`,
  },
  {
    re: /^Reach Combat Level (\d+)$/,
    chain: [25, 50, 75, 100, 110, 120, 126],
    format: (n) => `Reach Combat Level ${n}`,
  },
  {
    re: /^Reach Total Level (\d+)$/,
    chain: [100, 250, 666, 750, 1000, 1250, 1500, 1750, 2000, 2100, 2200, 2277],
    format: (n) => `Reach Total Level ${n}`,
  },
  {
    re: /^Achieve Your First Level (\d+)$/,
    chain: [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95],
    format: (n) => `Achieve Your First Level ${n}`,
  },

  // Activity counts
  {
    re: /^Complete (\d+) Hunter Rumours$/,
    chain: [10, 25, 50],
    format: (n) => `Complete ${n} Hunter Rumours`,
  },
  {
    re: /^Defeat (\d+) Superior slayer creatures$/,
    chain: [10, 20, 25, 50, 75, 100],
    format: (n) => `Defeat ${n} Superior slayer creatures`,
  },
  {
    re: /^Floor (\d+) of the Hallowed Sepulchre$/,
    chain: [1, 2, 3, 4, 5],
    format: (n) => `Floor ${n} of the Hallowed Sepulchre`,
  },
  {
    re: /^Room (\d+) of Pyramid Plunder$/,
    chain: [1, 2, 3, 4, 5, 6, 7, 8],
    format: (n) => `Room ${n} of Pyramid Plunder`,
  },
  {
    re: /^Get (\d+) Target points$/,
    chain: [250, 750, 1000],
    format: (n) => `Get ${n} Target points`,
  },
  {
    re: /^Giants' Foundry (\d+) handins$/,
    chain: [10, 25, 50],
    format: (n) => `Giants' Foundry ${n} handins`,
  },
  {
    re: /^Giants' Foundry (\d+) quality sword$/,
    chain: [50, 125, 150],
    format: (n) => `Giants' Foundry ${n} quality sword`,
  },
  {
    re: /^Equip (\d+) Black Chinchompas$/,
    chain: [100, 250, 500],
    format: (n) => `Equip ${n} Black Chinchompas`,
  },
  {
    re: /^Complete the Inferno (\d+) Times$/,
    chain: [5, 10, 15],
    format: (n) => `Complete the Inferno ${n} Times`,
  },
  {
    re: /^(\d+) Chambers of Xeric$/,
    chain: [1, 25, 50],
    format: (n) => `${n} Chambers of Xeric`,
  },
  {
    re: /^(\d+) Combat Achievements$/,
    chain: [50, 100, 150, 200, 250],
    format: (n) => `${n} Combat Achievements`,
  },
  // "Gain N Unique Items From <Tier> Clues" — count varies per tier and
  // each chain roots at the singular "Gain a Unique Item From a/an
  // <Tier> Clue" task (treated as N=1). Article matches the tier:
  // "an Easy", "an Elite" — vowel start; "a Medium", "a Hard", "a Master".
  {
    re: /^Gain (\d+) Unique Items From Easy Clues$/,
    chain: [1, 10, 35],
    format: (n) =>
      n === 1 ? 'Gain a Unique Item From an Easy Clue' : `Gain ${n} Unique Items From Easy Clues`,
  },
  {
    re: /^Gain (\d+) Unique Items From Medium Clues$/,
    chain: [1, 10, 25],
    format: (n) =>
      n === 1 ? 'Gain a Unique Item From a Medium Clue' : `Gain ${n} Unique Items From Medium Clues`,
  },
  {
    re: /^Complete (\d+) Slayer Tasks?$/,
    chain: [1, 200],
    format: (n) =>
      n === 1 ? 'Complete 1 Slayer Task' : `Complete ${n} Slayer Tasks`,
  },
  {
    re: /^Steal (\d+) Valuables$/,
    chain: [25, 100],
    format: (n) => `Steal ${n} Valuables`,
  },
  {
    re: /^Gain (\d+) Unique Items From Hard Clues$/,
    chain: [1, 5, 20, 50],
    format: (n) =>
      n === 1 ? 'Gain a Unique Item From a Hard Clue' : `Gain ${n} Unique Items From Hard Clues`,
  },
  {
    re: /^Gain (\d+) Unique Items From Elite Clues$/,
    chain: [1, 10, 25],
    format: (n) =>
      n === 1 ? 'Gain a Unique Item From an Elite Clue' : `Gain ${n} Unique Items From Elite Clues`,
  },
  {
    re: /^Gain (\d+) Unique Items From Master Clues$/,
    chain: [1, 10, 25],
    format: (n) =>
      n === 1 ? 'Gain a Unique Item From a Master Clue' : `Gain ${n} Unique Items From Master Clues`,
  },
  {
    re: /^(\d+) Collection log slots$/,
    chain: [5, 15, 30, 50, 100, 200, 350, 500, 750],
    format: (n) => `${n} Collection log slots`,
  },

  // Boss kill chains. The exact in-game name uses inconsistent
  // capitalization for "times"/"Times" — preserved per task.
  {
    re: /^Defeat Vardorvis (\d+) times$/,
    chain: BOSS_1_50_150_300,
    format: (n) => (n === 1 ? 'Defeat Vardorvis' : `Defeat Vardorvis ${n} times`),
  },
  {
    re: /^Defeat Sarachnis (\d+) Times$/,
    chain: BOSS_50_150_300,
    format: (n) => `Defeat Sarachnis ${n} Times`,
  },
  {
    re: /^Defeat (\d+) Lizardmen Shaman$/,
    chain: BOSS_50_150_300,
    format: (n) => `Defeat ${n} Lizardmen Shaman`,
  },
  {
    re: /^Defeat Callisto (\d+) times$/,
    chain: BOSS_1_50_150_300,
    format: (n) => (n === 1 ? 'Defeat Callisto' : `Defeat Callisto ${n} times`),
  },
  {
    re: /^Defeat Cerberus (\d+) times$/,
    chain: BOSS_1_50_150_300,
    format: (n) => (n === 1 ? 'Defeat Cerberus' : `Defeat Cerberus ${n} times`),
  },
  {
    re: /^Defeat Duke Sucellus (\d+) times$/,
    chain: BOSS_1_50_150_300,
    format: (n) => (n === 1 ? 'Defeat Duke Sucellus' : `Defeat Duke Sucellus ${n} times`),
  },
  {
    re: /^Defeat Each Dagannoth King (\d+) Times$/,
    chain: BOSS_50_150_300,
    format: (n) => `Defeat Each Dagannoth King ${n} Times`,
  },
  {
    re: /^Defeat Leviathan (\d+) times$/,
    chain: BOSS_1_50_150_300,
    format: (n) => (n === 1 ? 'Defeat Leviathan' : `Defeat Leviathan ${n} times`),
  },
  {
    re: /^Defeat Phantom Muspah (\d+) times$/,
    chain: BOSS_1_50_150_300,
    format: (n) => (n === 1 ? 'Defeat Phantom Muspah' : `Defeat Phantom Muspah ${n} times`),
  },
  {
    re: /^Defeat Venenatis (\d+) times$/,
    chain: BOSS_1_50_150_300,
    format: (n) => (n === 1 ? 'Defeat Venenatis' : `Defeat Venenatis ${n} times`),
  },
  {
    re: /^Defeat Vet'ion (\d+) times$/,
    chain: BOSS_1_50_150_300,
    format: (n) => (n === 1 ? "Defeat Vet'ion" : `Defeat Vet'ion ${n} times`),
  },
  {
    re: /^Defeat Vorkath (\d+) Times$/,
    chain: BOSS_1_50_150_300,
    format: (n) => (n === 1 ? 'Defeat Vorkath' : `Defeat Vorkath ${n} Times`),
  },
  {
    re: /^Defeat Whisperer (\d+) times$/,
    chain: BOSS_1_50_150_300,
    format: (n) => (n === 1 ? 'Defeat Whisperer' : `Defeat Whisperer ${n} times`),
  },
  {
    re: /^Defeat Zulrah (\d+) Times$/,
    chain: BOSS_1_50_150_300,
    format: (n) => (n === 1 ? 'Defeat Zulrah' : `Defeat Zulrah ${n} Times`),
  },
  {
    re: /^Defeat the Alchemical Hydra (\d+) Times$/,
    chain: BOSS_50_150_300,
    format: (n) => `Defeat the Alchemical Hydra ${n} Times`,
  },
  {
    re: /^Defeat the Kraken Boss (\d+) Times$/,
    chain: BOSS_50_150_300,
    format: (n) => `Defeat the Kraken Boss ${n} Times`,
  },
  {
    re: /^Defeat the Abyssal Sire (\d+) Times$/,
    chain: BOSS_1_50_150_300,
    format: (n) =>
      n === 1 ? 'Defeat the Abyssal Sire' : `Defeat the Abyssal Sire ${n} Times`,
  },
  {
    re: /^Defeat Araxxor (\d+) Times$/,
    chain: BOSS_50_150_300,
    format: (n) => `Defeat Araxxor ${n} Times`,
  },

  // Bosses with non-standard chain values
  {
    re: /^Defeat (\d+) Demonic Gorillas$/,
    chain: [150, 300, 500],
    format: (n) => `Defeat ${n} Demonic Gorillas`,
  },
  {
    re: /^Defeat the Corporeal Beast (\d+) Times$/,
    chain: [1, 50, 150, 250],
    format: (n) =>
      n === 1 ? 'Defeat the Corporeal Beast' : `Defeat the Corporeal Beast ${n} Times`,
  },
  {
    re: /^Defeat Nex (\d+) Times$/,
    chain: [1, 50, 100, 200],
    format: (n) => (n === 1 ? 'Defeat Nex' : `Defeat Nex ${n} Times`),
  },
  {
    re: /^Defeat the Wintertodt (\d+) times$/,
    chain: [10, 25, 50],
    format: (n) => `Defeat the Wintertodt ${n} times`,
  },
  {
    re: /^Defeat the Moons of Peril (\d+) times$/,
    chain: [1, 10, 25, 50],
    format: (n) =>
      n === 1 ? 'Defeat the Moons of Peril' : `Defeat the Moons of Peril ${n} times`,
  },
  {
    re: /^Defeat The Nightmare (\d+) times$/,
    chain: [1, 25, 50, 150],
    format: (n) => (n === 1 ? 'Defeat The Nightmare' : `Defeat The Nightmare ${n} times`),
  },
  {
    re: /^Defeat Any God Wars Dungeon Boss (\d+) Times$/,
    chain: [100, 250, 500],
    format: (n) => `Defeat Any God Wars Dungeon Boss ${n} Times`,
  },

  // Bosses missed in the first pass — chains gated on a "Defeat <Boss>"
  // first-kill task where one exists.
  {
    re: /^Defeat the Royal Titans (\d+) times$/,
    chain: [1, 50],
    format: (n) =>
      n === 1 ? 'Defeat the Royal Titans' : `Defeat the Royal Titans ${n} times`,
  },
  {
    re: /^Defeat the Giant Mole (\d+) Times$/,
    chain: [1, 50, 150],
    format: (n) => (n === 1 ? 'Defeat the Giant Mole' : `Defeat the Giant Mole ${n} Times`),
  },
  {
    re: /^Defeat Zalcano (\d+) Times$/,
    chain: [1, 50, 100],
    format: (n) => (n === 1 ? 'Defeat Zalcano' : `Defeat Zalcano ${n} Times`),
  },
  {
    re: /^Defeat the Grotesque Guardians (\d+) Times$/,
    chain: [1, 50, 150],
    format: (n) =>
      n === 1 ? 'Defeat the Grotesque Guardians' : `Defeat the Grotesque Guardians ${n} Times`,
  },
  {
    re: /^Defeat the Kalphite Queen (\d+) Times$/,
    chain: [1, 50, 150],
    format: (n) =>
      n === 1 ? 'Defeat the Kalphite Queen' : `Defeat the Kalphite Queen ${n} Times`,
  },

  // Tempoross / Yama use "Defeat X 1 time" (singular noun) for the
  // first-kill task — the regex needs to match "time" optionally
  // pluralized so the N=1 entry hits the chain too.
  {
    re: /^Defeat Tempoross (\d+) times?$/,
    chain: [1, 10, 25],
    format: (n) => (n === 1 ? 'Defeat Tempoross 1 time' : `Defeat Tempoross ${n} times`),
  },
  {
    re: /^Defeat Yama (\d+) times?$/,
    chain: [1, 50, 150],
    format: (n) => (n === 1 ? 'Defeat Yama 1 time' : `Defeat Yama ${n} times`),
  },

  // Sol Heredit has no first-kill task in tasks.json — count chain only.
  {
    re: /^Defeat Sol Heredit (\d+) times$/,
    chain: [5, 10],
    format: (n) => `Defeat Sol Heredit ${n} times`,
  },
];

function lookupCountChain(name: string): Task | null {
  for (const { re, chain, format } of COUNT_CHAINS) {
    const m = re.exec(name);
    if (!m) continue;
    const idx = chain.indexOf(parseInt(m[1], 10));
    if (idx <= 0) return null;
    return TASK_BY_NAME.get(format(chain[idx - 1])) ?? null;
  }
  return null;
}

// One-off "equip <item>" tasks where the item is a guaranteed-only drop
// from a specific boss. Without the kill task as parent, these can roll
// before the user has any access to the drop source.
const EQUIPMENT_PARENT_NAMES: Readonly<Record<string, string>> = {
  'Equip a Zamorakian Spear': "Defeat K'ril Tsutsaroth",
};

export function isAlwaysSkippedFromRoll(task: Task): boolean {
  return ALWAYS_SKIP_TASK_NAMES.has(task.name);
}

// Returns the parent task whose completion gates the given task, per the
// rules below. Returns null when the task has no parent rule, or when
// the rule fires but the parent isn't found in tasks.json (defensive —
// we'd rather show a task than block it on a bad lookup).
function parentOf(task: Task): Task | null {
  const name = task.name;

  // Clue chain: "1 Easy Clue Scroll" → "25 Easy Clue Scrolls" → "75 Easy Clue Scrolls"
  // (and the same for Medium/Hard/Elite). Master only has the N=1 entry,
  // so the chain naturally terminates above.
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

  // Skill XP milestone: "Obtain N Million Skill XP" requires that skill's
  // 99 first. (Within-skill milestones — 25M / 35M / 50M for the same
  // skill — aren't chained, since hitting the higher one autocompletes
  // the lower ones in-game.)
  const xpMatch = /^Obtain \d+ Million ([A-Za-z]+) XP$/.exec(name);
  if (xpMatch && SKILL_NAME_SET.has(xpMatch[1])) {
    return TASK_BY_NAME.get(`Reach Level 99 ${xpMatch[1]}`) ?? null;
  }

  // Collection log slot chain: "Fill N <tier> Clue Collection Log Slots".
  // Per-tier chain since slot counts differ; the chain root has no parent.
  const colMatch = /^Fill (\d+) (Easy|Medium|Hard|Elite|Master) Clue Collection Log Slots$/.exec(
    name,
  );
  if (colMatch) {
    const count = parseInt(colMatch[1], 10);
    const tier = colMatch[2];
    const chain = COLLECTION_LOG_CHAINS[tier];
    if (!chain) return null;
    const idx = chain.indexOf(count);
    if (idx > 0) {
      const prev = chain[idx - 1];
      return TASK_BY_NAME.get(`Fill ${prev} ${tier} Clue Collection Log Slots`) ?? null;
    }
    return null;
  }

  // One-off equipment drops gated on a kill task.
  const equipParent = EQUIPMENT_PARENT_NAMES[name];
  if (equipParent) return TASK_BY_NAME.get(equipParent) ?? null;

  // Everything else flows through the COUNT_CHAINS table.
  return lookupCountChain(name);
}

export function hasUnmetDependency(task: Task, completed: ReadonlySet<number>): boolean {
  const parent = parentOf(task);
  if (!parent) return false;
  return !completed.has(parent.id);
}
