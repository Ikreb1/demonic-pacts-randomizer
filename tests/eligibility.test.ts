import { describe, it, expect } from 'vitest';
import {
  parseSkillReqs,
  checkEligibility,
  isEligibleOrUnknown,
  normalizeWikiSyncLevels,
} from '../src/lib/eligibility';
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

describe('parseSkillReqs', () => {
  it('returns empty for empty/missing reqs', () => {
    expect(parseSkillReqs('')).toEqual([]);
    expect(parseSkillReqs(null)).toEqual([]);
    expect(parseSkillReqs(undefined)).toEqual([]);
  });

  it('extracts a single level + skill pair', () => {
    expect(parseSkillReqs('15 Firemaking')).toEqual([{ skill: 'firemaking', level: 15 }]);
  });

  it('extracts multi-skill comma-separated reqs', () => {
    expect(parseSkillReqs('78 Crafting, 70 Ranged, 40 Defence')).toEqual([
      { skill: 'crafting', level: 78 },
      { skill: 'ranged', level: 70 },
      { skill: 'defence', level: 40 },
    ]);
  });

  it('handles semicolon-separated reqs and trailing text', () => {
    expect(parseSkillReqs('60 Mining; Completion of Sins of the Father')).toEqual([
      { skill: 'mining', level: 60 },
    ]);
  });

  it('normalizes runecrafting -> runecraft', () => {
    expect(parseSkillReqs('33 Runecrafting')).toEqual([{ skill: 'runecraft', level: 33 }]);
    expect(parseSkillReqs('33 Runecraft')).toEqual([{ skill: 'runecraft', level: 33 }]);
  });

  it('discards levels above 99', () => {
    expect(parseSkillReqs('120 Mining')).toEqual([]);
  });

  it('extracts both alternatives in OR clauses (AND-treated, see lib note)', () => {
    expect(parseSkillReqs('either 50 Attack or 50 Defence')).toEqual([
      { skill: 'attack', level: 50 },
      { skill: 'defence', level: 50 },
    ]);
  });
});

describe('checkEligibility', () => {
  it('returns unknown when no parseable skill reqs', () => {
    expect(checkEligibility(t({ requirements: '' }), {})).toEqual({ status: 'unknown' });
    expect(
      checkEligibility(t({ requirements: 'Completion of Sins of the Father' }), {}),
    ).toEqual({ status: 'unknown' });
  });

  it('eligible when player meets every required level', () => {
    const task = t({ requirements: '60 Herblore' });
    expect(checkEligibility(task, { herblore: 75 })).toEqual({ status: 'eligible' });
    expect(checkEligibility(task, { herblore: 60 })).toEqual({ status: 'eligible' });
  });

  it('blocked + lists missing reqs when any level is short', () => {
    const task = t({ requirements: '70 Ranged, 40 Defence' });
    const res = checkEligibility(task, { ranged: 70, defence: 30 });
    expect(res).toEqual({
      status: 'blocked',
      missing: [{ skill: 'defence', level: 40 }],
    });
  });

  it('treats unknown player levels as 0 (so any req blocks)', () => {
    expect(checkEligibility(t({ requirements: '15 Firemaking' }), {})).toEqual({
      status: 'blocked',
      missing: [{ skill: 'firemaking', level: 15 }],
    });
  });
});

describe('isEligibleOrUnknown', () => {
  it('shows tasks with unparsed reqs by default', () => {
    expect(
      isEligibleOrUnknown(t({ requirements: 'Completion of A Quest' }), { mining: 1 }),
    ).toBe(true);
  });
  it('hides only tasks with explicit unmet level reqs', () => {
    expect(isEligibleOrUnknown(t({ requirements: '99 Slayer' }), { slayer: 50 })).toBe(false);
    expect(isEligibleOrUnknown(t({ requirements: '99 Slayer' }), { slayer: 99 })).toBe(true);
  });
});

describe('normalizeWikiSyncLevels', () => {
  it('lowercases skill names and clamps to 1-99', () => {
    expect(
      normalizeWikiSyncLevels({ Mining: 99, Sailing: 1, Hunter: 87, Bogus: 50 }),
    ).toEqual({ mining: 99, hunter: 87 });
  });

  it('returns empty for non-objects', () => {
    expect(normalizeWikiSyncLevels(null)).toEqual({});
    expect(normalizeWikiSyncLevels('hi')).toEqual({});
    expect(normalizeWikiSyncLevels(42)).toEqual({});
  });

  it('handles WikiSync runecrafting key', () => {
    expect(normalizeWikiSyncLevels({ Runecraft: 70 })).toEqual({ runecraft: 70 });
  });
});
