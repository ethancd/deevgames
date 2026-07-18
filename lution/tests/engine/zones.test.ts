import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('zone-move invariants', () => {
  it('moveToPlay (via play()) moves a keeper from hand to inPlay and logs it', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['starter-pocket-nebula'] },
    });

    const before = game.state();
    expect(before.players.human.hand.map((i) => i.cardId)).toEqual(['starter-pocket-nebula']);
    expect(before.players.human.inPlay).toHaveLength(0);

    const result = await game.play('starter-pocket-nebula');
    expect(result).toEqual({ passed: false, cancelled: false });

    const after = game.state();
    expect(after.players.human.hand).toHaveLength(0);
    expect(after.players.human.inPlay.map((i) => i.cardId)).toEqual(['starter-pocket-nebula']);
    expect(after.log.some((e) => e.type === 'play')).toBe(true);
  });

  it('moveToDiscard from inPlay fires onLeavePlay then onDiscard, in that order', async () => {
    const order: string[] = [];
    const def = testCardDef('test-order-keeper');
    const effect = testKeeperEffect('test-order-keeper', 1, {
      hooks: {
        onLeavePlay: { handler: () => { order.push('onLeavePlay'); } },
        onDiscard: { scope: 'always', handler: () => { order.push('onDiscard'); } },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-order-keeper'] },
    });

    await game.play('test-order-keeper');
    const instanceId = game.state().players.human.inPlay[0].instanceId;
    await game.api.moveToDiscard('human', instanceId, 'inPlay');

    expect(order).toEqual(['onLeavePlay', 'onDiscard']);
    expect(game.state().players.human.inPlay).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['test-order-keeper']);
  });

  it('moveToDiscard from hand does NOT fire onLeavePlay', async () => {
    let leavePlayFired = false;
    const def = testCardDef('test-hand-discard-action');
    const effect = {
      cardId: 'test-hand-discard-action',
      cardType: 'action' as const,
      baseValue: 0,
      hooks: {
        onLeavePlay: { handler: () => { leavePlayFired = true; } },
      },
    };
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-hand-discard-action'] },
    });

    const instanceId = game.state().players.human.hand[0].instanceId;
    await game.api.moveToDiscard('human', instanceId, 'hand');

    expect(leavePlayFired).toBe(false);
    expect(game.state().players.human.discard).toHaveLength(1);
  });

  it('destroyKeeper removes a single token, fires onLeavePlay + onDiscard, and logs a distinct "destroy" entry', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['starter-pocket-nebula'] },
    });
    await game.play('starter-pocket-nebula');
    const instanceId = game.state().players.human.inPlay[0].instanceId;

    await game.api.destroyKeeper('human', instanceId);

    const state = game.state();
    expect(state.players.human.inPlay).toHaveLength(0);
    expect(state.players.human.discard.map((i) => i.cardId)).toEqual(['starter-pocket-nebula']);
    const destroyEntry = state.log.find((e) => e.type === 'destroy');
    expect(destroyEntry).toBeDefined();
  });

  it('changeController moves an inPlay instance to the other player and re-fires onEnterPlay there', async () => {
    let enterPlayCalls: string[] = [];
    const def = testCardDef('test-steal-keeper');
    const effect = testKeeperEffect('test-steal-keeper', 2, {
      hooks: {
        onEnterPlay: { side: 'any', handler: (ctx) => { enterPlayCalls.push(ctx.owner); } },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-steal-keeper'] },
    });

    await game.play('test-steal-keeper');
    expect(enterPlayCalls).toEqual(['human']);

    const instanceId = game.state().players.human.inPlay[0].instanceId;
    await game.api.changeController(instanceId, 'human', 'claude');

    const state = game.state();
    expect(state.players.human.inPlay).toHaveLength(0);
    expect(state.players.claude.inPlay.map((i) => i.cardId)).toEqual(['test-steal-keeper']);
    expect(enterPlayCalls).toEqual(['human', 'claude']);
  });

  it('changeController between hand zones does not fire onEnterPlay', async () => {
    let enterPlayFired = false;
    const def = testCardDef('test-hand-transfer');
    const effect = testKeeperEffect('test-hand-transfer', 1, {
      hooks: { onEnterPlay: { side: 'any', handler: () => { enterPlayFired = true; } } },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-hand-transfer'] },
    });
    const instanceId = game.state().players.human.hand[0].instanceId;

    await game.api.changeController(instanceId, 'human', 'claude');

    expect(enterPlayFired).toBe(false);
    expect(game.state().players.claude.hand.map((i) => i.cardId)).toEqual(['test-hand-transfer']);
  });

  it('rejects moving an instance that is not present in the expected zone', async () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    await expect(game.api.moveToPlay('human', 'not-a-real-instance')).rejects.toThrow();
    await expect(game.api.moveToDiscard('human', 'not-a-real-instance', 'hand')).rejects.toThrow();
    await expect(game.api.destroyKeeper('human', 'not-a-real-instance')).rejects.toThrow();
    await expect(game.api.changeController('not-a-real-instance', 'human', 'claude')).rejects.toThrow();
  });
});
