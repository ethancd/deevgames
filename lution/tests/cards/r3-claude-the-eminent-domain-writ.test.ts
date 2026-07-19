import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('r3-claude-the-eminent-domain-writ (The Eminent Domain Writ)', () => {
  it("takes control of the opponent's only keeper in play", async () => {
    const def = testCardDef('test-theirs-only', { createdInRound: 3 });
    const effect = testKeeperEffect('test-theirs-only', 2);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r3-claude-the-eminent-domain-writ'], claude: [] },
    });
    game.state().players.claude.inPlay.push({ instanceId: 'synth-theirs-only', cardId: 'test-theirs-only' });

    const result = await game.play('r3-claude-the-eminent-domain-writ');
    expect(result).toEqual({ passed: false, cancelled: false });

    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual(['synth-theirs-only']);
    expect(game.state().players.claude.inPlay).toHaveLength(0);
    // The action itself resolves and discards from hand as usual.
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual([
      'r3-claude-the-eminent-domain-writ',
    ]);
  });

  it('is a no-op (but still resolves + discards itself) when the opponent has no keepers in play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r3-claude-the-eminent-domain-writ'], claude: [] },
    });

    const result = await game.play('r3-claude-the-eminent-domain-writ');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay).toHaveLength(0);
    expect(game.state().players.claude.inPlay).toHaveLength(0);
  });

  it("picks the single most valuable of the opponent's keepers when values differ, ignoring the player's own keepers", async () => {
    const defs = [
      testCardDef('test-mine-a', { createdInRound: 3 }),
      testCardDef('test-theirs-a', { createdInRound: 3 }),
      testCardDef('test-theirs-b', { createdInRound: 3 }),
    ];
    const effects = [
      testKeeperEffect('test-mine-a', 4),
      testKeeperEffect('test-theirs-a', 2),
      testKeeperEffect('test-theirs-b', 5),
    ];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r3-claude-the-eminent-domain-writ'], claude: [] },
    });

    game.state().players.human.inPlay.push({ instanceId: 'synth-mine-a', cardId: 'test-mine-a' });
    game.state().players.claude.inPlay.push(
      { instanceId: 'synth-theirs-a', cardId: 'test-theirs-a' },
      { instanceId: 'synth-theirs-b', cardId: 'test-theirs-b' }
    );

    await game.play('r3-claude-the-eminent-domain-writ');

    // The most valuable opponent keeper (test-theirs-b, 5) is seized; the
    // player's own keeper is left untouched, and the lesser opponent keeper
    // stays with the opponent.
    expect(game.state().players.human.inPlay.map((i) => i.instanceId).sort()).toEqual(
      ['synth-mine-a', 'synth-theirs-b'].sort()
    );
    expect(game.state().players.claude.inPlay.map((i) => i.instanceId)).toEqual(['synth-theirs-a']);
  });

  it("lets the player choose which of the opponent's tied-most-valuable keepers is seized", async () => {
    const defs = [
      testCardDef('test-theirs-tie-1', { createdInRound: 3 }),
      testCardDef('test-theirs-tie-2', { createdInRound: 3 }),
    ];
    const effects = [testKeeperEffect('test-theirs-tie-1', 3), testKeeperEffect('test-theirs-tie-2', 3)];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r3-claude-the-eminent-domain-writ'], claude: [] },
      // Script human (the player, choosing which tied keeper to seize) to
      // pick the second tied instance.
      choices: { human: [{ id: 'synth-theirs-tie-2' }] },
    });

    game.state().players.claude.inPlay.push(
      { instanceId: 'synth-theirs-tie-1', cardId: 'test-theirs-tie-1' },
      { instanceId: 'synth-theirs-tie-2', cardId: 'test-theirs-tie-2' }
    );

    await game.play('r3-claude-the-eminent-domain-writ');

    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual(['synth-theirs-tie-2']);
    expect(game.state().players.claude.inPlay.map((i) => i.instanceId)).toEqual(['synth-theirs-tie-1']);
  });

  it('respects a live freeze override when judging value (a frozen 5-point keeper counts as 1)', async () => {
    const defs = [
      testCardDef('test-theirs-frozen-big', { createdInRound: 3 }),
      testCardDef('test-theirs-unfrozen-small', { createdInRound: 3 }),
    ];
    const effects = [
      testKeeperEffect('test-theirs-frozen-big', 5),
      testKeeperEffect('test-theirs-unfrozen-small', 2),
    ];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r3-claude-the-eminent-domain-writ'], claude: [] },
    });

    game.state().players.claude.inPlay.push(
      { instanceId: 'synth-theirs-frozen-big', cardId: 'test-theirs-frozen-big' },
      { instanceId: 'synth-theirs-unfrozen-small', cardId: 'test-theirs-unfrozen-small' }
    );
    game.api.setScoreOverride('synth-theirs-frozen-big', 1);

    await game.play('r3-claude-the-eminent-domain-writ');

    // Frozen keeper is capped to 1 point, so the truly most valuable keeper
    // right now is the unfrozen 2-point one -- that's the one seized.
    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual([
      'synth-theirs-unfrozen-small',
    ]);
    expect(game.state().players.claude.inPlay.map((i) => i.instanceId)).toEqual([
      'synth-theirs-frozen-big',
    ]);
  });
});
