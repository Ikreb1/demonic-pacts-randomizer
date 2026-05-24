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
//   - "Obtain N Million X XP": non-combat skills chain 25M → 35M → 50M
//     rooted on the skill's Level 99 milestone. Combat skills only have
//     a 50M task in tasks.json (no 25M/35M variants) so 50M roots
//     directly on Level 99. Not regular count chains because of the
//     mixed-skill availability.
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
    chain: [1, 10, 25, 50],
    format: (n) => (n === 1 ? 'Complete a Hunter Rumour' : `Complete ${n} Hunter Rumours`),
  },
  {
    re: /^Craft (\d+) Essence Into Runes$/,
    chain: [200, 2500],
    format: (n) => `Craft ${n} Essence Into Runes`,
  },
  {
    re: /^Defeat Amoxliatl (\d+) Times?$/,
    chain: [1, 50],
    format: (n) => (n === 1 ? 'Defeat Amoxliatl 1 Time' : `Defeat Amoxliatl ${n} Times`),
  },
  {
    re: /^Defeat (\d+) Superior slayer creatures$/,
    chain: [1, 10, 20, 25, 50, 75, 100],
    format: (n) =>
      n === 1
        ? 'Defeat a Superior slayer creature'
        : `Defeat ${n} Superior slayer creatures`,
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

  // Hueycoatl: only the singular and 50-kill variants exist.
  {
    re: /^Defeat Hueycoatl (\d+) Times?$/,
    chain: [1, 50],
    format: (n) => (n === 1 ? 'Defeat Hueycoatl 1 Time' : `Defeat Hueycoatl ${n} Times`),
  },

  // The Mimic (Treasure Trail rare): singular and 5-kill variants.
  {
    re: /^Defeat the Mimic (\d+) Times?$/,
    chain: [1, 5],
    format: (n) => (n === 1 ? 'Defeat the Mimic 1 Time' : `Defeat the Mimic ${n} Times`),
  },

  // Tombs of Amascut: singular root "Complete Tombs of Amascut" has its
  // own EXPLICIT_PARENTS entry; the 25 → 50 leg flows through this chain.
  {
    re: /^Complete Tombs of Amascut (\d+) times$/,
    chain: [25, 50],
    format: (n) => `Complete Tombs of Amascut ${n} times`,
  },

  // Deep delves: Doom of Mokhaiotl at delve level 8 or above.
  // Singular noun at N=1, plural at higher counts.
  {
    re: /^Complete (\d+) Deep delves?$/,
    chain: [1, 25, 75],
    format: (n) => (n === 1 ? 'Complete 1 Deep delve' : `Complete ${n} Deep delves`),
  },

  // Fight Caves / Inferno / Theatre of Blood: no first-completion task,
  // only the count entries chain.
  {
    re: /^Complete the Fight Caves (\d+) Times$/,
    chain: [5, 10],
    format: (n) => `Complete the Fight Caves ${n} Times`,
  },

  // Guardians of the Rift: 1 / 10 / 25 closures. N=1 uses singular
  // "Rift closed", higher counts use plural "Rifts closed".
  {
    re: /^Guardians of the Rift (\d+) Rifts? closed$/,
    chain: [1, 10, 25],
    format: (n) => (n === 1 ? 'Guardians of the Rift 1 Rift closed' : `Guardians of the Rift ${n} Rifts closed`),
  },
  {
    re: /^Complete the Inferno (\d+) Times$/,
    chain: [5, 10, 15],
    format: (n) => `Complete the Inferno ${n} Times`,
  },
  {
    re: /^Complete the Theatre of Blood (\d+) Times$/,
    chain: [25, 50],
    format: (n) => `Complete the Theatre of Blood ${n} Times`,
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

// One-off cross-chain dependencies — tasks where the parent doesn't fit
// any of the count-chain or singular-root patterns above. Most are
// "equip <item>" tasks gated on a specific boss kill, but the table
// also covers a few capstone/cross-chain hops (e.g. the totals chain
// rooted on a unique-kill task) that don't reduce to a count regex.
const EXPLICIT_PARENTS: Readonly<Record<string, string>> = {
  // ----- Outfits / capstones gated on grind/quest progression -----
  'Equip a Full Prospector Outfit': 'Obtain 20 Golden Nuggets',
  // Golden Prospector pieces drop from mining shooting stars.
  'Equip a Full set of Golden Prospector': 'Mine a shooting star',
  // Celestial ring is bought with stardust earned from mining shooting stars.
  'Purchase a Celestial ring': 'Mine a shooting star',
  // Landing sites cost 10 quetzal feed; feed drops from the Basic tier of
  // Hunter Rumours upward, so a single rumour is the minimum gate. Twilight's
  // Promise (the other prereq) is auto-completed in Leagues VI.
  'Build a Quetzal Landing Site': 'Complete a Hunter Rumour',
  'Build all Quetzal landing sites': 'Build a Quetzal Landing Site',
  'Travel using the Quetzal Transport System': 'Build a Quetzal Landing Site',
  // The whistle is a Hunter Rumour reward — gated on the rumour grind.
  'Create a Quetzal Whistle': 'Complete 10 Hunter Rumours',
  // In-game task text: "Completed 50 Hunter Rumours".
  'Cook 100 Moonlight Antelopes': 'Complete 50 Hunter Rumours',
  // Huntsman's Kit drops from Hunter Rumour Hunters' Loot Sacks.
  "Obtain the Huntsman's Kit": 'Complete a Hunter Rumour',
  // Guild Hunter Outfit pieces drop from Hunter Rumour Hunters' Loot Sacks.
  'Equip full Guild Hunter Outfit': 'Complete a Hunter Rumour',

  // ----- Echo content -----
  // Total-kill chain root requires at least one unique kill.
  'Defeat 25 Echo Bosses': 'Defeat 1 unique Echo Boss',
  // Echo Item equip chain (irregular naming: "one"/"2"/"3"/"four").
  'Equip one unique Echo Item': 'Defeat 1 unique Echo Boss',
  'Equip 2 unique Echo Items': 'Equip one unique Echo Item',
  'Equip 3 unique Echo Items': 'Equip 2 unique Echo Items',
  'Equip four unique Echo Items': 'Equip 3 unique Echo Items',

  // ----- Moons of Peril -----
  'Equip any piece of armour from the moons of peril': 'Defeat the Moons of Peril',
  // Each full Moon set requires a single piece first (transitive: piece → boss).
  'Equip full Blood Moon armour': 'Equip any piece of armour from the moons of peril',
  'Equip full Blue Moon armour': 'Equip any piece of armour from the moons of peril',
  'Equip full Eclipse Moon armour': 'Equip any piece of armour from the moons of peril',

  // ----- God Wars Dungeon -----
  // K'ril
  'Equip a Zamorakian Spear': "Defeat K'ril Tsutsaroth",
  'Equip a Staff of the Dead': "Defeat K'ril Tsutsaroth",
  // Commander Zilyana
  'Equip a Saradomin Sword': 'Defeat Commander Zilyana',
  'Equip an Armadyl Crossbow': 'Defeat Commander Zilyana',
  // General Graardor
  'Equip a Piece of the Bandos Armour Set': 'Defeat General Graardor',
  'Equip a Full Bandos Armour Set': 'Equip a Piece of the Bandos Armour Set',
  // Kree'arra
  'Equip a Piece of the Armadyl Armour Set': "Defeat Kree'arra",
  'Equip a Full Armadyl Armour Set': 'Equip a Piece of the Armadyl Armour Set',

  // ----- Nex -----
  'Equip a Piece of Torva Armour': 'Defeat Nex',
  'Equip a Full Set of Torva Armour': 'Equip a Piece of Torva Armour',
  'Equip some Zaryte Vambraces': 'Defeat Nex',
  'Equip a Zaryte Crossbow': 'Defeat Nex',

  // ----- Cerberus -----
  'Equip Some Primordial, Pegasian or Eternal Boots': 'Defeat Cerberus',
  'Equip all of the Cerberus Boots': 'Defeat Cerberus',

  // ----- Wilderness rings -----
  'Equip a Tyrannical Ring': 'Defeat Callisto',
  'Equip a Treasonous Ring': 'Defeat Venenatis',
  'Equip a Ring of the Gods': "Defeat Vet'ion",

  // ----- Solo dragon-class bosses -----
  'Equip a Dragonbone Necklace': 'Defeat Vorkath',
  'Equip a Serpentine Helm': 'Defeat Zulrah',

  // ----- Corporeal Beast (sigils) -----
  'Equip a Spectral or Arcane Spirit Shield': 'Defeat the Corporeal Beast',
  'Equip a Blessed Spirit Shield': 'Defeat the Corporeal Beast',
  'Equip an Elysian Spirit Shield': 'Defeat the Corporeal Beast',

  // ----- Dagannoth Kings -----
  'Equip a Berserker Ring': 'Defeat the Dagannoth Kings Without Leaving',
  'Equip a Warrior Ring': 'Defeat the Dagannoth Kings Without Leaving',
  "Equip a Seer's Ring": 'Defeat the Dagannoth Kings Without Leaving',
  "Equip an Archer's Ring": 'Defeat the Dagannoth Kings Without Leaving',
  'Equip a Mud Battlestaff': 'Defeat the Dagannoth Kings Without Leaving',
  'Equip a Seercull': 'Defeat the Dagannoth Kings Without Leaving',
  'Equip Every Dagannoth King Ring': 'Defeat the Dagannoth Kings Without Leaving',

  // ----- Grotesque Guardians -----
  'Equip a Granite Hammer or Granite Ring': 'Defeat the Grotesque Guardians',

  // ----- The Nightmare -----
  'Equip a Nightmare Staff': 'Defeat The Nightmare',
  'Equip a Nightmare Staff With an Orb': 'Defeat The Nightmare',
  "Equip a Piece of the Inquisitor's Set": 'Defeat The Nightmare',
  "Equip a Full Inquisitor's Set": "Equip a Piece of the Inquisitor's Set",
  "Equip an Inquisitor's Mace": 'Defeat The Nightmare',

  // ----- Hueycoatl (Varlamore) -----
  'Equip a piece of Hueycoatl armour': 'Defeat Hueycoatl 1 Time',
  'Equip full Hueycoatl armour': 'Equip a piece of Hueycoatl armour',

  // ----- Amoxliatl (Frost Naguas drop too, but Amoxliatl is a clean source) -----
  'Equip Glacial Temotli': 'Defeat Amoxliatl 1 Time',

  // ----- Desert Treasure 2 awakened bosses -----
  // Awakened variants require an Awakener's orb obtained from the regular
  // boss, so each Awakened kill is gated on the regular first-kill task.
  'Defeat Awakened Vardorvis': 'Defeat Vardorvis',
  'Defeat Awakened Duke Sucellus': 'Defeat Duke Sucellus',
  'Defeat Awakened Whisperer': 'Defeat Whisperer',
  'Defeat Awakened Leviathan': 'Defeat Leviathan',
  'Equip the Ultor Ring': 'Defeat Vardorvis',
  'Equip the Magus Ring': 'Defeat Duke Sucellus',
  'Equip the Bellator Ring': 'Defeat Whisperer',
  'Equip the Venator Ring': 'Defeat Leviathan',
  'Equip an Ice Ancient Sceptre': 'Defeat Duke Sucellus',
  // Virtus drops from any DT2 boss — gate the full set on any piece.
  'Equip full Virtus': 'Equip a piece of Virtus',

  // ----- Infinity (Mage Training Arena reward) -----
  'Equip a Full Infinity Robe Set': 'Equip a Piece of the Infinity Robe Set',

  // ----- Phantom Muspah -----
  'Equip the Venator Bow': 'Defeat Phantom Muspah',
  'Equip the Ancient Sceptre': 'Defeat Phantom Muspah',

  // ----- Araxxor -----
  'Equip the Noxious Halberd': 'Defeat Araxxor 1 Time',
  'Equip the Amulet of Rancour': 'Defeat Araxxor 1 Time',

  // ----- Alchemical Hydra -----
  'Equip a Brimstone Ring': 'Defeat the Alchemical Hydra 1 Time',
  'Equip Ferocious Gloves': 'Defeat the Alchemical Hydra 1 Time',
  'Equip a Dragon Hunter Lance': 'Defeat the Alchemical Hydra 1 Time',

  // ----- Royal Titans -----
  'Equip a Twinflame staff': 'Defeat the Royal Titans',

  // ----- Smoke devils (regular slayer mob, not just Therm) -----
  'Equip an Occult Necklace': 'Defeat a Smoke Devil',

  // ----- Abyssal Sire -----
  'Equip an Abyssal Bludgeon': 'Defeat the Abyssal Sire',

  // ----- Shadows of Custodia -----
  'Equip an Antler guard': 'Complete Shadows of Custodia',
  'Fletch some Atlatl darts': 'Complete Shadows of Custodia',

  // ----- Fortis Colosseum content -----
  // All Colosseum-tied tasks gate on the first wave; Sunfire Fanatic
  // follows the Moon-armor pattern (full → piece → Wave 1).
  'Equip Tonalztics of Ralos': 'Complete Wave 1 of Fortis Colosseum',
  "Equip Blessed Dizana's Quiver": 'Complete Wave 1 of Fortis Colosseum',
  'Equip a piece of Sunfire Fanatic': 'Complete Wave 1 of Fortis Colosseum',
  'Equip full Sunfire Fanatic': 'Equip a piece of Sunfire Fanatic',
  'Complete Wave 12 of Fortis Colosseum': 'Complete Wave 1 of Fortis Colosseum',
  // Sol Heredit count chain ([5, 10]) is rootless — anchor it on Wave 1.
  'Defeat Sol Heredit 5 times': 'Complete Wave 1 of Fortis Colosseum',
  'Use the Bank Chest inside Fortis Colosseum': 'Complete Wave 1 of Fortis Colosseum',
  'Use the Fortis Salute emote': 'Complete Wave 1 of Fortis Colosseum',
  'Obtain 40,000 Glory': 'Complete Wave 1 of Fortis Colosseum',
  'Obtain 58,000 Glory': 'Complete Wave 1 of Fortis Colosseum',

  // ----- Corrupted Gauntlet -----
  // Regular Gauntlet must be completed once before Corrupted is accessible.
  // Song of the Elves is auto-completed by the Tirannwn area unlock.
  'Complete the Corrupted Gauntlet': 'Complete the Gauntlet',
  'Complete the Corrupted Gauntlet 50 Times': 'Complete the Corrupted Gauntlet',
  'Complete the Corrupted Gauntlet 100 Times': 'Complete the Corrupted Gauntlet 50 Times',
  'Complete the Corrupted Gauntlet in 4:30': 'Complete the Corrupted Gauntlet',

  // ----- Quest-gated unlocks (quest is fully playable in Leagues VI) -----
  // Sins of the Father gates Darkmeyer, the blood-shard amulet, and the
  // Hallowed Sepulchre. Floor 1 is the count-chain root for Floors 2–5,
  // so this gate cascades through the count chain to the rest of the floors.
  'Create the long rope shortcut in Darkmeyer': 'Complete Sins of the Father',
  'Create an Amulet of Blood Fury': 'Complete Sins of the Father',
  'Floor 1 of the Hallowed Sepulchre': 'Complete Sins of the Father',
  // Guardians of the Rift rewards (rune pouch + Raiment + Lantern) require
  // playing the minigame at least once.
  'Create the Colossal Rune Pouch': 'Guardians of the Rift 1 Rift closed',
  'Equip a full set of Raiment of the eye': 'Guardians of the Rift 1 Rift closed',
  'Equip the Abyssal Lantern': 'Guardians of the Rift 1 Rift closed',

  // Beneath Cursed Sands gates the Divine Rune pouch, Tombs of Amascut,
  // Necropolis access, the Keris Partisan (quest reward), and the
  // Menaphite Remedy recipe.
  'Create the Divine Rune pouch': 'Complete Beneath Cursed Sands',
  'Complete Tombs of Amascut': 'Complete Beneath Cursed Sands',
  "Commune a Pharoah's Sceptre to the Necropolis": 'Complete Beneath Cursed Sands',
  'Mine 15 Granite in the Necropolis': 'Complete Beneath Cursed Sands',
  'Defeat a Kalphite with the Keris Partisan': 'Complete Beneath Cursed Sands',
  'Hit 150 with the Keris Partisan': 'Complete Beneath Cursed Sands',
  'Make 50 Menaphite Remedies': 'Complete Beneath Cursed Sands',
  // Enhanced crystal weapons require regular Gauntlet completion per the
  // in-game task text.
  'Equip an Enhanced Crystal Weapon': 'Complete the Gauntlet',
  // Tempoross drops gate on the first kill.
  'Equip the Tome of Water': 'Defeat Tempoross 1 time',
  'Obtain the Big Harpoonfish': 'Defeat Tempoross 1 time',
  'Obtain the Fish Barrel': 'Defeat Tempoross 1 time',
  // Statuette is in Nardah, only accessible via Spirits of the Elid.
  'Pray at the Elidinis Statuette': 'Complete Spirits of the Elid',

  // Sleeping Giants gates Giants' Foundry access. Two chain roots
  // (handins / quality sword) and the standalone reward-shop tasks all
  // need the quest first.
  "Giants' Foundry 10 handins": 'Complete Sleeping Giants',
  "Giants' Foundry 50 quality sword": 'Complete Sleeping Giants',
  "Drink Kovac's grog": 'Complete Sleeping Giants',
  // Smith's outfit costs ~25k Foundry rep. With Leagues 8x, 10 handins
  // gets the player ~65% of the way; the gate transitively requires
  // Sleeping Giants via the handins entry.
  "Equip a full set of the Smith's outfit": "Giants' Foundry 10 handins",
  'Equip the Colossal Blade': 'Complete Sleeping Giants',
  // The Final Dawn gates Doom of Mokhaiotl access and the Earthbound
  // Tecpatl unlock (the tecpatl is not a Mokhaiotl drop, it's a separate
  // quest reward).
  'Defeat the Doom of Mokhiatl': 'Complete the Final Dawn',
  'Equip Earthbound Tecpatl': 'Complete the Final Dawn',

  // 100 Mole Claws averages ~50 mole kills (2 claws/kill); gate on the
  // 50-kill chain entry so the player has actually farmed enough.
  'Turn in 100 Mole Claws to Wyson the Gardener': 'Defeat the Giant Mole 50 Times',

  // Sq'irkjuice turn-ins each need their season's sq'irk picked from
  // Sorceress's Garden. Higher seasons gate on higher Thieving levels.
  "Turn in a Winter Sq'irkjuice to Osman": "Pick a Winter Sq'irk",
  "Turn in 10 Spring Sq'irkjuices to Osman": "Pick a Spring Sq'irk",
  "Turn in 25 Autumn Sq'irkjuices to Osman": "Pick a Autumn Sq'irk",
  "Turn in 50 Summer Sq'irkjuices to Osman": "Pick a Summer Sq'irk",

  // ----- Tombs of Amascut drops + count-chain root -----
  // All unique drops gate on at least one ToA completion (cascades through
  // "Complete Tombs of Amascut" → Beneath Cursed Sands).
  'Equip the Lightbearer': 'Complete Tombs of Amascut',
  'Equip a Piece of Masori Armour': 'Complete Tombs of Amascut',
  'Equip a full set of Masori': 'Equip a Piece of Masori Armour',
  'Equip the Elidinis Ward': 'Complete Tombs of Amascut',
  "Equip the Osmumten's Fang": 'Complete Tombs of Amascut',
  "Equip the Osmumten's Fang (or)": 'Complete Tombs of Amascut',
  // Count-chain root: 25 → singular; 50 → 25 flows through COUNT_CHAINS.
  'Complete Tombs of Amascut 25 times': 'Complete Tombs of Amascut',

  // ----- Combat Achievements tier chain -----
  // Each tier unlocks after enough points from lower tiers.
  'Combat Achievements Medium Tier': 'Combat Achievements Easy Tier',
  'Combat Achievements Hard Tier': 'Combat Achievements Medium Tier',
  'Combat Achievements Elite Tier': 'Combat Achievements Hard Tier',

  // ----- Aggregate combat / non-combat XP milestones -----
  // 200M caps chain on the 100M task of the same category. The non-combat
  // 100M chains down to the "3 non-combat skills at 50M" aggregate.
  'Obtain 200 Million XP in a combat skill': 'Obtain 100 Million XP in a combat skill',
  'Obtain 200 Million XP in any non-combat skill': 'Obtain 100 Million XP in any non-combat skill',
  'Obtain 100 Million XP in any non-combat skill': 'Obtain 50 Million XP in 3 non-combat skills',

  // ----- Tzhaar-Ket-Rak's Challenges (1 → 6 → Special) -----
  // Named by ordinal words ("first", "second", …) so they don't fit the
  // count-chain regex; each challenge unlocks the next.
  "Complete Tzhaar-Ket-Rak's second challenge": "Complete Tzhaar-Ket-Rak's first challenge",
  "Complete Tzhaar-Ket-Rak's third challenge": "Complete Tzhaar-Ket-Rak's second challenge",
  "Complete Tzhaar-Ket-Rak's fourth challenge": "Complete Tzhaar-Ket-Rak's third challenge",
  "Complete Tzhaar-Ket-Rak's fifth challenge": "Complete Tzhaar-Ket-Rak's fourth challenge",
  "Complete Tzhaar-Ket-Rak's sixth challenge": "Complete Tzhaar-Ket-Rak's fifth challenge",
  "Complete Tzhaar-Ket-Rak's Special challenge": "Complete Tzhaar-Ket-Rak's sixth challenge",

  // ----- Misc orphan chains (singular root, no count-chain pattern) -----
  // Recoloured Graceful sets reuse the base Graceful slots; players
  // typically obtain the base set first via Marks of Grace before
  // unlocking any of the recolours.
  'Equip a set of recoloured Graceful': 'Equip a Full Graceful Outfit',
  'Snare a Bird 20 times': 'Snare a Bird',
  'Room 8 of Pyramid Plunder 25 Times': 'Room 8 of Pyramid Plunder',
  // Constrained Vorkath variants gate on the base first-kill, mirroring
  // the boss-drop-equip pattern.
  'Defeat Vorkath 5 Times Without Special Damage': 'Defeat Vorkath',
  'Defeat Vorkath 15 Times Without Leaving': 'Defeat Vorkath',
  'Successfully pickpocket a Citizen 10 times in a row': 'Pickpocket a Citizen',

  // ----- Combat Achievements (per-boss) gated on the boss's first-kill -----
  // You can't "Complete all the CAs for X" before you've killed X once.
  // Skipped: Kraken (no first-kill task in data), Godwars Dungeon (5+ bosses
  // required, no clean single parent), Fight Caves / Inferno / Theatre of
  // Blood (no first-completion task — only 5/10/25-times entries).
  'Amoxliatl Combat Achievements': 'Defeat Amoxliatl 1 Time',
  'Hueycoatl Combat Achievements': 'Defeat Hueycoatl 1 Time',
  'Kalphite Queen Combat Achievements': 'Defeat the Kalphite Queen',
  'Mole Combat Achievements': 'Defeat the Giant Mole',
  'Royal Titans Combat Achievements': 'Defeat the Royal Titans',
  'Thermonuclear Smoke Devil Combat Achievements': 'Defeat the Thermonuclear Smoke Devil',
  'Zalcano Combat Achievements': 'Defeat Zalcano',
  'Abyssal Sire Combat Achievements': 'Defeat the Abyssal Sire',
  'Perilous Moons Combat Achievements': 'Defeat the Moons of Peril',
  'Vardorvis Combat Achievements': 'Defeat Vardorvis',
  'Alchemical Hydra Combat Achievements': 'Defeat the Alchemical Hydra 1 Time',
  'Araxxor Combat Achievements': 'Defeat Araxxor 1 Time',
  'Dagannoth Kings Combat Achievements': 'Defeat the Dagannoth Kings Without Leaving',
  'Duke Sucellus Combat Achievements': 'Defeat Duke Sucellus',
  'Gauntlet Combat Achievements': 'Complete the Gauntlet',
  'Grotesque Guardians Combat Achievements': 'Defeat the Grotesque Guardians',
  'Phantom Muspah Combat Achievements': 'Defeat Phantom Muspah',
  "Phosani's Nightmare Combat Achievements": "Defeat Phosani's Nightmare",
  'The Leviathan Combat Achievements': 'Defeat Leviathan',
  'The Nightmare Combat Achievements': 'Defeat The Nightmare',
  'The Whisperer Combat Achievements': 'Defeat Whisperer',
  'Vorkath Combat Achievements': 'Defeat Vorkath',
  'Zulrah Combat Achievements': 'Defeat Zulrah',
  'Colosseum Combat Achievements': 'Complete Wave 1 of Fortis Colosseum',
  // tasks.json has the per-boss name with a typo ("Mokhiatl") — preserved
  // verbatim. Note also the lowercase "achievements" on the child name.
  'Doom of Mokhaiotl Combat achievements': 'Defeat the Doom of Mokhiatl',
  'Chambers of Xeric Combat Achievements': '1 Chambers of Xeric',
  'Tombs of Amascut Combat Achievements': 'Complete Tombs of Amascut',
  // Tzhaar-Ket-Rak CAs require completing all six challenges; gating on the
  // sixth transitively covers 1–5 via the challenge chain.
  "TzHaar-Ket-Rak's Combat Achievements": "Complete Tzhaar-Ket-Rak's sixth challenge",
};

// "N Collection log slots" — the cross-game aggregate tasks — are excluded
// from rolling by user preference: long-horizon grinds tied to drop RNG
// that don't fit a single roll slot. The per-tier "Fill N <tier> Clue
// Collection Log Slots" tasks stay rollable (those are clue-specific and
// more bounded).
const COLLECTION_LOG_SKIP_PATTERN = /^\d+ Collection log slots$/;

export function isAlwaysSkippedFromRoll(task: Task): boolean {
  if (ALWAYS_SKIP_TASK_NAMES.has(task.name)) return true;
  if (COLLECTION_LOG_SKIP_PATTERN.test(task.name)) return true;
  return false;
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

  // Skill XP milestone: chain 25M → 35M → 50M per skill, rooted on the
  // skill's Level 99 task. Combat skills (Attack/Strength/Defence/
  // Hitpoints/Magic/Ranged) only have a 50M variant in tasks.json — for
  // those, 50M roots directly on Level 99.
  const xpMatch = /^Obtain (\d+) Million ([A-Za-z]+) XP$/.exec(name);
  if (xpMatch && SKILL_NAME_SET.has(xpMatch[2])) {
    const amount = parseInt(xpMatch[1], 10);
    const skill = xpMatch[2];
    if (amount === 50) {
      return (
        TASK_BY_NAME.get(`Obtain 35 Million ${skill} XP`) ??
        TASK_BY_NAME.get(`Reach Level 99 ${skill}`) ??
        null
      );
    }
    if (amount === 35) {
      return TASK_BY_NAME.get(`Obtain 25 Million ${skill} XP`) ?? null;
    }
    return TASK_BY_NAME.get(`Reach Level 99 ${skill}`) ?? null;
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

  // One-off cross-chain dependencies (equipment drops, capstones, etc.)
  const explicitParent = EXPLICIT_PARENTS[name];
  if (explicitParent) return TASK_BY_NAME.get(explicitParent) ?? null;

  // Everything else flows through the COUNT_CHAINS table.
  return lookupCountChain(name);
}

export function hasUnmetDependency(task: Task, completed: ReadonlySet<number>): boolean {
  const parent = parentOf(task);
  if (!parent) return false;
  return !completed.has(parent.id);
}
