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
    expect(isAlwaysSkippedFromRoll(findTask('Trade a herb with Jekyll'))).toBe(true);
  });

  it('skips random-event-rewarded outfit tasks (drops only from the event)', () => {
    expect(isAlwaysSkippedFromRoll(findTask('Equip a piece of Zombie Outfit'))).toBe(true);
    expect(isAlwaysSkippedFromRoll(findTask('Equip a piece of Mime Outfit'))).toBe(true);
    expect(isAlwaysSkippedFromRoll(findTask("Equip a piece of Beekeeper's Outfit"))).toBe(true);
    expect(isAlwaysSkippedFromRoll(findTask('Equip a piece of Camouflage outfit'))).toBe(true);
  });

  it('does NOT skip the Alchemist\'s outfit (shop/minigame reward, not random event)', () => {
    expect(isAlwaysSkippedFromRoll(findTask('Equip a piece of Alchemists outfit'))).toBe(false);
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

describe('hasUnmetDependency — speed task chain', () => {
  it('"Complete 1 Speed Task" is a chain root', () => {
    expect(hasUnmetDependency(findTask('Complete 1 Speed Task'), new Set())).toBe(false);
  });

  it('"Complete 5 Speed Tasks" requires "Complete 1 Speed Task"', () => {
    const child = findTask('Complete 5 Speed Tasks');
    const parent = findTask('Complete 1 Speed Task');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('"Complete 30 Speed Tasks" requires the immediate predecessor (20), not the root', () => {
    const child = findTask('Complete 30 Speed Tasks');
    const root = findTask('Complete 1 Speed Task');
    const parent = findTask('Complete 20 Speed Tasks');
    expect(hasUnmetDependency(child, new Set([root.id]))).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });
});

describe('hasUnmetDependency — echo boss chains', () => {
  it('"Defeat 1 unique Echo Boss" is a chain root', () => {
    expect(hasUnmetDependency(findTask('Defeat 1 unique Echo Boss'), new Set())).toBe(false);
  });

  it('"Defeat 4 unique Echo Bosses" requires "Defeat 3 unique Echo Bosses"', () => {
    const child = findTask('Defeat 4 unique Echo Bosses');
    const parent = findTask('Defeat 3 unique Echo Bosses');
    const root = findTask('Defeat 1 unique Echo Boss');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    // Skipping the chain isn't allowed — only the immediate parent satisfies it.
    expect(hasUnmetDependency(child, new Set([root.id]))).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('"Defeat 150 Echo Bosses" requires "Defeat 75 Echo Bosses" (raw count chain)', () => {
    const child = findTask('Defeat 150 Echo Bosses');
    const parent = findTask('Defeat 75 Echo Bosses');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('the unique and total echo chains are independent', () => {
    // Completing the unique chain doesn't unlock the total chain, and vice versa.
    const totalChild = findTask('Defeat 75 Echo Bosses');
    const uniqueParent = findTask('Defeat 1 unique Echo Boss');
    expect(hasUnmetDependency(totalChild, new Set([uniqueParent.id]))).toBe(true);
  });
});

describe('hasUnmetDependency — extended count chains', () => {
  // Representative tests across the COUNT_CHAINS table. Not every family
  // is worth a dedicated test (the dispatch logic is shared) — these
  // pin down the awkward edges: chains with non-standard count values,
  // case-sensitive name suffixes, multi-word formats.

  it('Reach Combat Level chains through all 7 stops (25→50→75→100→110→120→126)', () => {
    const child = findTask('Reach Combat Level 126');
    const parent = findTask('Reach Combat Level 120');
    const root = findTask('Reach Combat Level 25');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([root.id]))).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('Reach Total Level uses immediate predecessor only (1500 needs 1250, not 1000)', () => {
    const child = findTask('Reach Total Level 1500');
    const grandparent = findTask('Reach Total Level 1000');
    const parent = findTask('Reach Total Level 1250');
    expect(hasUnmetDependency(child, new Set([grandparent.id]))).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('Reach Base Level chain extends through 95 (the previously-missing tail)', () => {
    const child = findTask('Reach Base Level 95');
    const parent = findTask('Reach Base Level 90');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('Floor N of the Hallowed Sepulchre chains 1→5', () => {
    const child = findTask('Floor 5 of the Hallowed Sepulchre');
    const parent = findTask('Floor 4 of the Hallowed Sepulchre');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('Defeat Vardorvis 300 times requires Vardorvis 150 (50/150/300 family)', () => {
    const child = findTask('Defeat Vardorvis 300 times');
    const parent = findTask('Defeat Vardorvis 150 times');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('Defeat Vardorvis 50 times requires the singular "Defeat Vardorvis" first-kill task', () => {
    const child = findTask('Defeat Vardorvis 50 times');
    const parent = findTask('Defeat Vardorvis');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('Defeat the Abyssal Sire 50 Times requires "Defeat the Abyssal Sire" (first-kill)', () => {
    const child = findTask('Defeat the Abyssal Sire 50 Times');
    const parent = findTask('Defeat the Abyssal Sire');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('Defeat the Royal Titans 50 times requires the first-kill task', () => {
    const child = findTask('Defeat the Royal Titans 50 times');
    const parent = findTask('Defeat the Royal Titans');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('Defeat the Kalphite Queen 150 Times requires 50 (and 50 requires the singular)', () => {
    const c150 = findTask('Defeat the Kalphite Queen 150 Times');
    const c50 = findTask('Defeat the Kalphite Queen 50 Times');
    const root = findTask('Defeat the Kalphite Queen');
    expect(hasUnmetDependency(c150, new Set([root.id]))).toBe(true);
    expect(hasUnmetDependency(c150, new Set([c50.id]))).toBe(false);
    expect(hasUnmetDependency(c50, new Set([root.id]))).toBe(false);
  });

  it('Defeat Tempoross 10 times requires "Defeat Tempoross 1 time" (singular w/ "1 time" form)', () => {
    const child = findTask('Defeat Tempoross 10 times');
    const parent = findTask('Defeat Tempoross 1 time');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
    // The "1 time" task itself is the chain root.
    expect(hasUnmetDependency(parent, new Set())).toBe(false);
  });

  it('Defeat Yama 50 times requires "Defeat Yama 1 time"', () => {
    const child = findTask('Defeat Yama 50 times');
    const parent = findTask('Defeat Yama 1 time');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('Defeat the Giant Mole 150 Times chains through 50 to the singular root', () => {
    const c150 = findTask('Defeat the Giant Mole 150 Times');
    const c50 = findTask('Defeat the Giant Mole 50 Times');
    const root = findTask('Defeat the Giant Mole');
    expect(hasUnmetDependency(c150, new Set([root.id]))).toBe(true);
    expect(hasUnmetDependency(c150, new Set([c50.id]))).toBe(false);
    expect(hasUnmetDependency(c50, new Set([root.id]))).toBe(false);
  });

  it("Defeat Nex 200 Times uses the 50/100/200 chain, not the standard 50/150/300", () => {
    // Important: Nex's chain values differ from the canonical boss chain.
    const child = findTask('Defeat Nex 200 Times');
    const parent = findTask('Defeat Nex 100 Times');
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
    // 150 isn't even a valid Nex task; sanity-check the chain isn't picking
    // up the wrong predecessor by id collision.
    expect(hasUnmetDependency(child, new Set())).toBe(true);
  });

  it('250 Combat Achievements requires 200 Combat Achievements', () => {
    const child = findTask('250 Combat Achievements');
    const parent = findTask('200 Combat Achievements');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('"50 Chambers of Xeric" requires "25 Chambers of Xeric"', () => {
    const child = findTask('50 Chambers of Xeric');
    const parent = findTask('25 Chambers of Xeric');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('Room 8 of Pyramid Plunder chains through Room 7', () => {
    const child = findTask('Room 8 of Pyramid Plunder');
    const parent = findTask('Room 7 of Pyramid Plunder');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('"25 Unique Items From Master Clues" requires "10 Unique Items From Master Clues"', () => {
    const child = findTask('Gain 25 Unique Items From Master Clues');
    const parent = findTask('Gain 10 Unique Items From Master Clues');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('"5 Unique Items From Hard Clues" requires the singular "Gain a Unique Item From a Hard Clue"', () => {
    const child = findTask('Gain 5 Unique Items From Hard Clues');
    const parent = findTask('Gain a Unique Item From a Hard Clue');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('"10 Unique Items From an Elite Clue" requires the singular "an Elite Clue" root', () => {
    // Article-handling sanity: "Elite" gets "an", not "a".
    const child = findTask('Gain 10 Unique Items From Elite Clues');
    const parent = findTask('Gain a Unique Item From an Elite Clue');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('the singular-root tasks themselves have no parent', () => {
    expect(hasUnmetDependency(findTask('Gain a Unique Item From an Easy Clue'), new Set())).toBe(false);
    expect(hasUnmetDependency(findTask('Gain a Unique Item From a Master Clue'), new Set())).toBe(false);
  });

  it('per-tier unique-item chains are independent (Master parent doesn\'t satisfy Easy)', () => {
    const easy35 = findTask('Gain 35 Unique Items From Easy Clues');
    const masterParent = findTask('Gain 10 Unique Items From Master Clues');
    const easyParent = findTask('Gain 10 Unique Items From Easy Clues');
    expect(hasUnmetDependency(easy35, new Set([masterParent.id]))).toBe(true);
    expect(hasUnmetDependency(easy35, new Set([easyParent.id]))).toBe(false);
  });
});

describe('hasUnmetDependency — slayer task chain', () => {
  it('"Complete 1 Slayer Task" is the chain root', () => {
    expect(hasUnmetDependency(findTask('Complete 1 Slayer Task'), new Set())).toBe(false);
  });

  it('"Complete 200 Slayer Tasks" requires "Complete 1 Slayer Task"', () => {
    const child = findTask('Complete 200 Slayer Tasks');
    const parent = findTask('Complete 1 Slayer Task');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
  });

  it('"Steal 100 Valuables" requires "Steal 25 Valuables"', () => {
    const child = findTask('Steal 100 Valuables');
    const parent = findTask('Steal 25 Valuables');
    expect(hasUnmetDependency(child, new Set())).toBe(true);
    expect(hasUnmetDependency(child, new Set([parent.id]))).toBe(false);
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
