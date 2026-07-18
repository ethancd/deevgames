// EngineAPI.playCardFromDeckAs -- a minimal, additive primitive added
// alongside the r5-human-hunger-vortex implement job ("find a card in your
// opponent's deck and play it as your own"). Like playCardFromDeck, but the
// draw pile searched (deckOwner) and the player who ends up controlling the
// resolved play (controller) can be two different players. See
// src/engine/types.ts's EngineAPI doc comment.

import { describe, it, expect } from 'vitest';
import { createTestGame, testActionEffect, testCardDef, testKeeperEffect } from '../helpers';

describe('EngineAPI.playCardFromDeckAs', () => {
  it("throws if the instance is not in deckOwner's draw pile", async () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    await expect(
      game.api.playCardFromDeckAs('claude', 'human', 'not-a-real-instance')
    ).rejects.toThrow(/draw pile/i);
  });

  it("finds a keeper in the opponent's draw pile, and it enters the CONTROLLER's play (not the deck owner's)", async () => {
    const def = testCardDef('test-vortex-keeper');
    const effect = testKeeperEffect('test-vortex-keeper', 3);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: ['test-vortex-keeper'] },
      hands: { human: [], claude: [] },
    });
    const instanceId = game.state().players.claude.drawPile[0].instanceId;

    await game.api.playCardFromDeckAs('claude', 'human', instanceId);

    expect(game.state().players.claude.drawPile).toHaveLength(0);
    expect(game.state().players.claude.inPlay).toHaveLength(0);
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['test-vortex-keeper']);
    expect(await game.score('human')).toBe(3);
    expect(await game.score('claude')).toBe(0);
  });

  it("finds an action in the opponent's draw pile, resolves its onPlay hook AS the controller, and discards it to the controller's discard", async () => {
    let onPlayOwner: string | undefined;
    const def = testCardDef('test-vortex-action');
    const effect = testActionEffect('test-vortex-action', {
      hooks: {
        onPlay: {
          scope: 'inHand',
          handler: (ctx) => {
            onPlayOwner = ctx.owner;
          },
        },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: ['test-vortex-action'] },
      hands: { human: [], claude: [] },
    });
    const instanceId = game.state().players.claude.drawPile[0].instanceId;

    await game.api.playCardFromDeckAs('claude', 'human', instanceId);

    expect(onPlayOwner).toBe('human');
    expect(game.state().players.claude.drawPile).toHaveLength(0);
    expect(game.state().players.claude.discard).toHaveLength(0);
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['test-vortex-action']);
  });

  it("leaves the found action sitting in the CONTROLLER's hand (not discarded) if its onPlay hook cancels", async () => {
    const def = testCardDef('test-vortex-cancel');
    const effect = testActionEffect('test-vortex-cancel', {
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
      decks: { human: [], claude: ['test-vortex-cancel'] },
      hands: { human: [], claude: [] },
    });
    const instanceId = game.state().players.claude.drawPile[0].instanceId;

    await game.api.playCardFromDeckAs('claude', 'human', instanceId);

    expect(game.state().players.human.hand.map((i) => i.cardId)).toEqual(['test-vortex-cancel']);
    expect(game.state().players.human.discard).toHaveLength(0);
    expect(game.state().players.claude.hand).toHaveLength(0);
  });

  it("leaves a found cardId with no registered effect module sitting in the CONTROLLER's hand instead of erroring", async () => {
    const game = createTestGame({
      decks: { human: [], claude: ['totally-unregistered-card-id'] },
      hands: { human: [], claude: [] },
    });
    const instanceId = game.state().players.claude.drawPile[0].instanceId;

    await expect(game.api.playCardFromDeckAs('claude', 'human', instanceId)).resolves.toBeUndefined();
    expect(game.state().players.human.hand.map((i) => i.cardId)).toEqual(['totally-unregistered-card-id']);
    expect(game.state().players.claude.hand).toHaveLength(0);
  });

  it("only removes the targeted instance from the deck owner's draw pile, leaving siblings untouched", async () => {
    const def = testCardDef('test-vortex-sibling');
    const effect = testKeeperEffect('test-vortex-sibling', 1);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: ['test-vortex-sibling', 'test-vortex-sibling'] },
      hands: { human: [], claude: [] },
    });
    const [first, second] = game.state().players.claude.drawPile;

    await game.api.playCardFromDeckAs('claude', 'human', first.instanceId);

    expect(game.state().players.claude.drawPile.map((i) => i.instanceId)).toEqual([second.instanceId]);
    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual([first.instanceId]);
  });

  it('leaves EngineAPI.playCardFromDeck (single-player) behavior untouched', async () => {
    const def = testCardDef('test-vortex-plain-deck-keeper');
    const effect = testKeeperEffect('test-vortex-plain-deck-keeper', 5);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: ['test-vortex-plain-deck-keeper'], claude: [] },
      hands: { human: [] },
    });
    const instanceId = game.state().players.human.drawPile[0].instanceId;

    await game.api.playCardFromDeck('human', instanceId);

    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['test-vortex-plain-deck-keeper']);
    expect(await game.score('human')).toBe(5);
  });
});
