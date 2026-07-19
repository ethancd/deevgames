// EngineAPI.getCardBaseValue -- a minimal, additive read-only lookup added
// alongside the r2-claude-the-insolvency-clause / r2-human-audit-the-auditors
// implement job. HookHandlerContext otherwise only exposes the resolving
// card's OWN effect (via its module's closure); cards that need to
// compare/rank OTHER cards' point values (e.g. "destroy the opponent's most
// valuable keeper") had no way to see another card's baseValue. This just
// exposes a value the engine already tracks internally (see
// src/engine/api.ts's score()), without changing any existing primitive's
// behavior.

import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('EngineAPI.getCardBaseValue', () => {
  it("returns a real card's registered baseValue", () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    expect(game.api.getCardBaseValue('starter-pocket-nebula')).toBe(1);
  });

  it('returns 0 for an unknown cardId', () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    expect(game.api.getCardBaseValue('not-a-real-card-id')).toBe(0);
  });

  it('reflects a synthetic test card baseValue registered via extraEffects', () => {
    const def = testCardDef('test-value-keeper', { createdInRound: 5 });
    const effect = testKeeperEffect('test-value-keeper', 3);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
    });
    expect(game.api.getCardBaseValue('test-value-keeper')).toBe(3);
  });

  it('does not change what score() or any existing primitive returns (purely additive)', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['starter-pocket-nebula'] },
    });
    await game.play('starter-pocket-nebula');
    expect(await game.score('human')).toBe(game.api.getCardBaseValue('starter-pocket-nebula'));
  });
});
