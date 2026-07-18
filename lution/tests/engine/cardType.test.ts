// EngineAPI.getCardType -- a minimal, additive read-only lookup added
// alongside the r5-human-frost-pact implement job. It needs to tell "this
// card has no base point value at all" (an action card) apart from "this
// keeper's base value happens to be 0" (e.g. r2-human-crystalline-vampire),
// which getCardBaseValue's `?? 0` fallback can't distinguish on its own.

import { describe, it, expect } from 'vitest';
import { createTestGame, testActionEffect, testCardDef, testKeeperEffect } from '../helpers';

describe('EngineAPI.getCardType', () => {
  it("returns 'keeper' for a registered keeper card", () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    expect(game.api.getCardType('starter-pocket-nebula')).toBe('keeper');
  });

  it("returns 'action' for a registered action card", () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    expect(game.api.getCardType('r1-human-bone-chilling-breeze')).toBe('action');
  });

  it('returns undefined for an unknown cardId', () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    expect(game.api.getCardType('not-a-real-card-id')).toBeUndefined();
  });

  it('reflects a synthetic test card registered via extraEffects, keeper and action alike', () => {
    const keeperDef = testCardDef('test-type-keeper');
    const keeperEffect = testKeeperEffect('test-type-keeper', 0);
    const actionDef = testCardDef('test-type-action');
    const actionEffect = testActionEffect('test-type-action');
    const game = createTestGame({
      extraRegistry: [keeperDef, actionDef],
      extraEffects: [keeperEffect, actionEffect],
      decks: { human: [], claude: [] },
    });
    expect(game.api.getCardType('test-type-keeper')).toBe('keeper');
    expect(game.api.getCardType('test-type-action')).toBe('action');
  });

  it('distinguishes a 0-baseValue keeper from an action card, unlike getCardBaseValue alone', () => {
    const dynamicDef = testCardDef('test-type-dynamic-keeper');
    const dynamicEffect = testKeeperEffect('test-type-dynamic-keeper', 0);
    const game = createTestGame({
      extraRegistry: [dynamicDef],
      extraEffects: [dynamicEffect],
      decks: { human: [], claude: [] },
    });
    // Both report baseValue 0...
    expect(game.api.getCardBaseValue('test-type-dynamic-keeper')).toBe(0);
    expect(game.api.getCardBaseValue('r1-human-bone-chilling-breeze')).toBe(0);
    // ...but getCardType tells them apart.
    expect(game.api.getCardType('test-type-dynamic-keeper')).toBe('keeper');
    expect(game.api.getCardType('r1-human-bone-chilling-breeze')).toBe('action');
  });
});
