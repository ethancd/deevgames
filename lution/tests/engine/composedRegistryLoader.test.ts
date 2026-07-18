// M2 end-to-end check: a registry row carrying a `composition` (shared/
// types.ts's CardDef.composition) is playable through the ordinary
// createTestGame path with NO extraEffects entry supplied for it --
// tests/helpers.ts's createTestGame now builds its effects map via
// src/engine/effectsLoader.ts's loadEffects(registryList), which compiles
// registry-carried compositions on the spot. This is the one hand-authored
// composition fixture the M2 plan calls for: it proves the LOADER wiring
// (registry -> effectsLoader -> compileComposition), distinct from
// tests/engine/compileComposition.test.ts's much larger behavioral suite,
// which always hands compileComposition's output straight to extraEffects
// and never exercises the registry/loader path at all.

import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef } from '../helpers';
import type { CardComposition } from '../../shared/atoms';

describe('registry composition -> effectsLoader.loadEffects (M2 loader integration)', () => {
  it('a registry row with a composition and no bespoke module plays end-to-end via loadEffects', async () => {
    const cardId = 'test-m2-composed-fixture';
    const fillerCardId = 'test-m2-filler-keeper';

    const composition: CardComposition = {
      cardType: 'keeper',
      baseValue: 1,
      effects: [{ trigger: 'onEnterPlay', body: { atom: 'draw', target: 'self' } }],
    };

    const game = createTestGame({
      // No `extraEffects` entry for cardId at all -- createTestGame's
      // internal loadEffects(registryList) call must compile it straight
      // from this registry row's `composition` field.
      extraRegistry: [{ ...testCardDef(cardId), composition }, testCardDef(fillerCardId)],
      decks: { human: [fillerCardId], claude: [] },
      hands: { human: [cardId] },
    });

    // Proves the loader path actually ran (not just that the game object
    // exists): the effect is present despite never being passed via
    // extraEffects.
    expect(game.effects.has(cardId)).toBe(true);
    expect(game.state().players.human.drawPile).toHaveLength(1);

    await game.play(cardId);

    // baseValue scored...
    expect(await game.score('human')).toBe(1);
    // ...and the onEnterPlay -> draw(self) atom fired for real, moving the
    // filler keeper out of the draw pile and into hand.
    expect(game.state().players.human.drawPile).toHaveLength(0);
    expect(game.state().players.human.hand.map((i) => i.cardId)).toContain(fillerCardId);
  });
});
