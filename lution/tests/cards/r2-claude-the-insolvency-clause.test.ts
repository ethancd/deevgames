import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('r2-claude-the-insolvency-clause (The Insolvency Clause)', () => {
  it("destroys the opponent's only keeper in play", async () => {
    const def = testCardDef('test-keeper-a', { createdInRound: 2 });
    const effect = testKeeperEffect('test-keeper-a', 1);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-insolvency-clause'], claude: [] },
    });

    game.state().players.claude.inPlay.push({ instanceId: 'synth-a', cardId: 'test-keeper-a' });

    const result = await game.play('r2-claude-the-insolvency-clause');
    expect(result).toEqual({ passed: false, cancelled: false });

    expect(game.state().players.claude.inPlay).toHaveLength(0);
    expect(game.state().players.claude.discard.map((i) => i.instanceId)).toEqual(['synth-a']);
    // The action itself resolves and discards from hand as usual.
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual([
      'r2-claude-the-insolvency-clause',
    ]);
  });

  it('is a no-op (but still resolves + discards itself) when the opponent has no keepers in play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-insolvency-clause'], claude: [] },
    });

    const result = await game.play('r2-claude-the-insolvency-clause');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.claude.inPlay).toHaveLength(0);
    expect(game.state().players.claude.discard).toHaveLength(0);
  });

  it('destroys only the single most valuable keeper when values differ, leaving cheaper keepers untouched', async () => {
    const defs = [
      testCardDef('test-keeper-low', { createdInRound: 2 }),
      testCardDef('test-keeper-high', { createdInRound: 2 }),
    ];
    const effects = [testKeeperEffect('test-keeper-low', 1), testKeeperEffect('test-keeper-high', 3)];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-insolvency-clause'], claude: [] },
    });

    game.state().players.claude.inPlay.push(
      { instanceId: 'synth-low', cardId: 'test-keeper-low' },
      { instanceId: 'synth-high', cardId: 'test-keeper-high' }
    );

    await game.play('r2-claude-the-insolvency-clause');

    expect(game.state().players.claude.inPlay.map((i) => i.instanceId)).toEqual(['synth-low']);
    expect(game.state().players.claude.discard.map((i) => i.instanceId)).toEqual(['synth-high']);
  });

  it('lets the OPPONENT choose which keeper is destroyed on a tie for most valuable', async () => {
    const defs = [
      testCardDef('test-keeper-tie-1', { createdInRound: 2 }),
      testCardDef('test-keeper-tie-2', { createdInRound: 2 }),
    ];
    const effects = [testKeeperEffect('test-keeper-tie-1', 2), testKeeperEffect('test-keeper-tie-2', 2)];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-insolvency-clause'], claude: [] },
      // Script claude (the opponent, being forced to choose) to pick the
      // second tied instance.
      choices: { claude: [{ id: 'synth-tie-2' }] },
    });

    game.state().players.claude.inPlay.push(
      { instanceId: 'synth-tie-1', cardId: 'test-keeper-tie-1' },
      { instanceId: 'synth-tie-2', cardId: 'test-keeper-tie-2' }
    );

    await game.play('r2-claude-the-insolvency-clause');

    expect(game.state().players.claude.inPlay.map((i) => i.instanceId)).toEqual(['synth-tie-1']);
    expect(game.state().players.claude.discard.map((i) => i.instanceId)).toEqual(['synth-tie-2']);
  });

  it('logs a flavor message naming the destroyed keeper', async () => {
    const def = testCardDef('test-keeper-log', { createdInRound: 2 });
    const effect = testKeeperEffect('test-keeper-log', 1);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-insolvency-clause'], claude: [] },
    });
    game.state().players.claude.inPlay.push({ instanceId: 'synth-log', cardId: 'test-keeper-log' });

    await game.play('r2-claude-the-insolvency-clause');

    expect(
      game
        .state()
        .log.some((e) => e.type === 'flavor' && e.message.includes('Insolvency Clause') && e.message.includes('test-keeper-log'))
    ).toBe(true);
  });
});
