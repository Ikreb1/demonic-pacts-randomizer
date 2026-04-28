import { describe, it, expect } from 'vitest';
import { parseWikitext, __test_helpers } from '../scripts/parse-wikitext.mjs';

const { findTemplateBlocks, splitTopLevelPipes, stripWikiMarkup } = __test_helpers;

describe('findTemplateBlocks', () => {
  it('finds top-level templates and ignores nested ones', () => {
    const wt = '{{DPLTaskRow|name|desc|s={{SCP|Magic|9}}|tier=easy|id=1}} between {{DPLTaskRow|n2|d2|tier=hard|id=2}}';
    const blocks = findTemplateBlocks(wt, 'DPLTaskRow');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('id=1');
    expect(blocks[1]).toContain('id=2');
  });
});

describe('splitTopLevelPipes', () => {
  it('does not split inside nested templates or links', () => {
    const body = '|name|desc with [[link|alias]]|s={{SCP|Magic|9}}|tier=easy|id=1';
    const parts = splitTopLevelPipes(body);
    expect(parts).toEqual(['', 'name', 'desc with [[link|alias]]', 's={{SCP|Magic|9}}', 'tier=easy', 'id=1']);
  });
});

describe('stripWikiMarkup', () => {
  it('strips piped links', () => {
    expect(stripWikiMarkup('Visit [[Some Place|the place]] please')).toBe('Visit the place please');
  });
  it('strips bare links', () => {
    expect(stripWikiMarkup('[[Altar]]s exist')).toBe('Altars exist');
  });
  it('expands SCP templates with optional args', () => {
    expect(stripWikiMarkup('{{SCP|Magic|9|link=yes}}')).toBe('9 Magic');
  });
});

describe('parseWikitext', () => {
  it('parses positional name+description and named id/tier/region', () => {
    const wt =
      '{{DPLTaskRow|Activate a prayer near an altar|Activate a prayer near an [[altar]].|s=|other=|tier=easy|region=General|id=3}}';
    const { tasks, warnings } = parseWikitext(wt);
    expect(warnings).toHaveLength(0);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: 3,
      tier: 'easy',
      region: 'General',
      name: 'Activate a prayer near an altar',
      description: 'Activate a prayer near an altar.',
    });
  });

  it('combines skill and other requirements', () => {
    const wt =
      '{{DPLTaskRow|x|y|s={{SCP|Magic|9|link=yes}}|other=Have a fire staff|tier=easy|region=General|id=10}}';
    const { tasks } = parseWikitext(wt);
    expect(tasks[0].requirements).toContain('9 Magic');
    expect(tasks[0].requirements).toContain('Have a fire staff');
  });

  it('rejects duplicate ids', () => {
    const wt =
      '{{DPLTaskRow|a|b|tier=easy|region=General|id=1}}{{DPLTaskRow|c|d|tier=hard|region=General|id=1}}';
    const { tasks, warnings } = parseWikitext(wt);
    expect(tasks).toHaveLength(1);
    expect(warnings.some((w) => /duplicate id 1/.test(w))).toBe(true);
  });

  it('rejects unknown regions and tiers', () => {
    const wt = '{{DPLTaskRow|a|b|tier=insane|region=Atlantis|id=1}}';
    const { tasks, warnings } = parseWikitext(wt);
    expect(tasks).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
