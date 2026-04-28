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

describe('categorize', () => {
  it('matches obvious categories', () => {
    const tasks = [
      t({ id: 1, name: 'Defeat Vorkath', description: 'Kill Vorkath once.' }),
      t({ id: 2, name: 'Reach level 50 Mining', description: 'Reach 50 Mining.' }),
      t({ id: 3, name: 'Complete the Cooks Assistant quest', description: '' }),
      t({ id: 4, name: 'Receive a clue scroll', description: 'Hard clue scroll' }),
      t({ id: 5, name: 'Get the herbi pet', description: '' }),
    ];
    const groups = categorize(tasks);
    const map = Object.fromEntries(groups.map((g) => [g.id, g.tasks.map((x) => x.id)]));
    expect(map.bossing).toContain(1);
    expect(map['skill-levels']).toContain(2);
    expect(map.quests).toContain(3);
    expect(map.clues).toContain(4);
    expect(map.pets).toContain(5);
  });

  it('falls back to other for unmatched tasks', () => {
    const tasks = [t({ id: 1, name: 'qwertyuiop', description: 'asdf' })];
    const groups = categorize(tasks);
    const other = groups.find((g) => g.id === 'other');
    expect(other?.tasks.map((x) => x.id)).toEqual([1]);
  });

  it('drops empty categories', () => {
    const groups = categorize([t({ id: 1, name: 'Defeat Vorkath' })]);
    const ids = groups.map((g) => g.id);
    expect(ids).not.toContain('clues');
  });

  it('allows a task to match multiple categories', () => {
    const tasks = [t({ id: 1, name: 'Slayer task: kill Vorkath', description: 'Slayer assignment' })];
    const groups = categorize(tasks);
    const ids = groups.map((g) => g.id);
    expect(ids).toContain('slayer');
    expect(ids).toContain('bossing');
  });
});
