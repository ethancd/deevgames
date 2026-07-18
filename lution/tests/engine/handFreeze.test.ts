// EngineAPI.freezeHandCard/isHandCardFrozen -- a minimal, additive
// primitive added alongside r5-human-frost-pact ("freeze a chosen card in
// your hand ... can't be played"). Distinct from setScoreOverride (a
// KEEPER's in-play score contribution) and from isLocked (an entire CARD
// TYPE not yet implemented): this flags a single HAND instance as
// unplayable. Enforced by resolvePlay (src/engine/engine.ts) and mirrored
// by the AI's chooseCardToPlay filter (src/ai/player.ts).

import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';
import { resolvePlay } from '../../src/engine/engine';
import { chooseCardToPlay } from '../../src/ai/player';

describe('EngineAPI.freezeHandCard / isHandCardFrozen', () => {
  it('isHandCardFrozen is false until freezeHandCard is called for that instance', () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['starter-pocket-nebula'] },
    });
    const instanceId = game.state().players.human.hand[0].instanceId;
    expect(game.api.isHandCardFrozen(instanceId)).toBe(false);
    game.api.freezeHandCard(instanceId);
    expect(game.api.isHandCardFrozen(instanceId)).toBe(true);
  });

  it('a frozen hand card is still drawable/holdable/discardable, but a play attempt is rejected', async () => {
    const def = testCardDef('test-freeze-hand-keeper');
    const effect = testKeeperEffect('test-freeze-hand-keeper', 3);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-freeze-hand-keeper'] },
    });
    const instanceId = game.state().players.human.hand[0].instanceId;
    game.api.freezeHandCard(instanceId);

    await expect(resolvePlay(game.runtime, 'human', instanceId)).rejects.toThrow(/frozen/i);
    // The rejected play must not have moved the card anywhere.
    expect(game.state().players.human.hand).toHaveLength(1);
    expect(game.state().players.human.inPlay).toHaveLength(0);

    // Still discardable -- freezing only guards resolvePlay, not
    // moveToDiscard (a discard triggered by some other effect, or the
    // player's own choice to bin it, isn't "playing" the card).
    await game.api.moveToDiscard('human', instanceId, 'hand');
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['test-freeze-hand-keeper']);
  });

  it('an unfrozen instance of the same cardId elsewhere is unaffected', async () => {
    const def = testCardDef('test-freeze-hand-sibling');
    const effect = testKeeperEffect('test-freeze-hand-sibling', 1);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-freeze-hand-sibling'], claude: ['test-freeze-hand-sibling'] },
      firstPlayer: 'claude',
    });
    const humanInstanceId = game.state().players.human.hand[0].instanceId;
    game.api.freezeHandCard(humanInstanceId);

    const claudeInstanceId = game.state().players.claude.hand[0].instanceId;
    expect(game.api.isHandCardFrozen(claudeInstanceId)).toBe(false);
    const result = await resolvePlay(game.runtime, 'claude', claudeInstanceId);
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.claude.inPlay).toHaveLength(1);
  });

  it("the built-in AI's chooseCardToPlay never selects a frozen instance", () => {
    const bigDef = testCardDef('test-freeze-ai-big');
    const bigEffect = testKeeperEffect('test-freeze-ai-big', 9);
    const smallDef = testCardDef('test-freeze-ai-small');
    const smallEffect = testKeeperEffect('test-freeze-ai-small', 1);
    const game = createTestGame({
      extraRegistry: [bigDef, smallDef],
      extraEffects: [bigEffect, smallEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-freeze-ai-big', 'test-freeze-ai-small'] },
    });

    const bigInstanceId = game.state().players.human.hand.find(
      (i) => i.cardId === 'test-freeze-ai-big'
    )!.instanceId;
    game.api.freezeHandCard(bigInstanceId);

    const view = {
      self: 'human' as const,
      opponent: 'claude' as const,
      state: game.state(),
      score: () => 0,
    };
    const chosen = chooseCardToPlay(view, game.effects, 10);
    expect(chosen?.cardId).toBe('test-freeze-ai-small');
  });
});
