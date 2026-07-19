import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineContent, fixtureDriftTest } from '../src/schema.ts';

// A toy Creature/Card pair mirroring might-and-magic-spire's
// packages/schema Source*/CardDef seam (card.sourceId -> creature.id).

const Creature = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number().int().min(1),
});
type Creature = z.infer<typeof Creature>;

const Card = z.object({
  id: z.string(),
  sourceId: z.string(),
  name: z.string(),
  cost: z.number().int().min(0),
});
type Card = z.infer<typeof Card>;

const fixtureCreature: Creature = { id: 'goblin', name: 'Goblin', hp: 5 };
const fixtureCard: Card = { id: 'card_goblin', sourceId: 'goblin', name: 'Goblin', cost: 1 };

function cardSeam(creatures: Creature[]) {
  return {
    name: 'card.sourceId -> creature.id',
    check(cards: Card[]) {
      const ids = new Set(creatures.map((c) => c.id));
      for (const card of cards) {
        if (!ids.has(card.sourceId)) {
          throw new Error(`card "${card.id}" has no matching creature for sourceId "${card.sourceId}"`);
        }
      }
    },
  };
}

describe('a healthy content def yields no issues', () => {
  const creatures = defineContent({ name: 'creature', schema: Creature, fixtures: [fixtureCreature] });
  const cards = defineContent({
    name: 'card',
    schema: Card,
    fixtures: [fixtureCard],
    seams: [cardSeam(creatures.fixtures)],
  });

  it('creatures', () => {
    expect(fixtureDriftTest(creatures)).toEqual([]);
  });

  it('cards, including the sourceId seam', () => {
    expect(fixtureDriftTest(cards)).toEqual([]);
  });
});

describe('a deliberately broken fixture surfaces as an issue, not a throw', () => {
  it('schema violation (hp below minimum) is collected, never thrown', () => {
    const broken = defineContent({
      name: 'creature',
      schema: Creature,
      fixtures: [{ id: 'x', name: 'X', hp: -1 } as Creature],
    });

    let issues: string[] = [];
    expect(() => {
      issues = fixtureDriftTest(broken);
    }).not.toThrow();

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain('creature');
    expect(issues[0]).toContain('hp');
  });
});

describe('a violated seam surfaces as an issue, not a throw', () => {
  it('dangling sourceId is collected, never thrown', () => {
    const cards = defineContent({
      name: 'card',
      schema: Card,
      fixtures: [{ id: 'card_ghost', sourceId: 'nonexistent', name: 'Ghost', cost: 2 }],
      seams: [cardSeam([fixtureCreature])],
    });

    let issues: string[] = [];
    expect(() => {
      issues = fixtureDriftTest(cards);
    }).not.toThrow();

    expect(issues.some((i) => i.includes('seam') && i.includes('nonexistent'))).toBe(true);
  });
});

describe('parse()', () => {
  it('returns the parsed value for valid input', () => {
    const content = defineContent({ name: 'creature', schema: Creature, fixtures: [] });
    expect(content.parse(fixtureCreature)).toEqual(fixtureCreature);
  });

  it('throws a contextual error (naming the content and the failing path) for invalid input', () => {
    const content = defineContent({ name: 'creature', schema: Creature, fixtures: [] });
    expect(() => content.parse({ id: 'x', name: 'X', hp: 0 })).toThrow(/creature/);
    expect(() => content.parse({ id: 'x', name: 'X', hp: 0 })).toThrow(/hp/);
  });
});
