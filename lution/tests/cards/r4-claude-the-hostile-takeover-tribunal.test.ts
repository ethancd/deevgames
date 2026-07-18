import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('r4-claude-the-hostile-takeover-tribunal (The Hostile Takeover Tribunal)', () => {
  it('exchanges your only keeper for the opponent\'s only (more valuable) keeper', async () => {
    const defs = [
      testCardDef('test-mine-low', { createdInRound: 4 }),
      testCardDef('test-theirs-high', { createdInRound: 4 }),
    ];
    const effects = [testKeeperEffect('test-mine-low', 1), testKeeperEffect('test-theirs-high', 3)];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r4-claude-the-hostile-takeover-tribunal'], claude: [] },
    });

    game.state().players.human.inPlay.push({ instanceId: 'synth-mine', cardId: 'test-mine-low' });
    game.state().players.claude.inPlay.push({ instanceId: 'synth-theirs', cardId: 'test-theirs-high' });

    const result = await game.play('r4-claude-the-hostile-takeover-tribunal');
    expect(result).toEqual({ passed: false, cancelled: false });

    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual(['synth-theirs']);
    expect(game.state().players.claude.inPlay.map((i) => i.instanceId)).toEqual(['synth-mine']);
    // The action itself resolves and discards from hand as usual.
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual([
      'r4-claude-the-hostile-takeover-tribunal',
    ]);
  });

  it('is a no-op (but still resolves + discards itself) when the owner has no keepers in play', async () => {
    const def = testCardDef('test-theirs-only', { createdInRound: 4 });
    const effect = testKeeperEffect('test-theirs-only', 2);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r4-claude-the-hostile-takeover-tribunal'], claude: [] },
    });
    game.state().players.claude.inPlay.push({ instanceId: 'synth-theirs-only', cardId: 'test-theirs-only' });

    const result = await game.play('r4-claude-the-hostile-takeover-tribunal');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.claude.inPlay.map((i) => i.instanceId)).toEqual(['synth-theirs-only']);
    expect(game.state().players.human.inPlay).toHaveLength(0);
  });

  it('is a no-op (but still resolves + discards itself) when the opponent has no keepers in play', async () => {
    const def = testCardDef('test-mine-only', { createdInRound: 4 });
    const effect = testKeeperEffect('test-mine-only', 2);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r4-claude-the-hostile-takeover-tribunal'], claude: [] },
    });
    game.state().players.human.inPlay.push({ instanceId: 'synth-mine-only', cardId: 'test-mine-only' });

    const result = await game.play('r4-claude-the-hostile-takeover-tribunal');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual(['synth-mine-only']);
    expect(game.state().players.claude.inPlay).toHaveLength(0);
  });

  it('picks the single least valuable of your keepers and the single most valuable of theirs when values differ', async () => {
    const defs = [
      testCardDef('test-mine-a', { createdInRound: 4 }),
      testCardDef('test-mine-b', { createdInRound: 4 }),
      testCardDef('test-theirs-a', { createdInRound: 4 }),
      testCardDef('test-theirs-b', { createdInRound: 4 }),
    ];
    const effects = [
      testKeeperEffect('test-mine-a', 1),
      testKeeperEffect('test-mine-b', 4),
      testKeeperEffect('test-theirs-a', 2),
      testKeeperEffect('test-theirs-b', 5),
    ];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r4-claude-the-hostile-takeover-tribunal'], claude: [] },
    });

    game.state().players.human.inPlay.push(
      { instanceId: 'synth-mine-a', cardId: 'test-mine-a' },
      { instanceId: 'synth-mine-b', cardId: 'test-mine-b' }
    );
    game.state().players.claude.inPlay.push(
      { instanceId: 'synth-theirs-a', cardId: 'test-theirs-a' },
      { instanceId: 'synth-theirs-b', cardId: 'test-theirs-b' }
    );

    await game.play('r4-claude-the-hostile-takeover-tribunal');

    // Least valuable of mine (test-mine-a, 1) goes to claude; most valuable
    // of theirs (test-theirs-b, 5) comes to human. The untouched keepers on
    // both sides stay put.
    expect(game.state().players.human.inPlay.map((i) => i.instanceId).sort()).toEqual(
      ['synth-mine-b', 'synth-theirs-b'].sort()
    );
    expect(game.state().players.claude.inPlay.map((i) => i.instanceId).sort()).toEqual(
      ['synth-mine-a', 'synth-theirs-a'].sort()
    );
  });

  it('lets the OWNER choose which of their own tied-least-valuable keepers is given up', async () => {
    const defs = [
      testCardDef('test-mine-tie-1', { createdInRound: 4 }),
      testCardDef('test-mine-tie-2', { createdInRound: 4 }),
      testCardDef('test-theirs-only', { createdInRound: 4 }),
    ];
    const effects = [
      testKeeperEffect('test-mine-tie-1', 1),
      testKeeperEffect('test-mine-tie-2', 1),
      testKeeperEffect('test-theirs-only', 3),
    ];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r4-claude-the-hostile-takeover-tribunal'], claude: [] },
      // Script human (the owner, choosing which tied keeper to give up) to
      // pick the second tied instance.
      choices: { human: [{ id: 'synth-mine-tie-2' }] },
    });

    game.state().players.human.inPlay.push(
      { instanceId: 'synth-mine-tie-1', cardId: 'test-mine-tie-1' },
      { instanceId: 'synth-mine-tie-2', cardId: 'test-mine-tie-2' }
    );
    game.state().players.claude.inPlay.push({ instanceId: 'synth-theirs-only', cardId: 'test-theirs-only' });

    await game.play('r4-claude-the-hostile-takeover-tribunal');

    // mine-tie-2 (the chosen tied instance) is given up to claude; theirs-only
    // (the only, and thus most valuable, keeper claude had) is seized.
    expect(game.state().players.human.inPlay.map((i) => i.instanceId).sort()).toEqual(
      ['synth-mine-tie-1', 'synth-theirs-only'].sort()
    );
    expect(game.state().players.claude.inPlay.map((i) => i.instanceId)).toEqual(['synth-mine-tie-2']);
  });

  it("lets the OWNER choose which of the opponent's tied-most-valuable keepers is seized", async () => {
    const defs = [
      testCardDef('test-mine-only', { createdInRound: 4 }),
      testCardDef('test-theirs-tie-1', { createdInRound: 4 }),
      testCardDef('test-theirs-tie-2', { createdInRound: 4 }),
    ];
    const effects = [
      testKeeperEffect('test-mine-only', 1),
      testKeeperEffect('test-theirs-tie-1', 3),
      testKeeperEffect('test-theirs-tie-2', 3),
    ];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r4-claude-the-hostile-takeover-tribunal'], claude: [] },
      // Script human (the owner, choosing which tied keeper to seize) to
      // pick the second tied instance.
      choices: { human: [{ id: 'synth-theirs-tie-2' }] },
    });

    game.state().players.human.inPlay.push({ instanceId: 'synth-mine-only', cardId: 'test-mine-only' });
    game.state().players.claude.inPlay.push(
      { instanceId: 'synth-theirs-tie-1', cardId: 'test-theirs-tie-1' },
      { instanceId: 'synth-theirs-tie-2', cardId: 'test-theirs-tie-2' }
    );

    await game.play('r4-claude-the-hostile-takeover-tribunal');

    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual(['synth-theirs-tie-2']);
    expect(game.state().players.claude.inPlay.map((i) => i.instanceId).sort()).toEqual(
      ['synth-mine-only', 'synth-theirs-tie-1'].sort()
    );
  });

  it('respects a live freeze override when judging value (a frozen 5-point keeper counts as 1)', async () => {
    const defs = [
      testCardDef('test-mine-only', { createdInRound: 4 }),
      testCardDef('test-theirs-frozen-big', { createdInRound: 4 }),
      testCardDef('test-theirs-unfrozen-small', { createdInRound: 4 }),
    ];
    const effects = [
      testKeeperEffect('test-mine-only', 1),
      testKeeperEffect('test-theirs-frozen-big', 5),
      testKeeperEffect('test-theirs-unfrozen-small', 2),
    ];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r4-claude-the-hostile-takeover-tribunal'], claude: [] },
    });

    game.state().players.human.inPlay.push({ instanceId: 'synth-mine-only', cardId: 'test-mine-only' });
    game.state().players.claude.inPlay.push(
      { instanceId: 'synth-theirs-frozen-big', cardId: 'test-theirs-frozen-big' },
      { instanceId: 'synth-theirs-unfrozen-small', cardId: 'test-theirs-unfrozen-small' }
    );
    game.api.setScoreOverride('synth-theirs-frozen-big', 1);

    await game.play('r4-claude-the-hostile-takeover-tribunal');

    // Frozen keeper is capped to 1 point, so the truly most valuable keeper
    // right now is the unfrozen 2-point one -- that's the one seized.
    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual([
      'synth-theirs-unfrozen-small',
    ]);
    expect(game.state().players.claude.inPlay.map((i) => i.instanceId).sort()).toEqual(
      ['synth-mine-only', 'synth-theirs-frozen-big'].sort()
    );
  });

  it('logs a flavor message naming both exchanged keepers', async () => {
    const defs = [
      testCardDef('test-mine-log', { createdInRound: 4 }),
      testCardDef('test-theirs-log', { createdInRound: 4 }),
    ];
    const effects = [testKeeperEffect('test-mine-log', 1), testKeeperEffect('test-theirs-log', 3)];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r4-claude-the-hostile-takeover-tribunal'], claude: [] },
    });
    game.state().players.human.inPlay.push({ instanceId: 'synth-mine-log', cardId: 'test-mine-log' });
    game.state().players.claude.inPlay.push({ instanceId: 'synth-theirs-log', cardId: 'test-theirs-log' });

    await game.play('r4-claude-the-hostile-takeover-tribunal');

    expect(
      game
        .state()
        .log.some(
          (e) =>
            e.type === 'flavor' &&
            e.message.includes('Hostile Takeover Tribunal') &&
            e.message.includes('test-theirs-log') &&
            e.message.includes('test-mine-log')
        )
    ).toBe(true);
  });
});
