import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('r6-claude-the-permafrost-bailiff (The Permafrost Bailiff)', () => {
  it('is a keeper worth 1 point while in play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r6-claude-the-permafrost-bailiff'] },
    });

    expect(await game.score('human')).toBe(0);

    const result = await game.play('r6-claude-the-permafrost-bailiff');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual([
      'r6-claude-the-permafrost-bailiff',
    ]);
    expect(await game.score('human')).toBe(1);
  });

  it("at the start of its owner's turn, freezes the opponent's MOST VALUABLE non-frozen keeper down to 1 point, permanently", async () => {
    const lowDef = testCardDef('test-bailiff-low-keeper', { createdInRound: 6 });
    const lowEffect = testKeeperEffect('test-bailiff-low-keeper', 2);
    const highDef = testCardDef('test-bailiff-high-keeper', { createdInRound: 6 });
    const highEffect = testKeeperEffect('test-bailiff-high-keeper', 5);
    const game = createTestGame({
      extraRegistry: [lowDef, highDef],
      extraEffects: [lowEffect, highEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r6-claude-the-permafrost-bailiff'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r6-claude-the-permafrost-bailiff');
    game.state().players.claude.inPlay.push(
      { instanceId: 'synth-bailiff-low', cardId: 'test-bailiff-low-keeper' },
      { instanceId: 'synth-bailiff-high', cardId: 'test-bailiff-high-keeper' }
    );
    expect(await game.score('claude')).toBe(7);

    await game.api.emit('onTurnStart', {});

    expect(game.api.getScoreOverride('synth-bailiff-high')).toBe(1);
    expect(game.api.getScoreOverride('synth-bailiff-low')).toBeUndefined();
    expect(await game.score('claude')).toBe(3);
  });

  it('only ever targets an ALREADY-frozen opponent keeper again by skipping it in favor of the next most valuable one', async () => {
    const frozenDef = testCardDef('test-bailiff-frozen-keeper', { createdInRound: 6 });
    const frozenEffect = testKeeperEffect('test-bailiff-frozen-keeper', 9);
    const otherDef = testCardDef('test-bailiff-other-keeper', { createdInRound: 6 });
    const otherEffect = testKeeperEffect('test-bailiff-other-keeper', 3);
    const game = createTestGame({
      extraRegistry: [frozenDef, otherDef],
      extraEffects: [frozenEffect, otherEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r6-claude-the-permafrost-bailiff'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r6-claude-the-permafrost-bailiff');
    game.state().players.claude.inPlay.push(
      { instanceId: 'synth-bailiff-frozen', cardId: 'test-bailiff-frozen-keeper' },
      { instanceId: 'synth-bailiff-other', cardId: 'test-bailiff-other-keeper' }
    );
    game.api.setScoreOverride('synth-bailiff-frozen', 1);

    await game.api.emit('onTurnStart', {});

    // The already-frozen keeper keeps its existing override (untouched);
    // the next-most-valuable NON-frozen keeper gets frozen instead.
    expect(game.api.getScoreOverride('synth-bailiff-frozen')).toBe(1);
    expect(game.api.getScoreOverride('synth-bailiff-other')).toBe(1);
  });

  it("does not touch the owner's OWN keepers, only the opponent's", async () => {
    const ownDef = testCardDef('test-bailiff-own-keeper', { createdInRound: 6 });
    const ownEffect = testKeeperEffect('test-bailiff-own-keeper', 4);
    const game = createTestGame({
      extraRegistry: [ownDef],
      extraEffects: [ownEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r6-claude-the-permafrost-bailiff'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r6-claude-the-permafrost-bailiff');
    game.state().players.human.inPlay.push({ instanceId: 'synth-bailiff-own', cardId: 'test-bailiff-own-keeper' });

    await game.api.emit('onTurnStart', {});

    expect(game.api.getScoreOverride('synth-bailiff-own')).toBeUndefined();
  });

  it('is a no-op (no crash, no freeze) when the opponent has no non-frozen keeper in play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r6-claude-the-permafrost-bailiff'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r6-claude-the-permafrost-bailiff');

    await expect(game.api.emit('onTurnStart', {})).resolves.not.toThrow();
    expect(game.state().players.claude.inPlay).toHaveLength(0);
  });

  it('logs a flavor message naming the frozen keeper by NAME, never a raw instance id', async () => {
    const def = testCardDef('test-bailiff-log-keeper', { createdInRound: 6, name: 'Bailiff Log Target' });
    const effect = testKeeperEffect('test-bailiff-log-keeper', 3);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r6-claude-the-permafrost-bailiff'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r6-claude-the-permafrost-bailiff');
    game.state().players.claude.inPlay.push({ instanceId: 'synth-bailiff-log', cardId: 'test-bailiff-log-keeper' });

    await game.api.emit('onTurnStart', {});

    expect(
      game.state().log.some((e) => e.type === 'flavor' && e.message.includes('Bailiff Log Target'))
    ).toBe(true);
    for (const entry of game.state().log) {
      expect(entry.message).not.toMatch(/inst-\d+/);
      expect(entry.message).not.toMatch(/synth-bailiff-log/);
    }
  });
});
