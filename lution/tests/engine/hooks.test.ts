import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('hook dispatch ordering', () => {
  it('invokes handlers by priority (desc), then card order, then in-play instance order, sequentially', async () => {
    const order: string[] = [];
    const makeCard = (id: string, priority: number) =>
      testKeeperEffect(id, 0, {
        hooks: {
          testEvent: {
            scope: 'inPlay',
            side: 'any',
            priority,
            handler: async (ctx) => {
              order.push(`${ctx.owner}:${ctx.cardId}`);
            },
          },
        },
      });

    const defs = ['test-hook-a', 'test-hook-b', 'test-hook-c'].map((id) => testCardDef(id));
    const effects = [makeCard('test-hook-a', 5), makeCard('test-hook-b', 5), makeCard('test-hook-c', 10)];

    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['test-hook-a', 'test-hook-c'], claude: ['test-hook-b'] },
    });

    // Play them in a scrambled order relative to the expected dispatch
    // order, to prove dispatch order is independent of play order.
    await game.play('test-hook-c');
    await game.play('test-hook-a');
    await game.runTurn({ playInstanceId: null }); // pass, so it becomes claude's turn without consuming claude's hand
    await game.play('test-hook-b');

    order.length = 0;
    await game.api.emit('testEvent');

    // priority 10 first (test-hook-c), then priority 5 tied pair ordered by
    // cardId ascending ("test-hook-a" < "test-hook-b").
    expect(order).toEqual(['human:test-hook-c', 'human:test-hook-a', 'claude:test-hook-b']);
  });

  it('unknown hook names with zero registered handlers are no-ops', async () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    const results = await game.api.emit('totallyMadeUpEventName');
    expect(results).toEqual([]);
  });

  it('stops invoking further handlers once one returns {cancel: true}', async () => {
    const calls: string[] = [];
    const cancellerDef = testCardDef('test-cancel-first', { createdInRound: 0 });
    const followerDef = testCardDef('test-cancel-second', { createdInRound: 0 });
    const canceller = testKeeperEffect('test-cancel-first', 0, {
      hooks: {
        testEvent: {
          side: 'any',
          priority: 10,
          handler: () => {
            calls.push('canceller');
            return { cancel: true };
          },
        },
      },
    });
    const follower = testKeeperEffect('test-cancel-second', 0, {
      hooks: {
        testEvent: {
          side: 'any',
          priority: 0,
          handler: () => {
            calls.push('follower');
          },
        },
      },
    });

    const game = createTestGame({
      extraRegistry: [cancellerDef, followerDef],
      extraEffects: [canceller, follower],
      decks: { human: [], claude: [] },
      hands: { human: ['test-cancel-first', 'test-cancel-second'] },
    });
    await game.play('test-cancel-first');
    await game.play('test-cancel-second');

    const results = await game.api.emit('testEvent');
    expect(calls).toEqual(['canceller']);
    expect(results).toEqual([{ cancel: true }]);
  });
});
