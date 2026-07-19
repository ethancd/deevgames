import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('win checkpoints', () => {
  it('one player at >= WIN_POINTS, the other below -> a decisive win', async () => {
    const bigDef = testCardDef('test-checkpoint-big');
    const bigEffect = testKeeperEffect('test-checkpoint-big', 10);
    const game = createTestGame({
      extraRegistry: [bigDef],
      extraEffects: [bigEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-checkpoint-big'] },
    });

    expect(await game.checkpoint()).toBeNull();
    await game.play('test-checkpoint-big');
    const result = await game.checkpoint();
    expect(result).toEqual({ outcome: 'win', winner: 'human' });
  });

  it('both players simultaneously >= WIN_POINTS on the same checkpoint -> a draw', async () => {
    const bigDef = testCardDef('test-checkpoint-tie');
    const bigEffect = testKeeperEffect('test-checkpoint-tie', 10);
    const game = createTestGame({
      extraRegistry: [bigDef],
      extraEffects: [bigEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-checkpoint-tie'], claude: ['test-checkpoint-tie'] },
    });

    await game.play('test-checkpoint-tie'); // human
    // Manually seat claude's copy directly into play (both hold the same
    // synthetic card id here purely for test convenience — the no-dup
    // invariant only constrains real deck construction, not test fixtures).
    const claudeHandInstance = game.state().players.claude.hand[0];
    await game.api.moveToPlay('claude', claudeHandInstance.instanceId);

    const result = await game.checkpoint();
    expect(result).toEqual({ outcome: 'draw' });
  });

  it('runInnerGame stops the instant a checkpoint resolves, mid-turn, without finishing the rest of the turn machinery', async () => {
    const bigDef = testCardDef('test-checkpoint-runturn');
    const bigEffect = testKeeperEffect('test-checkpoint-runturn', 10);
    const game = createTestGame({
      extraRegistry: [bigDef],
      extraEffects: [bigEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-checkpoint-runturn'] },
    });

    await game.runTurn({ playInstanceId: game.state().players.human.hand[0].instanceId });

    expect(game.state().result).toEqual({ outcome: 'win', winner: 'human' });
    // The turn ended the instant the post-play checkpoint fired; activePlayer
    // should NOT have swapped to claude since runTurn returns early.
    expect(game.state().activePlayer).toBe('human');
  });
});
