import { describe, it, expect } from 'vitest';
import { parseTrackerExport } from '../src/lib/importTracker';

describe('parseTrackerExport', () => {
  const known = new Set([1, 2, 3, 4]);

  it('marks tasks with completed > 0 as done', () => {
    const json = {
      displayName: 'Zezima',
      taskType: 'DEMONIC_PACTS',
      tasks: {
        '1': { completed: 1700000000000, structId: 1 },
        '2': { completed: 0, structId: 2 },
        '3': { completed: 1700000000001, structId: 3 },
      },
    };
    const r = parseTrackerExport(json, known);
    expect(r.completedIds.sort()).toEqual([1, 3]);
    expect(r.username).toBe('Zezima');
    expect(r.taskTypeMatched).toBe(true);
    expect(r.totalSeen).toBe(3);
  });

  it('uses structId when key is non-numeric', () => {
    const json = {
      taskType: 'DEMONIC_PACTS',
      tasks: { foo: { completed: 1, structId: 4 } },
    };
    const r = parseTrackerExport(json, known);
    expect(r.completedIds).toEqual([4]);
  });

  it('routes unknown ids to unknownIds', () => {
    const json = {
      taskType: 'DEMONIC_PACTS',
      tasks: { '99': { completed: 1, structId: 99 } },
    };
    const r = parseTrackerExport(json, known);
    expect(r.completedIds).toEqual([]);
    expect(r.unknownIds).toEqual([99]);
  });

  it('flags taskType mismatch but still parses', () => {
    const json = {
      taskType: 'TRAILBLAZER_RELOADED',
      tasks: { '1': { completed: 1, structId: 1 } },
    };
    const r = parseTrackerExport(json, known);
    expect(r.taskTypeMatched).toBe(false);
    expect(r.completedIds).toEqual([1]);
  });

  it('throws on garbage input', () => {
    expect(() => parseTrackerExport('nope', known)).toThrow();
    expect(() => parseTrackerExport({}, known)).toThrow();
  });
});
