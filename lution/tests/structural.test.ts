// Structural invariants tying data/cards.json (the registry) to
// src/effects/*.ts (the effect modules). This is the fast check
// `npm run test:cards` runs after every implement job. Deliberately
// independent of src/engine/effectsLoader.ts (which may be a stub at any
// given milestone) — it globs the effects directory directly.

import { describe, it, expect } from 'vitest';
import cardsJson from '../data/cards.json';
import type { CardDef, PlayerId } from '../shared/types';
import type { CardEffect } from '../src/engine/types';
import { validateCompositionShape, validateCompositionSemantics } from '../shared/atoms';

const registry = cardsJson as CardDef[];

type EffectModule = { default: CardEffect };

// Eager glob mirrors src/engine/effectsLoader.ts's loadAllEffects(): every
// non-underscore-prefixed module under src/effects/.
const modules = import.meta.glob('../src/effects/*.ts', { eager: true }) as Record<
  string,
  EffectModule
>;

function isUnderscored(path: string): boolean {
  return (path.split('/').pop() ?? '').startsWith('_');
}

function filenameOf(path: string): string {
  return (path.split('/').pop() ?? '').replace(/\.ts$/, '');
}

const effectEntries = Object.entries(modules).filter(([path]) => !isUnderscored(path));

const registryById = new Map(registry.map((c) => [c.id, c]));
const activeCards = registry.filter((c) => c.implemented && !c.destroyed);

describe('registry <-> effect module structural invariants', () => {
  it('every implemented, non-destroyed registry card has a matching effect module or a valid composition', () => {
    // M2 (shared/atoms.ts + src/engine/compileComposition.ts) added a second
    // legitimate way for a registry row to have an effect: a `composition`
    // field compiled on the spot (see loadEffects's precedence in
    // src/engine/effectsLoader.ts). A bespoke module is no longer the only
    // way to satisfy this invariant -- M6's whole premise is recompiling
    // cards to compositions and deleting their module files.
    for (const card of activeCards) {
      const match = effectEntries.find(([path]) => filenameOf(path) === card.id);
      if (match) continue;
      expect(
        card.composition,
        `no src/effects/${card.id}.ts module and no composition found for registry card "${card.id}"`
      ).toBeDefined();
    }
  });

  it('every effect module filename matches its default export cardId, and matches a registry id', () => {
    for (const [path, mod] of effectEntries) {
      const filename = filenameOf(path);
      expect(mod.default, `${path} has no default export`).toBeDefined();
      expect(
        mod.default.cardId,
        `${path}: default.cardId ("${mod.default.cardId}") must equal filename ("${filename}")`
      ).toBe(filename);

      const registryEntry = registryById.get(mod.default.cardId);
      expect(
        registryEntry,
        `${path}: cardId "${mod.default.cardId}" has no matching entry in data/cards.json`
      ).toBeDefined();
    }
  });

  it('every effect module id exists in the registry', () => {
    for (const [path, mod] of effectEntries) {
      const registryEntry = registryById.get(mod.default.cardId);
      // NOTE: neither `implemented` nor `destroyed` is asserted here.
      // - implemented: the implement job writes the module first and the
      //   server flips the flag only after this suite passes.
      // - destroyed: a card can be destroyed AFTER being implemented (spurn/
      //   execution), and its module legitimately outlives it on disk.
      expect(
        registryEntry,
        `${path}: cardId "${mod.default.cardId}" has no matching entry in data/cards.json`
      ).toBeDefined();
    }
  });

  it('starter baseValue matches the point value stated in effectText', () => {
    const starters = registry.filter((c) => c.creatorId === 'starter');
    expect(starters).toHaveLength(20);

    for (const card of starters) {
      const entry = effectEntries.find(([p]) => filenameOf(p) === card.id);
      expect(entry, `no effect module found for starter "${card.id}"`).toBeDefined();
      if (!entry) continue;
      const mod = entry[1];

      const textMatch = card.effectText.match(/Worth (\d+) point/);
      expect(textMatch, `starter "${card.id}" effectText doesn't match the expected "Worth N point(s)" pattern`).toBeTruthy();
      const statedValue = Number(textMatch?.[1]);

      expect(mod.default.baseValue).toBe(statedValue);
    }
  });

  it("each startingOwner's 10 card ids are distinct (no-dup invariant)", () => {
    for (const owner of ['human', 'claude'] satisfies PlayerId[]) {
      const ids = registry.filter((c) => c.startingOwner === owner).map((c) => c.id);
      expect(ids).toHaveLength(10);
      expect(new Set(ids).size).toBe(10);
    }
  });

  it('no two starters (across both decks) share the same id', () => {
    const starterIds = registry.filter((c) => c.creatorId === 'starter').map((c) => c.id);
    expect(new Set(starterIds).size).toBe(starterIds.length);
  });

  // M2: composition invariants (shared/atoms.ts + src/engine/
  // compileComposition.ts's loading precedence -- see shared/types.ts's
  // CardDef.composition doc comment).
  it('every registry row carrying a composition validates against both the shape and semantic validators', () => {
    const knownCardIds = new Set(registry.map((c) => c.id));
    for (const card of registry) {
      if (!card.composition) continue;
      const shapeResult = validateCompositionShape(card.composition);
      expect(
        shapeResult.ok,
        `"${card.id}" composition failed shape validation: ${shapeResult.errors.join('; ')}`
      ).toBe(true);
      if (!shapeResult.ok || !shapeResult.value) continue;
      const semanticResult = validateCompositionSemantics(shapeResult.value, { knownCardIds });
      expect(
        semanticResult.ok,
        `"${card.id}" composition failed semantic validation: ${semanticResult.errors.join('; ')}`
      ).toBe(true);
    }
  });

  it('no registry row has BOTH a composition and a bespoke effect module -- one must win outright', () => {
    const moduleIds = new Set(effectEntries.map(([path]) => filenameOf(path)));
    for (const card of registry) {
      if (!card.composition) continue;
      expect(
        moduleIds.has(card.id),
        `"${card.id}" has both a composition and a src/effects/${card.id}.ts module -- delete one`
      ).toBe(false);
    }
  });
});
