import { describe, it, expect } from 'vitest';
import { hasUnmetDependency, isAlwaysSkippedFromRoll } from '../src/lib/dependencies';
import type { Task } from '../src/types';
import tasksFile from '../src/data/tasks.json';

const TASKS: Task[] = (tasksFile as { tasks: Task[] }).tasks;

function findTask(name: string): Task {
  const t = TASKS.find((x) => x.name === name);
  if (!t) throw new Error(`task not in fixture: ${name}`);
  return t;
}

describe('isAlwaysSkippedFromRoll', () => {
  it('skips the two leagues tutorial tasks', () => {
    expect(isAlwaysSkippedFromRoll(findTask('Open the Leagues Menu'))).toBe(true);
    expect(isAlwaysSkippedFromRoll(findTask('Complete the Leagues Tutorial'))).toBe(true);
  });

  it('skips OSRS random event tasks (time-gated)', () => {
    // Random events spawn on the game's schedule, not the player's, so
    // locking one as your active task can mean waiting hours for a roll
    // you can't even attempt.
    expect(isAlwaysSkippedFromRoll(findTask('Complete the Evil Bob random event'))).toBe(true);
    expect(isAlwaysSkippedFromRoll(findTask('Complete the Maze random event'))).toBe(true);
    expect(isAlwaysSkippedFromRoll(findTask('Complete the Pillory random event'))).toBe(true);
    expect(isAlwaysSkippedFromRoll(findTask('Complete the Pinball random event'))).toBe(true);
    expect(isAlwaysSkippedFromRoll(findTask('Complete the Postie Pete random event'))).toBe(true);
    expect(isAlwaysSkippedFromRoll(findTask('Complete the Prison Pete random event'))).toBe(true);
    expect(isAlwaysSkippedFromRoll(findTask('Complete the Surprise Exam random event'))).toBe(true);
    expect(isAlwaysSkippedFromRoll(findTask('Obtain a Kebab from a random event'))).toBe(true);
  });

  it('does not skip ordinary tasks', () => {
    expect(isAlwaysSkippedFromRoll(findTask('1 Easy Clue Scroll'))).toBe(false);
    expect(isAlwaysSkippedFromRoll(findTask('Reach Level 99 Cooking'))).toBe(false);
  });
});

describe('hasUnmetDependency — clue chain', () => {
  it('"1 Easy Clue Scroll" has no parent (chain root)', () => {
    expect(hasUnmetDependency(findTask('1 Easy Clue Scroll'), new Set())).toBe(false);
  });

  it('"25 Easy Clue Scrolls" requires "1 Easy Clue Scroll"', () => {
    const child = findTask('25 Easy Clue Scrolls');
    const parent = findTask('1 Easy Clue Scroll');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('"75 Easy Clue Scrolls" requires "25 Easy Clue Scrolls" (one step back, not 1)', () => {
    const child = findTask('75 Easy Clue Scrolls');
    const intermediate = findTask('25 Easy Clue Scrolls');
    const root = findTask('1 Easy Clue Scroll');
    // Only completing the root isn't enough — intermediate must also be done.
    expect(hasUnmetDependency(child, new Set([root.id]))).toBe(true);
    expect(hasUnmetDependency(child, new Set([intermediate.id]))).toBe(false);
  });

  it('Medium tier chains the same way', () => {
    const child = findTask('25 Medium Clue Scrolls');
    const parent = findTask('1 Medium Clue Scroll');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });
});

describe('hasUnmetDependency — boss chain', () => {
  it('"Complete all tasks for 1 boss" is a chain root', () => {
    expect(hasUnmetDependency(findTask('Complete all tasks for 1 boss'), new Set())).toBe(false);
  });

  it('"3 bosses" requires "1 boss"', () => {
    const child = findTask('Complete all tasks for 3 bosses');
    const parent = findTask('Complete all tasks for 1 boss');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('"10 bosses" requires "5 bosses"', () => {
    const child = findTask('Complete all tasks for 10 bosses');
    const parent = findTask('Complete all tasks for 5 bosses');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });
});

describe('hasUnmetDependency — base level chain', () => {
  it('"Reach Base Level 5" is a chain root', () => {
    expect(hasUnmetDependency(findTask('Reach Base Level 5'), new Set())).toBe(false);
  });

  it('"Reach Base Level 20" requires "Reach Base Level 10"', () => {
    const child = findTask('Reach Base Level 20');
    const parent = findTask('Reach Base Level 10');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('completing a non-adjacent ancestor still leaves the immediate parent unmet', () => {
    const child = findTask('Reach Base Level 20');
    const grandparent = findTask('Reach Base Level 5');
    expect(hasUnmetDependency(child, new Set([grandparent.id]))).toBe(true);
  });
});

describe('hasUnmetDependency — skill XP milestones gated by 99', () => {
  it('"Obtain 50 Million Cooking XP" requires "Reach Level 99 Cooking"', () => {
    const child = findTask('Obtain 50 Million Cooking XP');
    const parent = findTask('Reach Level 99 Cooking');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('"Obtain 25 Million Slayer XP" requires "Reach Level 99 Slayer"', () => {
    const child = findTask('Obtain 25 Million Slayer XP');
    const parent = findTask('Reach Level 99 Slayer');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });
});

describe('hasUnmetDependency — collection log slot chains', () => {
  it('"Fill 5 Medium Clue Collection Log Slots" is the medium chain root', () => {
    expect(
      hasUnmetDependency(findTask('Fill 5 Medium Clue Collection Log Slots'), new Set()),
    ).toBe(false);
  });

  it('"Fill 20 Medium Clue Collection Log Slots" requires Fill 5', () => {
    const child = findTask('Fill 20 Medium Clue Collection Log Slots');
    const parent = findTask('Fill 5 Medium Clue Collection Log Slots');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('"Fill 40 Medium Clue Collection Log Slots" requires Fill 20 (not the root)', () => {
    const child = findTask('Fill 40 Medium Clue Collection Log Slots');
    const intermediate = findTask('Fill 20 Medium Clue Collection Log Slots');
    const root = findTask('Fill 5 Medium Clue Collection Log Slots');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    // Only completing the root isn't enough — need the immediate parent.
    expect(hasUnmetDependency(child, new Set([root.id]))).toBe(true);
    expect(hasUnmetDependency(child, new Set([intermediate.id]))).toBe(false);
  });

  it('Hard tier chains through 3 → 15 → 30', () => {
    const c30 = findTask('Fill 30 Hard Clue Collection Log Slots');
    const c15 = findTask('Fill 15 Hard Clue Collection Log Slots');
    const c3 = findTask('Fill 3 Hard Clue Collection Log Slots');
    expect(hasUnmetDependency(c30, new Set([c3.id]))).toBe(true);
    expect(hasUnmetDependency(c30, new Set([c15.id]))).toBe(false);
    expect(hasUnmetDependency(c15, new Set([c3.id]))).toBe(false);
  });

  it('Master tier (5 → 25) chains correctly with no third step', () => {
    const c25 = findTask('Fill 25 Master Clue Collection Log Slots');
    const c5 = findTask('Fill 5 Master Clue Collection Log Slots');
    expect(hasUnmetDependency(c25, new Set())).toBe(true);
    expect(hasUnmetDependency(c25, new Set([c5.id]))).toBe(false);
    expect(hasUnmetDependency(c5, new Set())).toBe(false);
  });
});

describe('hasUnmetDependency — non-matching tasks pass through', () => {
  it('"Reach Level 99 Cooking" is not gated by anything itself', () => {
    expect(hasUnmetDependency(findTask('Reach Level 99 Cooking'), new Set())).toBe(false);
  });

  it('arbitrary non-matching task names have no dependency', () => {
    expect(hasUnmetDependency(findTask('Reach Combat Level 25'), new Set())).toBe(false);
  });
});
