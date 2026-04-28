import { describe, it, expect } from 'vitest';
import { parseEffectMarkup } from '../src/lib/effectMarkup';

describe('parseEffectMarkup', () => {
  it('returns an empty array for empty input', () => {
    expect(parseEffectMarkup('')).toEqual([]);
  });

  it('treats bare prose as a paragraph block', () => {
    expect(parseEffectMarkup('Just some prose.')).toEqual([
      { kind: 'p', text: 'Just some prose.' },
    ]);
  });

  it('groups consecutive top-level bullets into a single list', () => {
    const blocks = parseEffectMarkup(['* one', '* two', '* three'].join('\n'));
    expect(blocks).toEqual([
      {
        kind: 'list',
        items: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
      },
    ]);
  });

  it('nests `**` items under the previous top-level item', () => {
    const blocks = parseEffectMarkup(
      ['* parent A', '** child A1', '** child A2', '* parent B'].join('\n'),
    );
    expect(blocks).toEqual([
      {
        kind: 'list',
        items: [
          { text: 'parent A', children: [{ text: 'child A1' }, { text: 'child A2' }] },
          { text: 'parent B' },
        ],
      },
    ]);
  });

  it('handles wiki authoring quirks: missing space after asterisk and trailing whitespace', () => {
    const blocks = parseEffectMarkup(
      ['*Tight bullet ', '*  loose bullet  ', '** nested  '].join('\n'),
    );
    expect(blocks).toEqual([
      {
        kind: 'list',
        items: [
          { text: 'Tight bullet' },
          { text: 'loose bullet', children: [{ text: 'nested' }] },
        ],
      },
    ]);
  });

  it('breaks the current list when a prose paragraph appears', () => {
    const blocks = parseEffectMarkup(
      ['* item one', 'A prose break.', '* item two'].join('\n'),
    );
    expect(blocks).toEqual([
      { kind: 'list', items: [{ text: 'item one' }] },
      { kind: 'p', text: 'A prose break.' },
      { kind: 'list', items: [{ text: 'item two' }] },
    ]);
  });

  it('promotes orphan `**` items at the start to top-level instead of dropping them', () => {
    const blocks = parseEffectMarkup(['** orphan', '* second'].join('\n'));
    expect(blocks).toEqual([
      {
        kind: 'list',
        items: [{ text: 'orphan' }, { text: 'second' }],
      },
    ]);
  });
});
