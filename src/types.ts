export const TIERS = ['easy', 'medium', 'hard', 'elite', 'master'] as const;
export type Tier = (typeof TIERS)[number];

export const REGIONS = [
  'General',
  'Varlamore',
  'Karamja',
  'Asgarnia',
  'Fremennik Provinces',
  'Kandarin',
  'Kharidian Desert',
  'Kourend',
  'Morytania',
  'Tirannwn',
  'Wilderness',
] as const;
export type Region = (typeof REGIONS)[number];

export const ALWAYS_UNLOCKED: readonly Region[] = ['General', 'Varlamore'];

export const REGION_UNLOCK_THRESHOLDS = [80, 200, 300, 450] as const;
export const FIRST_FORCED_REGION: Region = 'Karamja';

export interface Task {
  id: number;
  tier: Tier;
  region: Region;
  name: string;
  description: string;
  requirements: string;
  points: number | null;
}

export interface TasksFile {
  generatedAt: string;
  sourcePage: string;
  tasks: Task[];
}

export const TIER_LABELS: Record<Tier, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  elite: 'Elite',
  master: 'Master',
};

export const TIER_POINTS: Record<Tier, number> = {
  easy: 10,
  medium: 30,
  hard: 80,
  elite: 200,
  master: 400,
};

export const RELIC_TIERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type RelicTier = (typeof RELIC_TIERS)[number];

export interface Relic {
  tier: RelicTier;
  name: string;
  effect: string;
}

export interface RelicsFile {
  generatedAt: string;
  sourcePage: string;
  relics: Relic[];
}

export const RELIC_TIER_THRESHOLDS: Record<RelicTier, number> = {
  1: 0,
  2: 600,
  3: 1200,
  4: 2600,
  5: 5200,
  6: 8500,
  7: 16500,
  8: 28000,
};
