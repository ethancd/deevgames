import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('moveToHand', () => {
  it('moves a keeper from inPlay to hand, firing onLeavePlay but NOT onDiscard, and score recomputes', async () => {
    let leavePlayFired = false;
    let discardFired = false;
    const def = testCardDef('test-refund-keeper');
    const effect = testKeeperEffect('test-refund-keeper', 3, {
      hooks: {
        onLeavePlay: { handler: () => { leavePlayFired = true; } },
        onDiscard: { scope: 'always', handler: () => { discardFired = true; } },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-refund-keeper'] },
    });

    await game.play('test-refund-keeper');
    expect(await game.score('human')).toBe(3);
    const instanceId = game.state().players.human.inPlay[0].instanceId;

    await game.api.moveToHand(instanceId);

    const state = game.state();
    expect(state.players.human.inPlay).toHaveLength(0);
    expect(state.players.human.hand.map((i) => i.cardId)).toEqual(['test-refund-keeper']);
    expect(state.players.human.discard).toHaveLength(0);
    expect(leavePlayFired).toBe(true);
    expect(discardFired).toBe(false);
    expect(await game.score('human')).toBe(0);
    expect(state.log.some((e) => e.type === 'moveToHand')).toBe(true);
  });

  it('moves a card from discard to hand without firing any zone hooks', async () => {
    let leavePlayFired = false;
    let discardFired = false;
    const def = testCardDef('test-refund-discarded');
    const effect = testKeeperEffect('test-refund-discarded', 1, {
      hooks: {
        onLeavePlay: { handler: () => { leavePlayFired = true; } },
        onDiscard: { scope: 'always', handler: () => { discardFired = true; } },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-refund-discarded'] },
    });

    const instanceId = game.state().players.human.hand[0].instanceId;
    await game.api.moveToDiscard('human', instanceId, 'hand');
    leavePlayFired = false;
    discardFired = false; // reset after the moveToDiscard call's own onDiscard fire

    await game.api.moveToHand(instanceId);

    const state = game.state();
    expect(state.players.human.discard).toHaveLength(0);
    expect(state.players.human.hand.map((i) => i.cardId)).toEqual(['test-refund-discarded']);
    expect(leavePlayFired).toBe(false);
    expect(discardFired).toBe(false);
  });

  it('throws when the instance is in hand or the draw pile, or does not exist', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['starter-pocket-nebula'] },
    });
    const handInstanceId = game.state().players.human.hand[0].instanceId;

    await expect(game.api.moveToHand(handInstanceId)).rejects.toThrow();
    await expect(game.api.moveToHand('not-a-real-instance')).rejects.toThrow();
  });

  it('throws when the instance is in the draw pile', async () => {
    const game = createTestGame({
      decks: { human: ['starter-pocket-nebula'], claude: [] },
      hands: { human: [] },
    });
    const drawPileInstanceId = game.state().players.human.drawPile[0].instanceId;

    await expect(game.api.moveToHand(drawPileInstanceId)).rejects.toThrow();
  });
});

describe('onBeforeDestroy', () => {
  it('cancels the destroy when a handler moves the card to hand and returns {cancel: true}, and the guard does not throw', async () => {
    const def = testCardDef('test-refund-clause');
    const effect = testKeeperEffect('test-refund-clause', 1, {
      hooks: {
        onBeforeDestroy: {
          handler: async (ctx) => {
            await ctx.api.moveToHand(ctx.instance.instanceId);
            return { cancel: true };
          },
        },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-refund-clause'] },
    });

    await game.play('test-refund-clause');
    const instanceId = game.state().players.human.inPlay[0].instanceId;

    await expect(game.api.destroyKeeper('human', instanceId)).resolves.toBeUndefined();

    const state = game.state();
    expect(state.players.human.inPlay).toHaveLength(0);
    expect(state.players.human.discard).toHaveLength(0);
    expect(state.players.human.hand.map((i) => i.cardId)).toEqual(['test-refund-clause']);
    const destroyLog = state.log.find((e) => e.type === 'destroy');
    expect(destroyLog).toBeDefined();
    expect(destroyLog?.message).toMatch(/intercepted/);
  });

  it('proceeds with the normal destroy when onBeforeDestroy does not cancel', async () => {
    let beforeDestroyFired = false;
    let leavePlayFired = false;
    const def = testCardDef('test-plain-keeper-destroy');
    const effect = testKeeperEffect('test-plain-keeper-destroy', 1, {
      hooks: {
        onBeforeDestroy: { handler: () => { beforeDestroyFired = true; } },
        onLeavePlay: { handler: () => { leavePlayFired = true; } },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-plain-keeper-destroy'] },
    });

    await game.play('test-plain-keeper-destroy');
    const instanceId = game.state().players.human.inPlay[0].instanceId;

    await game.api.destroyKeeper('human', instanceId);

    const state = game.state();
    expect(beforeDestroyFired).toBe(true);
    expect(leavePlayFired).toBe(true);
    expect(state.players.human.inPlay).toHaveLength(0);
    expect(state.players.human.discard.map((i) => i.cardId)).toEqual(['test-plain-keeper-destroy']);
    const destroyLog = state.log.filter((e) => e.type === 'destroy');
    expect(destroyLog).toHaveLength(1);
    expect(destroyLog[0].message).not.toMatch(/intercepted/);
  });
});
