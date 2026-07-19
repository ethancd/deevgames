import { describe, it, expect } from 'vitest';
import { parseContentCsv } from '../src/csv.ts';

function resolveFk(type: string, key: string): unknown {
  if (type === 'creature') {
    if (key === 'doesnotexist') throw new Error(`no such creature "${key}"`);
    return `creature:${key}`;
  }
  if (type === 'tag') return `tag:${key}`;
  if (type === 'ability') return `ability:${key}`;
  throw new Error(`unresolvable type "${type}"`);
}

// A self-describing CSV covering: two Creature rows (one with a quoted cell
// containing a comma and an escaped quote), a blank-row model switch into
// Card, fk__ resolution, m2m__ and goc_m2m__ list resolution, the
// SKIP_VALUES sentinel ("none"/"skip") omitting whole fields, a ragged row,
// and an fk resolver failure.
const csvText = [
  'Creature,id,name,hp',
  'Creature,goblin,Goblin,5',
  'Creature,ogre,"Ogre, ""the Strong""",12',
  '',
  'Card,id,fk__creature__sourceId,m2m__tag__tags,goc_m2m__ability__abilities,cost',
  'Card,card_goblin,goblin,melee|common,fireball|iceblast,1',
  'Card,card_ogre,ogre,none,skip,2',
  'Card,card_bad,ogre,melee',
  'Card,card_unknown,doesnotexist,melee|common,fireball,3',
].join('\n');

describe('parseContentCsv round trip', () => {
  const result = parseContentCsv(csvText, { resolveFk });

  it('parses plain fields across the blank-row model switch', () => {
    const creatures = result.records.filter((r) => r.type === 'Creature');
    expect(creatures).toHaveLength(2);
    expect(creatures[0].fields).toEqual({ id: 'goblin', name: 'Goblin', hp: '5' });
  });

  it('handles a quoted cell with an embedded comma and escaped quotes', () => {
    const ogre = result.records.find((r) => r.type === 'Creature' && r.fields.id === 'ogre');
    expect(ogre?.fields.name).toBe('Ogre, "the Strong"');
  });

  it('resolves fk__ columns via resolveFk', () => {
    const goblinCard = result.records.find((r) => r.fields.id === 'card_goblin');
    expect(goblinCard?.fields.sourceId).toBe('creature:goblin');
  });

  it('resolves m2m__ columns into an array, item-wise, split on "|"', () => {
    const goblinCard = result.records.find((r) => r.fields.id === 'card_goblin');
    expect(goblinCard?.fields.tags).toEqual(['tag:melee', 'tag:common']);
  });

  it('resolves goc_m2m__ columns identically to m2m__ (semantics live in the resolver)', () => {
    const goblinCard = result.records.find((r) => r.fields.id === 'card_goblin');
    expect(goblinCard?.fields.abilities).toEqual(['ability:fireball', 'ability:iceblast']);
  });

  it('omits a field entirely when its cell is a skip-sentinel value', () => {
    const ogreCard = result.records.find((r) => r.fields.id === 'card_ogre');
    expect(ogreCard?.fields).not.toHaveProperty('tags');
    expect(ogreCard?.fields).not.toHaveProperty('abilities');
    expect(ogreCard?.fields.cost).toBe('2');
  });

  it('drops a ragged row (wrong field count) and warns about it', () => {
    expect(result.records.some((r) => r.fields.id === 'card_bad')).toBe(false);
    expect(result.warnings.some((w) => /ragged row/.test(w))).toBe(true);
  });

  it('records a resolver failure as a warning and still includes the rest of the row fields', () => {
    const unknownCard = result.records.find((r) => r.fields.id === 'card_unknown');
    expect(unknownCard).toBeDefined();
    expect(unknownCard?.fields).not.toHaveProperty('sourceId');
    expect(unknownCard?.fields.tags).toEqual(['tag:melee', 'tag:common']);
    expect(result.warnings.some((w) => w.includes('resolver failed') && w.includes('doesnotexist'))).toBe(true);
  });

  it('produces per-type counts that exclude dropped (ragged) rows', () => {
    expect(result.counts.Creature).toBe(2);
    expect(result.counts.Card).toBe(3); // card_goblin, card_ogre, card_unknown — not card_bad
  });
});

describe('unknown column kinds', () => {
  it('warns and ignores a column whose header does not match a known kind', () => {
    const text = ['Widget,id,weird__type__field', 'Widget,w1,whatever'].join('\n');
    const result = parseContentCsv(text, { resolveFk });

    expect(result.warnings.some((w) => w.includes('unknown column kind'))).toBe(true);
    expect(result.records[0].fields).toEqual({ id: 'w1' });
  });
});

describe('custom skipValues', () => {
  it('honors a caller-supplied skip sentinel set instead of the default', () => {
    const text = ['Widget,id,name', 'Widget,w1,OMIT'].join('\n');
    const result = parseContentCsv(text, { resolveFk, skipValues: ['OMIT'] });

    expect(result.records[0].fields).toEqual({ id: 'w1' });
    expect(result.records[0].fields).not.toHaveProperty('name');
  });
});
