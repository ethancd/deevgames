// EngineAPI.playCopyOf -- a minimal, additive primitive added alongside the
// r6-human-mirrorblob implement job ("pick a card in your hand or your
// opponent's hand -- copy the effect of that card"). Synthesizes a
// brand-new instance (never sourced from any existing zone) and resolves it
// exactly as if `controller` had just played it, leaving every existing
// instance/zone untouched. See src/engine/types.ts's EngineAPI doc comment.

import { describe, it, expect } from 'vitest';
import { createTestGame, testActionEffect, testCardDef, testKeeperEffect } from '../helpers';

describe('EngineAPI.playCopyOf', () => {
  it('copies a keeper: a brand-new instance enters the CONTROLLER\'s play, contributing its base value', async () => {
    const def = testCardDef('test-copy-keeper');
    const effect = testKeeperEffect('test-copy-keeper', 4);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: [], claude: [] },
    });

    await game.api.playCopyOf('human', 'test-copy-keeper');

    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['test-copy-keeper']);
    expect(await game.score('human')).toBe(4);
    expect(await game.score('claude')).toBe(0);
  });

  it("copying a keeper fires its onEnterPlay hook for the CONTROLLER", async () => {
    let enterOwner: string | undefined;
    const def = testCardDef('test-copy-keeper-enter');
    const effect = testKeeperEffect('test-copy-keeper-enter', 1, {
      hooks: {
        onEnterPlay: {
          scope: 'inPlay',
          handler: (ctx) => {
            enterOwner = ctx.owner;
          },
        },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: [], claude: [] },
    });

    await game.api.playCopyOf('claude', 'test-copy-keeper-enter');

    expect(enterOwner).toBe('claude');
  });

  it("copies an action: resolves its onPlay hook AS the controller and lands the copy in the controller's discard", async () => {
    let onPlayOwner: string | undefined;
    const def = testCardDef('test-copy-action');
    const effect = testActionEffect('test-copy-action', {
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
      decks: { human: [], claude: [] },
      hands: { human: [], claude: [] },
    });

    await game.api.playCopyOf('human', 'test-copy-action');

    expect(onPlayOwner).toBe('human');
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['test-copy-action']);
    expect(game.state().players.human.inPlay).toHaveLength(0);
  });

  it('a cancelled action copy is simply dropped -- not left sitting in any hand, not discarded', async () => {
    const def = testCardDef('test-copy-cancel');
    const effect = testActionEffect('test-copy-cancel', {
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
      decks: { human: [], claude: [] },
      hands: { human: [], claude: [] },
    });

    await game.api.playCopyOf('human', 'test-copy-cancel');

    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.discard).toHaveLength(0);
    expect(game.state().players.human.inPlay).toHaveLength(0);
  });

  it('a cardId with no registered effect module is logged and dropped instead of erroring', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: [], claude: [] },
    });

    await expect(game.api.playCopyOf('human', 'totally-unregistered-copy-card')).resolves.toBeUndefined();
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.discard).toHaveLength(0);
    expect(game.state().players.human.inPlay).toHaveLength(0);
  });

  it('does not touch or remove any existing card anywhere -- the "source" of the copy is never a real instance', async () => {
    const def = testCardDef('test-copy-source-untouched');
    const effect = testKeeperEffect('test-copy-source-untouched', 2);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-copy-source-untouched'], claude: [] },
    });
    const originalInstanceId = game.state().players.human.hand[0].instanceId;

    await game.api.playCopyOf('human', 'test-copy-source-untouched');

    // The original stays exactly where it was, in hand.
    expect(game.state().players.human.hand.map((i) => i.instanceId)).toEqual([originalInstanceId]);
    // A SECOND, independent instance now sits in play.
    expect(game.state().players.human.inPlay).toHaveLength(1);
    expect(game.state().players.human.inPlay[0].instanceId).not.toBe(originalInstanceId);
    expect(await game.score('human')).toBe(2);
  });

  it('generates unique ids across repeated calls, never colliding with real dealt instance ids', async () => {
    const def = testCardDef('test-copy-unique');
    const effect = testKeeperEffect('test-copy-unique', 1);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: [], claude: [] },
    });

    await game.api.playCopyOf('human', 'test-copy-unique');
    await game.api.playCopyOf('human', 'test-copy-unique');
    await game.api.playCopyOf('human', 'test-copy-unique');

    const ids = game.state().players.human.inPlay.map((i) => i.instanceId);
    expect(new Set(ids).size).toBe(3);
    expect(await game.score('human')).toBe(3);
  });
});
