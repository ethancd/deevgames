import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('r1-claude-recursive-refund-clause (Recursive Refund Clause)', () => {
  it('is a keeper worth 1 point while in play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r1-claude-recursive-refund-clause'] },
    });

    expect(await game.score('human')).toBe(0);

    const result = await game.play('r1-claude-recursive-refund-clause');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual([
      'r1-claude-recursive-refund-clause',
    ]);
    expect(await game.score('human')).toBe(1);
  });

  it('destroyKeeper returns it to hand instead of the discard pile, and cancels the destroy', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r1-claude-recursive-refund-clause'] },
    });

    await game.play('r1-claude-recursive-refund-clause');
    const instanceId = game.state().players.human.inPlay[0].instanceId;

    await game.api.destroyKeeper('human', instanceId);

    const state = game.state();
    expect(state.players.human.inPlay).toHaveLength(0);
    expect(state.players.human.discard).toHaveLength(0);
    expect(state.players.human.hand.map((i) => i.cardId)).toEqual([
      'r1-claude-recursive-refund-clause',
    ]);
    expect(state.players.human.hand[0].instanceId).toBe(instanceId);

    // The destroy is logged as intercepted, not as a real "destroy".
    expect(state.log.some((e) => e.type === 'destroy' && e.message.includes('intercepted'))).toBe(true);

    // Score drops back to 0 since the card is no longer in play.
    expect(await game.score('human')).toBe(0);
  });

  it('can be replayed from hand after bouncing back from an attempted destroy', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r1-claude-recursive-refund-clause'] },
    });

    await game.play('r1-claude-recursive-refund-clause');
    const firstInstanceId = game.state().players.human.inPlay[0].instanceId;
    await game.api.destroyKeeper('human', firstInstanceId);

    const result = await game.play('r1-claude-recursive-refund-clause');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual([
      'r1-claude-recursive-refund-clause',
    ]);
    expect(await game.score('human')).toBe(1);
  });

  it('does not intercept the destruction of an unrelated keeper (only reacts to its own instance)', async () => {
    const def = testCardDef('test-other-keeper');
    const effect = testKeeperEffect('test-other-keeper', 1);

    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r1-claude-recursive-refund-clause', 'test-other-keeper'] },
    });

    await game.play('r1-claude-recursive-refund-clause');
    await game.play('test-other-keeper');

    const otherInstanceId = game.state().players.human.inPlay.find(
      (i) => i.cardId === 'test-other-keeper'
    )!.instanceId;

    await game.api.destroyKeeper('human', otherInstanceId);

    const state = game.state();
    // The unrelated keeper was actually destroyed (sent to discard), while
    // Recursive Refund Clause is untouched and still in play.
    expect(state.players.human.discard.map((i) => i.cardId)).toEqual(['test-other-keeper']);
    expect(state.players.human.inPlay.map((i) => i.cardId)).toEqual([
      'r1-claude-recursive-refund-clause',
    ]);
  });

  it('does not destroy a second copy of itself when only one instance is targeted', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: {
        human: ['r1-claude-recursive-refund-clause', 'r1-claude-recursive-refund-clause'],
      },
    });

    await game.play('r1-claude-recursive-refund-clause');
    await game.play('r1-claude-recursive-refund-clause');

    const [firstId, secondId] = game.state().players.human.inPlay.map((i) => i.instanceId);

    await game.api.destroyKeeper('human', firstId);

    const state = game.state();
    // Only the targeted copy bounced to hand; the other copy is untouched.
    expect(state.players.human.inPlay.map((i) => i.instanceId)).toEqual([secondId]);
    expect(state.players.human.hand.map((i) => i.cardId)).toEqual([
      'r1-claude-recursive-refund-clause',
    ]);
    expect(state.players.human.discard).toHaveLength(0);
  });
});
