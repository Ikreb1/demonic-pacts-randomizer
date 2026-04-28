import { describe, it, expect } from 'vitest';
import {
  parseRelicsWikitext,
  __test_helpers,
} from '../scripts/parse-relics-wikitext.mjs';

const { stripRelicName, stripRelicEffect, parseTierHeader, splitRowCells } = __test_helpers;

describe('parseTierHeader', () => {
  it('matches "===Tier 1 (0 Points)===" with capitalised Points', () => {
    expect(parseTierHeader('===Tier 1 (0 Points)===')).toBe(1);
  });
  it('matches "=== Tier 3 (1,200 points) ===" with extra spaces and lowercase', () => {
    expect(parseTierHeader('=== Tier 3 (1,200 points) ===')).toBe(3);
  });
  it('matches when the parens are omitted', () => {
    expect(parseTierHeader('===Tier 8===')).toBe(8);
  });
  it('does not match a non-tier section', () => {
    expect(parseTierHeader('===Other Heading===')).toBeNull();
  });
});

describe('stripRelicName', () => {
  it('returns the display half of a piped wiki link', () => {
    expect(stripRelicName('[[Endless Harvest (Demonic Pacts League)|Endless Harvest]]')).toBe(
      'Endless Harvest',
    );
  });
});

describe('stripRelicEffect', () => {
  it('preserves bullet markers and newlines while stripping links and templates', () => {
    const input =
      '* Toggleable effect: All resources gathered will be sent to the bank.\n' +
      '* Resources gathered from [[Fishing]], [[Woodcutting]], and [[Mining]] are multiplied by 2.\n' +
      '{{efn|name=ignore|some footnote}}\n' +
      '* XP is granted for all additional resources gathered.';
    const out = stripRelicEffect(input);
    expect(out).toContain('* Toggleable effect:');
    expect(out).toContain('* Resources gathered from Fishing, Woodcutting, and Mining are multiplied by 2.');
    expect(out).not.toContain('[[');
    expect(out).not.toContain('{{');
    expect(out.split('\n').length).toBeGreaterThanOrEqual(3);
  });
});

describe('splitRowCells', () => {
  it('treats a bare-pipe line as the start of a multi-line cell', () => {
    const row = [
      '|[[File:Foo.png|center]]',
      '|[[Page|Some Name]]',
      '|',
      '* line one',
      '* line two',
    ].join('\n');
    const cells = splitRowCells(row);
    expect(cells).toHaveLength(3);
    expect(cells[0]).toContain('File:Foo.png');
    expect(cells[1]).toContain('Some Name');
    expect(cells[2]).toContain('line one');
    expect(cells[2]).toContain('line two');
  });
});

describe('parseRelicsWikitext', () => {
  it('extracts {tier, name, effect} from a synthetic two-tier sample', () => {
    const wt = [
      '===Tier 1 (0 Points)===',
      "'''Passive Effects:'''",
      '* Some passive note.',
      '{| class="wikitable lighttable"',
      '!Icon',
      '!Name',
      '!Effect',
      '|-',
      '|[[File:Alpha.png|center]]',
      '|[[Alpha (Demonic Pacts League)|Alpha]]',
      '|',
      '* Effect line one.',
      '* Effect line two.',
      '|-',
      '|[[File:Beta.png|center]]',
      '|[[Beta (Demonic Pacts League)|Beta]]',
      '|',
      'A single-line effect.',
      '|}',
      '',
      '===Tier 2 (600 points)===',
      '{| class="wikitable lighttable"',
      '!Icon',
      '!Name',
      '!Effect',
      '|-',
      '|[[File:Gamma.png|center]]',
      '|[[Gamma (Demonic Pacts League)|Gamma]]',
      '|',
      '* Gamma effect.',
      '|}',
    ].join('\n');
    const { relics, warnings } = parseRelicsWikitext(wt);
    expect(warnings).toEqual([]);
    expect(relics).toHaveLength(3);
    expect(relics[0]).toEqual({
      tier: 1,
      name: 'Alpha',
      effect: '* Effect line one.\n* Effect line two.',
    });
    expect(relics[1]).toEqual({
      tier: 1,
      name: 'Beta',
      effect: 'A single-line effect.',
    });
    expect(relics[2]).toEqual({
      tier: 2,
      name: 'Gamma',
      effect: '* Gamma effect.',
    });
  });

  it('skips empty rows produced by stray |- separators', () => {
    const wt = [
      '===Tier 5 (5,200 points)===',
      '{| class="wikitable lighttable"',
      '!Icon',
      '!Name',
      '!Effect',
      '|-',
      '|-',
      '|[[File:Delta.png|center]]',
      '|[[Delta (Demonic Pacts League)|Delta]]',
      '|',
      '* Delta effect.',
      '|}',
    ].join('\n');
    const { relics } = parseRelicsWikitext(wt);
    expect(relics).toHaveLength(1);
    expect(relics[0].name).toBe('Delta');
  });
});
