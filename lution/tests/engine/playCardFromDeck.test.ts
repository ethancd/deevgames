// EngineAPI.playCardFromDeck -- a minimal, additive primitive added
// alongside the r7-human-rime-portal implement job ("find a card in your
// deck and play it"). Finds a specific instance in a player's draw pile and
// resolves it exactly as resolvePlay would (src/engine/engine.ts): a keeper
// enters play via moveToPlay, an action dispatches its onPlay hook and is
// discarded unless a handler cancels it. See src/engine/types.ts's EngineAPI
// doc comment.

import { describe, it, expect } from 'vitest';
import { createTestGame, testActionEffect, testCardDef, testKeeperEffect } from '../helpers';

describe('EngineAPI.playCardFromDeck', () => {
  it('throws if the instance is not in that player\'s draw pile', async () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    await expect(game.api.playCardFromDeck('human', 'not-a-real-instance')).rejects.toThrow(/draw pile/i);
  });

  it('finds a keeper in the draw pile, moves it to hand, and resolves it into play', async () => {
    const def = testCardDef('test-deck-keeper');
    const effect = testKeeperEffect('test-deck-keeper', 3);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: ['test-deck-keeper'], claude: [] },
      hands: { human: [] },
    });
    const instanceId = game.state().players.human.drawPile[0].instanceId;

    await game.api.playCardFromDeck('human', instanceId);

    expect(game.state().players.human.drawPile).toHaveLength(0);
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['test-deck-keeper']);
    expect(await game.score('human')).toBe(3);
  });

  it("finds an action in the draw pile, resolves its onPlay hook, and discards it", async () => {
    let onPlayRan = false;
    const def = testCardDef('test-deck-action');
    const effect = testActionEffect('test-deck-action', {
      hooks: {
        onPlay: {
          scope: 'inHand',
          handler: () => {
            onPlayRan = true;
          },
        },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: ['test-deck-action'], claude: [] },
      hands: { human: [] },
    });
    const instanceId = game.state().players.human.drawPile[0].instanceId;

    await game.api.playCardFromDeck('human', instanceId);

    expect(onPlayRan).toBe(true);
    expect(game.state().players.human.drawPile).toHaveLength(0);
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.inPlay).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['test-deck-action']);
  });

  it('leaves the found action sitting in hand (not discarded) if its onPlay hook cancels', async () => {
    const def = testCardDef('test-deck-cancel');
    const effect = testActionEffect('test-deck-cancel', {
      hooks: {
        onPlay: {
          scope: 'inHand',
          handler: () => ({ cancel: true }),
        },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: ['test-deck-cancel'], claude: [] },
      hands: { human: [] },
    });
    const instanceId = game.state().players.human.drawPile[0].instanceId;

    await game.api.playCardFromDeck('human', instanceId);

    expect(game.state().players.human.hand.map((i) => i.cardId)).toEqual(['test-deck-cancel']);
    expect(game.state().players.human.discard).toHaveLength(0);
  });

  it('leaves a found cardId with no registered effect module sitting in hand instead of erroring', async () => {
    const game = createTestGame({
      decks: { human: ['totally-unregistered-card-id'], claude: [] },
      hands: { human: [] },
    });
    const instanceId = game.state().players.human.drawPile[0].instanceId;

    await expect(game.api.playCardFromDeck('human', instanceId)).resolves.toBeUndefined();
    expect(game.state().players.human.hand.map((i) => i.cardId)).toEqual(['totally-unregistered-card-id']);
  });

  it('only removes the targeted instance from the draw pile, leaving siblings untouched', async () => {
    const def = testCardDef('test-deck-sibling');
    const effect = testKeeperEffect('test-deck-sibling', 1);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: ['test-deck-sibling', 'test-deck-sibling'], claude: [] },
      hands: { human: [] },
    });
    const [first, second] = game.state().players.human.drawPile;

    await game.api.playCardFromDeck('human', first.instanceId);

    expect(game.state().players.human.drawPile.map((i) => i.instanceId)).toEqual([second.instanceId]);
    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual([first.instanceId]);
  });
});
