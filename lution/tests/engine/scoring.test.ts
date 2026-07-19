import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('scoring', () => {
  it('recomputes score with zero bookkeeping when a keeper leaves play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['starter-compound-interest-golem'] },
    });

    expect(await game.score('human')).toBe(0);
    await game.play('starter-compound-interest-golem');
    expect(await game.score('human')).toBe(2);

    const instanceId = game.state().players.human.inPlay[0].instanceId;
    await game.api.destroyKeeper('human', instanceId);
    expect(await game.score('human')).toBe(0);
  });

  it('folds modifyScore hooks in deterministic order (starters first, then ascending createdInRound, ties by cardId)', async () => {
    const order: string[] = [];
    const makeModifier = (id: string) =>
      testKeeperEffect(id, 0, {
        hooks: {
          modifyScore: {
            handler: (ctx) => {
              order.push(ctx.cardId);
              const payload = ctx.event.payload as { score: number };
              payload.score += 1;
            },
          },
        },
      });

    const defs = [
      testCardDef('test-mod-round2-b', { createdInRound: 2 }),
      testCardDef('test-mod-round1-a', { createdInRound: 1 }),
      testCardDef('test-mod-round2-a', { createdInRound: 2 }),
    ];
    const effects = [
      makeModifier('test-mod-round2-b'),
      makeModifier('test-mod-round1-a'),
      makeModifier('test-mod-round2-a'),
    ];

    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['test-mod-round2-b', 'test-mod-round1-a', 'test-mod-round2-a'] },
    });

    // Play all three in hand order (irrelevant to the assertion — modifyScore
    // fold order is driven by createdInRound/cardId, not play order).
    await game.play('test-mod-round2-b');
    await game.play('test-mod-round1-a');
    await game.play('test-mod-round2-a');

    order.length = 0;
    const score = await game.score('human');

    expect(order).toEqual(['test-mod-round1-a', 'test-mod-round2-a', 'test-mod-round2-b']);
    expect(score).toBe(3); // 0 base + 1 from each of the three modifiers
  });

  it("modifyScore with side: 'opponent' can adjust the OTHER player's score", async () => {
    const def = testCardDef('test-curse-keeper');
    const effect = testKeeperEffect('test-curse-keeper', 0, {
      hooks: {
        modifyScore: {
          side: 'opponent',
          handler: (ctx) => {
            const payload = ctx.event.payload as { score: number };
            payload.score -= 1;
          },
        },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { claude: ['test-curse-keeper'] },
      firstPlayer: 'claude',
    });
    await game.play('test-curse-keeper');

    expect(await game.score('claude')).toBe(0); // side: 'opponent' does not affect its own owner
    expect(await game.score('human')).toBe(-1);
  });
});
