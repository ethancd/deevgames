import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('r4-human-subzero-serpent (Subzero Serpent)', () => {
  it('is a keeper worth 1 point while in play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r4-human-subzero-serpent'] },
    });

    expect(await game.score('human')).toBe(0);

    const result = await game.play('r4-human-subzero-serpent');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual([
      'r4-human-subzero-serpent',
    ]);
    expect(await game.score('human')).toBe(1);
  });

  // Drives EngineAPI.emit('onTurnStart', {}) directly rather than
  // game.runTurn -- runTurn's own draw phase would otherwise reshuffle this
  // card right back into hand the instant it's discarded (both test decks
  // are empty, so the discard pile becomes the new draw pile as soon as
  // there's anything in it), which would obscure what this card's own hook
  // actually does. Calling emit in isolation is exactly what runTurn does
  // internally for this hook (see src/engine/engine.ts's runTurn), so it
  // exercises the same dispatch without the unrelated draw-phase mechanics.
  it("freezes a chosen non-frozen keeper down to 1 point at the start of a turn, on EITHER player's turn, then discards itself once nothing is left to freeze", async () => {
    const def = testCardDef('test-claude-keeper', { createdInRound: 4 });
    const effect = testKeeperEffect('test-claude-keeper', 5);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r4-human-subzero-serpent'], claude: [] },
      firstPlayer: 'human',
      // The serpent's owner (human) is always the one asked to choose,
      // regardless of whose turn is starting -- pick claude's keeper first.
      choices: { human: [{ id: 'synth-claude-keeper' }] },
    });

    await game.play('r4-human-subzero-serpent');
    const serpentInstanceId = game.state().players.human.inPlay[0].instanceId;

    game.state().players.claude.inPlay.push({ instanceId: 'synth-claude-keeper', cardId: 'test-claude-keeper' });
    expect(await game.score('claude')).toBe(5);

    // Start of human's own turn: 2 non-frozen candidates (the serpent
    // itself and claude's keeper) -- the scripted choice picks claude's.
    expect(game.state().activePlayer).toBe('human');
    await game.api.emit('onTurnStart', {});
    expect(game.api.getScoreOverride('synth-claude-keeper')).toBe(1);
    expect(await game.score('claude')).toBe(1);
    expect(game.api.getScoreOverride(serpentInstanceId)).toBeUndefined();

    // Start of the OPPONENT's turn: side: 'any' means the serpent's owner
    // (human) still gets to freeze something even though it's claude's
    // turn starting. Only 1 non-frozen candidate remains (the serpent
    // itself), so no choice is needed.
    game.state().activePlayer = 'claude';
    await game.api.emit('onTurnStart', {});
    expect(game.api.getScoreOverride(serpentInstanceId)).toBe(1);
    expect(await game.score('human')).toBe(1);

    // Next turn start: every keeper in play is now frozen, so the serpent
    // can't act and discards itself.
    game.state().activePlayer = 'human';
    await game.api.emit('onTurnStart', {});
    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).not.toContain(serpentInstanceId);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toContain('r4-human-subzero-serpent');
  });

  it('is discarded at the next turn start when there is nothing else in play to freeze and it is already frozen', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r4-human-subzero-serpent'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r4-human-subzero-serpent');
    const serpentInstanceId = game.state().players.human.inPlay[0].instanceId;
    game.api.setScoreOverride(serpentInstanceId, 1);

    await game.api.emit('onTurnStart', {});

    expect(game.state().players.human.inPlay).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual([
      'r4-human-subzero-serpent',
    ]);
  });

  it('is a no-op the very first time it enters play with nothing else on the board (freezes itself rather than discarding)', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r4-human-subzero-serpent'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r4-human-subzero-serpent');
    const serpentInstanceId = game.state().players.human.inPlay[0].instanceId;

    await game.api.emit('onTurnStart', {});

    // Only candidate on an otherwise-empty board is the serpent itself, so
    // it freezes itself instead of being discarded (it's still 1 point
    // either way).
    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual([serpentInstanceId]);
    expect(game.api.getScoreOverride(serpentInstanceId)).toBe(1);
    expect(await game.score('human')).toBe(1);
  });

  it('logs a flavor message naming the frozen keeper', async () => {
    const def = testCardDef('test-claude-keeper-log', { createdInRound: 4 });
    const effect = testKeeperEffect('test-claude-keeper-log', 2);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r4-human-subzero-serpent'], claude: [] },
      firstPlayer: 'human',
      choices: { human: [{ id: 'synth-claude-keeper-log' }] },
    });

    await game.play('r4-human-subzero-serpent');
    game.state().players.claude.inPlay.push({
      instanceId: 'synth-claude-keeper-log',
      cardId: 'test-claude-keeper-log',
    });

    await game.api.emit('onTurnStart', {});

    expect(
      game
        .state()
        .log.some(
          (e) => e.type === 'flavor' && e.message.includes('Subzero Serpent') && e.message.includes('freezes')
        )
    ).toBe(true);
  });

  it('logs a flavor message when it discards itself', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r4-human-subzero-serpent'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r4-human-subzero-serpent');
    const serpentInstanceId = game.state().players.human.inPlay[0].instanceId;
    game.api.setScoreOverride(serpentInstanceId, 1);

    await game.api.emit('onTurnStart', {});

    expect(
      game
        .state()
        .log.some(
          (e) => e.type === 'flavor' && e.message.includes('Subzero Serpent') && e.message.includes('discard')
        )
    ).toBe(true);
  });
});
