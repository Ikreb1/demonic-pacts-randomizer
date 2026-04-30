import { describe, it, expect } from 'vitest';
import { categorize } from '../src/lib/categoryRules';
import type { Task } from '../src/types';

const t = (over: Partial<Task>): Task => ({
  id: 0,
  tier: 'easy',
  region: 'General',
  name: '',
  description: '',
  requirements: '',
  points: null,
  ...over,
});

function bucketFor(task: Task): string {
  const groups = categorize([task]);
  return groups[0]?.id ?? 'other';
}

describe('categorize', () => {
  it('matches obvious categories', () => {
    expect(bucketFor(t({ name: 'Defeat Vorkath' }))).toBe('bossing');
    expect(bucketFor(t({ name: 'Reach level 99 Mining' }))).toBe('skill-levels');
    expect(bucketFor(t({ name: 'Complete the Cooks Assistant quest' }))).toBe('quests');
    expect(bucketFor(t({ name: 'Receive a clue scroll' }))).toBe('clues');
    expect(bucketFor(t({ name: 'Get the herbi pet' }))).toBe('pets');
    expect(bucketFor(t({ name: 'Equip a Dragon Scimitar' }))).toBe('equipment');
    expect(bucketFor(t({ name: 'Defeat a Chicken' }))).toBe('combat');
    expect(bucketFor(t({ name: 'Burn 100 Willow Logs' }))).toBe('skilling-firemaking');
    expect(bucketFor(t({ name: 'Visit Ferox Enclave' }))).toBe('travel');
  });

  it('falls back to other for unmatched tasks', () => {
    const groups = categorize([t({ name: 'qwertyuiop', description: 'asdf' })]);
    expect(groups[0]?.id).toBe('other');
  });

  it('drops empty categories', () => {
    const groups = categorize([t({ name: 'Defeat Vorkath' })]);
    expect(groups.map((g) => g.id)).not.toContain('clues');
  });

  it('uses first-rule-wins so each task lands in exactly one bucket', () => {
    // A Slayer task targeting a boss lands in Slayer (its primary nature),
    // not also in Bossing — Slayer is ranked higher in the rule list.
    const groups = categorize([t({ name: 'Complete 1 Slayer Task' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('slayer');
  });

  it('does not let prerequisites leak a task into skill-levels', () => {
    // The old matcher concatenated requirements, so "15 Firemaking" in
    // requirements bucketed every skilling task as a skill-level achievement.
    const burn = t({
      name: 'Burn Some Oak Logs',
      description: 'Burn some oak logs.',
      requirements: '15 Firemaking',
    });
    expect(bucketFor(burn)).toBe('skilling-firemaking');
  });

  it('routes named bosses to bossing even with a level-style requirement', () => {
    const cockatrice = t({
      name: 'Defeat a Cockatrice in the Fremennik Province',
      description: 'Defeat a cockatrice in the Fremennik Province.',
      requirements: '25 Slayer',
    });
    // Not Slayer (no slayer keyword in name/desc) — Combat.
    expect(bucketFor(cockatrice)).toBe('combat');
  });

  it('splits skilling tasks by primary skill from requirements', () => {
    expect(
      bucketFor(t({ name: 'Burn Some Oak Logs', requirements: '15 Firemaking' })),
    ).toBe('skilling-firemaking');
    expect(
      bucketFor(t({ name: 'Mine 5 Tin Ore', requirements: '1 Mining' })),
    ).toBe('skilling-mining');
    expect(
      bucketFor(t({ name: 'Smelt a Bronze Bar', requirements: '1 Smithing' })),
    ).toBe('skilling-smithing');
  });

  it('falls back to verb-based skill detection when no requirements', () => {
    expect(bucketFor(t({ name: 'Cook Shrimp', requirements: '' }))).toBe(
      'skilling-cooking',
    );
    expect(
      bucketFor(t({ name: 'Catch a Herring', requirements: '' })),
    ).toBe('skilling-fishing');
    expect(
      bucketFor(t({ name: 'Catch a Baby Impling', requirements: '' })),
    ).toBe('skilling-hunter');
  });

  it('routes Million XP grinds to a low-priority bucket', () => {
    const xp = t({ name: 'Obtain 25 Million Mining XP' });
    expect(bucketFor(xp)).toBe('xp-milestones');
    // Sort 990 puts xp-milestones near the end, after every per-skill bucket.
    const groups = categorize([
      xp,
      t({ name: 'Defeat Vorkath' }),
      t({ name: 'Mine 5 Tin Ore', requirements: '1 Mining' }),
    ]);
    expect(groups[groups.length - 1].id).toBe('xp-milestones');
  });

  it('separates forestry events from random events into different buckets', () => {
    const forestry = t({ name: 'Complete a Forestry Event' });
    const randomEvt = t({ name: 'Complete the Evil Bob random event' });
    expect(bucketFor(forestry)).toBe('forestry');
    expect(bucketFor(randomEvt)).toBe('minigames');
    // And in a combined call, they end up in separate groups (not lumped).
    const groups = categorize([forestry, randomEvt]);
    const ids = groups.map((g) => g.id);
    expect(ids).toContain('forestry');
    expect(ids).toContain('minigames');
  });
});
