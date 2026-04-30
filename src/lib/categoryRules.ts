import type { Task } from '../types';

export interface CategoryRule {
  id: string;
  label: string;
  emoji?: string;
  /**
   * Display order. Defaults to the rule's position in the array. Override
   * to surface a category higher or lower than its match priority would
   * imply (e.g. "XP Milestones" matches early to claim its tasks but
   * displays last).
   */
  sort?: number;
  /**
   * Returns true if this rule claims the task. First rule to return true
   * wins — each task lands in exactly one bucket.
   *
   * Args:
   *   - haystack: lowercased "name + description". `requirements` is
   *     deliberately *not* concatenated here; it pollutes things like
   *     skill-levels with every skilling task that requires a level.
   *   - name: lowercased name only — used by name-anchored rules.
   *   - task: full task; the per-skill rules read `task.requirements` to
   *     detect the primary skill.
   */
  match: (haystack: string, name: string, task: Task) => boolean;
}

const re = (pattern: RegExp) => (h: string) => pattern.test(h);
const reName = (pattern: RegExp) => (_: string, n: string) => pattern.test(n);

// ----- Skill detection -----

type Skill =
  | 'mining' | 'woodcutting' | 'fishing' | 'cooking' | 'firemaking'
  | 'fletching' | 'crafting' | 'herblore' | 'thieving' | 'prayer'
  | 'farming' | 'hunter' | 'construction' | 'magic' | 'runecraft'
  | 'agility' | 'smithing'
  | 'attack' | 'strength' | 'defence' | 'ranged' | 'hitpoints' | 'slayer';

const SKILL_RE_GLOBAL =
  /\b(attack|strength|defence|magic|ranged|prayer|hitpoints|agility|herblore|thieving|crafting|fletching|slayer|hunter|construction|farming|mining|smithing|fishing|cooking|firemaking|woodcutting|runecraft(?:ing)?)\b/g;

const VERB_TO_SKILL: Record<string, Skill> = {
  // Skilling verbs at start of name → primary skill
  mine: 'mining',
  smelt: 'smithing', smith: 'smithing', forge: 'smithing',
  chop: 'woodcutting',
  burn: 'firemaking', light: 'firemaking', kindle: 'firemaking', cremate: 'firemaking',
  cook: 'cooking', butter: 'cooking', churn: 'cooking',
  fletch: 'fletching',
  craft: 'crafting', dye: 'crafting', spin: 'crafting', tan: 'crafting', cut: 'crafting',
  brew: 'herblore', clean: 'herblore', mix: 'herblore',
  pickpocket: 'thieving', thieve: 'thieving', steal: 'thieving',
  bury: 'prayer', scatter: 'prayer', sacrifice: 'prayer',
  pick: 'farming', plant: 'farming', rake: 'farming', harvest: 'farming',
  grow: 'farming', sow: 'farming', check: 'farming',
  fish: 'fishing',
  snare: 'hunter', trap: 'hunter', hunt: 'hunter',
  build: 'construction',
  cast: 'magic', enchant: 'magic', imbue: 'magic', teleport: 'magic',
  shoot: 'ranged',
  read: 'magic', // "Read a book" → flavor; Magic is the catchall
};

const HUNTER_OBJECT_RE =
  /\b(impling|implings|kebbits?|swifts?|wagtails?|twitches?|salamanders?|chinchompas?|moths?|butterfly|butterflies|ferrets?|grubs?|maniacal monkey|herbiboars?|black warlock|moss lizard|orange salamander|red salamander|black salamander|polar kebbit)\b/;

const HERBLORE_OBJECT_RE =
  /\b(potion|antipoison|saradomin brew|prayer potion|stamina|combat potion|super .* potion|poison)\b/;

function detectPrimarySkill(task: Task): Skill | null {
  const name = task.name.toLowerCase();
  const desc = (task.description ?? '').toLowerCase();
  const haystack = `${name} ${desc}`;
  const reqs = (task.requirements ?? '').toLowerCase();

  // Special-case overrides that beat both verb-mapping and requirements:
  // "Craft a Rune Using Daeyalt Essence [60 Mining]" is Runecraft, not
  // Mining (which is just the prereq for getting the essence).
  if (/\bessence\b/.test(haystack) && /^(craft|fill|combine|create|make)\b/.test(name)) {
    return 'runecraft';
  }
  if (/\brunes?\b/.test(name) && /^(craft|fill|combine|create|make)\b/.test(name)) {
    return 'runecraft';
  }

  // Verb at the start of the name → high-confidence skill hint.
  let verbSkill: Skill | null = null;
  const first = name.split(/\s+/)[0] ?? '';
  if (first === 'catch') {
    verbSkill = HUNTER_OBJECT_RE.test(haystack) ? 'hunter' : 'fishing';
  } else if (first === 'make' || first === 'create' || first === 'prepare') {
    verbSkill = HERBLORE_OBJECT_RE.test(haystack) ? 'herblore' : 'crafting';
  } else if (first in VERB_TO_SKILL) {
    verbSkill = VERB_TO_SKILL[first];
  }

  // If the verb-implied skill is mentioned anywhere in requirements, prefer
  // it over the earliest-in-reqs heuristic. This handles tasks like
  // "Cook 100 Moonlight Antelopes [91 Hunter, 92 Cooking]" — the activity
  // is Cooking even though Hunter is listed first as the meat-source prereq.
  if (verbSkill && reqs && new RegExp(`\\b${verbSkill}\\b`).test(reqs)) {
    return verbSkill;
  }

  // Otherwise: earliest skill mention in requirements wins.
  if (reqs) {
    SKILL_RE_GLOBAL.lastIndex = 0;
    const m = SKILL_RE_GLOBAL.exec(reqs);
    if (m) return (m[1] === 'runecrafting' ? 'runecraft' : m[1]) as Skill;
  }

  // No requirements — fall back to whatever the verb implied (may be null).
  return verbSkill;
}

// Broad "is this a skilling-flavoured task" gate. Used by per-skill rules
// to avoid pulling in non-skilling leftovers when detectPrimarySkill happens
// to find a skill mention.
const SKILLING_VERB_RE =
  /^(?:fully\s+)?(burn|cook|mine|chop|smelt|fletch|catch|brew|craft|cut|smith|gather|harvest|pickpocket|thieve|bury|prepare|build|create|make|fish|spin|plant|pick|hunt|forge|repair|cast|clean|cremate|dye|fill|grow|enchant|imbue|kindle|light|peel|reanimate|trim|trap|snare|charge|carve|assemble|sell|steal|read|successfully|turn (any|some|the|\d)|rake|scatter|sacrifice|convert|deposit|switch|trade|buy|purchase|check (a|some|the|\d)|scrape|churn|butter|shoot|sing|tan|stir|stoke|wake|store|sow|sift|find|move|offer|blow|decorate|learn|complete \d+ (farming|hunter))\b|\bhunter rumours?\b|\b\d+\s+(logs|ores|fish|herbs|gems|bars|runes|seeds|planks|essence|hides|crops|bones|arrows|bolts)\b/;

function isSkillingTask(name: string): boolean {
  return SKILLING_VERB_RE.test(name);
}

function makeSkillRule(skill: Skill, label: string, emoji: string, sortIndex: number): CategoryRule {
  return {
    id: `skilling-${skill}`,
    label,
    emoji,
    sort: sortIndex,
    match: (_h, n, t) => isSkillingTask(n) && detectPrimarySkill(t) === skill,
  };
}

// ----- Rule list (first-rule-wins on match priority) -----

// Sort indices: top categories (1-50), per-skill sub-bucket (100-199),
// XP milestones at the very bottom (990), Other (999).
export const CATEGORY_RULES: CategoryRule[] = [
  {
    id: 'diaries',
    label: 'Achievement Diaries',
    emoji: '📔',
    sort: 1,
    match: reName(/\b(easy|medium|hard|elite)\s+\w+\s+diary\b|\bachievement diary\b/),
  },
  {
    id: 'combat-achievements',
    label: 'Combat Achievements',
    emoji: '⚔️',
    sort: 2,
    match: re(/\b(combat achievements?|speed tasks?|complete all tasks for \d+ bosse?s?)\b/),
  },
  // Clues, pets and collection log still match early (so they claim their
  // tasks before more generic rules like loot/equipment/quests), but display
  // sort puts them at the bottom alongside XP milestones — they're low
  // priority for active play.
  {
    id: 'clues',
    label: 'Clue Scrolls',
    emoji: '🗺️',
    sort: 985,
    match: re(
      /\b(clue scrolls?|treasure trail|casket|easy clue|medium clue|hard clue|elite clue|master clue|beginner clue)\b/,
    ),
  },
  {
    id: 'collection-log',
    label: 'Collection Log',
    emoji: '📚',
    sort: 986,
    match: re(/collection log/),
  },
  {
    id: 'pets',
    label: 'Pets',
    emoji: '🐾',
    sort: 987,
    match: reName(/\bpet\b/),
  },
  // Equipment fires *before* bossing/minigames so "Equip the Pyromancer's
  // Garb" (mentioning Wintertodt in desc) lands as gear, not as a Wintertodt
  // task. Display sort stays at 200 (groups with combat/loot/etc.).
  {
    id: 'equipment',
    label: 'Equipment',
    emoji: '🎒',
    sort: 200,
    match: reName(/^(equip|wear|wield)\b/),
  },
  // XP milestones: matches early (so it grabs from 'loot') but displays
  // last (sort 990) — they're a low-priority grind bucket.
  {
    id: 'xp-milestones',
    label: 'XP Milestones',
    emoji: '💤',
    sort: 990,
    match: reName(/\b\d+\s*(?:million|m|mil)\s+\S+\s+xp\b|\b\d+\s*(?:million|m|mil)\s+xp\b/),
  },
  {
    id: 'slayer',
    label: 'Slayer',
    emoji: '💀',
    sort: 6,
    match: re(
      /\bslayer (tasks?|master|assignment|helm|cape|points?)\b|on a slayer task|superior\s+slayer|\bslay \d+|\bsuperior slayer/,
    ),
  },
  {
    id: 'raids',
    label: 'Raids',
    emoji: '🗝️',
    sort: 7,
    match: re(/\b(chambers of xeric|theatre of blood|tombs of amascut|cox|tob|toa)\b/),
  },
  {
    id: 'bossing',
    label: 'Bossing',
    emoji: '🐉',
    sort: 8,
    match: re(
      /\b(zulrah|vorkath|jad|tztok|tzkal|zuk|hydra|alchemical hydra|nightmare|nex|abyssal sire|kraken|cerberus|kalphite queen|corp|corporeal beast|leviathan|whisperer|vardorvis|duke sucellus|muspah|sarachnis|callisto|venenatis|vet'?ion|chaos elemental|crazy archaeologist|king black dragon|dagannoth (kings|prime|rex|supreme)|hespori|skotizo|grotesque guardians|kalphite|giant mole|barrows brother|barrows|ahrim|akrisae|dharok|guthan|karil|torag|verac|inferno|fight caves|gauntlet|amoxliatl|hueycoatl|royal titans|zalcano|perilous moons|moons of peril|frost crabs|leagues finale|the leviathan|the whisperer|huey|echo bosses?|sol heredit|\byama\b|doom of mokhaiotl|deep delves?|colosseum|tzhaar-ket-rak)\b/,
    ),
  },
  // Forestry fires before minigames so its tokens (forestry event, bush
  // event, etc.) land in their own bucket instead of being lumped together
  // with random events under "Minigames & Activities".
  {
    id: 'forestry',
    label: 'Forestry',
    emoji: '🌲',
    sort: 117,
    match: re(
      /\b(forestry event|bush event|sapling event|crying event|forestry pheasant|woodcutting guild forestry)\b/,
    ),
  },
  {
    id: 'minigames',
    label: 'Minigames & Activities',
    emoji: '🎯',
    sort: 9,
    match: re(
      /\b(barbarian assault|pest control|castle wars|last man standing|lms|mahogany homes|wintertodt|tempoross|guardians of the rift|gotr|soul wars|trouble brewing|fishing trawler|pyramid plunder|gnome restaurant|tithe farm|volcanic mine|brimhaven agility|sepulchre|hallowed sepulchre|shades of mort'?ton|nightmare zone|nmz|temple trek|agility course|agility arena|farming contracts?|burthorpe games|champion'?s challenge|impetuous impulses|mage training arena|sorceress'?s garden|stealing creation|tears of guthix|underground pass|warriors'? guild|lava maze|random event)\b/,
    ),
  },
  {
    id: 'skill-levels',
    label: 'Skill Levels',
    emoji: '📈',
    sort: 11,
    // All real skill-level tasks start with "Reach"/"Achieve" or mention
    // "max cape". The previous "<digit> <skill>" alternative was too greedy
    // — it pulled herblore/woodcutting tasks like "Make 100 Prayer Potions"
    // and "Chop 75 Magic Logs" in.
    match: reName(/^(achieve|reach)\b|\bmax cape\b/),
  },

  // Per-skill skilling rules fire BEFORE 'quests' so things like
  // "Complete 50 Hunter Rumours [46 Hunter]" land in skilling-hunter
  // instead of being claimed by the generic ^complete quests rule.
  makeSkillRule('mining',       'Mining',       '⛏️', 100),
  makeSkillRule('woodcutting',  'Woodcutting',  '🪓', 101),
  makeSkillRule('fishing',      'Fishing',      '🎣', 102),
  makeSkillRule('cooking',      'Cooking',      '🍳', 103),
  makeSkillRule('firemaking',   'Firemaking',   '🔥', 104),
  makeSkillRule('fletching',    'Fletching',    '🏹', 105),
  makeSkillRule('crafting',     'Crafting',     '✂️', 106),
  makeSkillRule('herblore',     'Herblore',     '🧪', 107),
  makeSkillRule('thieving',     'Thieving',     '🥷', 108),
  makeSkillRule('prayer',       'Prayer',       '🙏', 109),
  makeSkillRule('farming',      'Farming',      '🌱', 110),
  makeSkillRule('hunter',       'Hunter',       '🪤', 111),
  makeSkillRule('construction', 'Construction', '🛠️', 112),
  makeSkillRule('magic',        'Magic',        '🪄', 113),
  makeSkillRule('runecraft',    'Runecraft',    '🌀', 114),
  makeSkillRule('agility',      'Agility',      '🤸', 115),
  makeSkillRule('smithing',     'Smithing',     '🔨', 116),

  // Catchall for skilling-shaped tasks with no detectable skill.
  {
    id: 'skilling-other',
    label: 'Other Skilling',
    emoji: '⚙️',
    sort: 199,
    match: (_h, n) => isSkillingTask(n),
  },

  {
    id: 'quests',
    label: 'Quests',
    emoji: '📜',
    sort: 10,
    match: reName(/\b(quest cape|miniquest|\bquest\b)\b|^complete\b/),
  },

  {
    id: 'loot',
    label: 'Drops & Loot',
    emoji: '💰',
    sort: 201,
    // 'find' was here but got too greedy ("Find a Gout Tuber [35 Woodcutting]"
    // is woodcutting, not loot). It's now a skilling verb, so reqs route it
    // properly — and pure-loot finds with no requirements just fall through
    // to skilling-other.
    match: reName(/^(loot|obtain|receive|unlock|own|get|open)\b/),
  },
  {
    id: 'combat',
    label: 'Combat',
    emoji: '🗡️',
    sort: 202,
    match: reName(/^(defeat|kill|slay|attack)\b/),
  },
  {
    id: 'travel',
    label: 'Travel & Exploration',
    emoji: '🧭',
    sort: 203,
    match: reName(
      /^(visit|travel|enter|explore|witness|view|admire|inspect|exit|step|cross|bank at|charter|take a (carpet|boat|ship)|teleport)\b/,
    ),
  },
  {
    id: 'social',
    label: 'Social & Flavour',
    emoji: '🎭',
    sort: 204,
    match: reName(
      /^(talk|speak|bow|cry|dance|sit|drink|eat|feed|give|salute|wave|wink|laugh|hug|smile|cheer|emote|skip|spin)\b/,
    ),
  },
];

const FALLBACK_ID = 'other';

export interface Categorized {
  id: string;
  label: string;
  emoji?: string;
  tasks: Task[];
}

export function categorize(tasks: readonly Task[]): Categorized[] {
  const buckets = new Map<string, Task[]>();
  const meta = new Map<string, { label: string; emoji?: string; sort: number }>();
  CATEGORY_RULES.forEach((r, i) => {
    meta.set(r.id, { label: r.label, emoji: r.emoji, sort: r.sort ?? i + 1 });
  });
  meta.set(FALLBACK_ID, { label: 'Other', emoji: '❓', sort: 999 });

  for (const t of tasks) {
    const name = t.name.toLowerCase();
    const haystack = `${name} ${(t.description ?? '').toLowerCase()}`;
    let id: string = FALLBACK_ID;
    for (const r of CATEGORY_RULES) {
      if (r.match(haystack, name, t)) {
        id = r.id;
        break;
      }
    }
    const list = buckets.get(id) ?? [];
    list.push(t);
    buckets.set(id, list);
  }

  return [...buckets.entries()]
    .map(([id, ts]) => ({ id, ...meta.get(id)!, tasks: ts }))
    .sort((a, b) => a.sort - b.sort);
}
