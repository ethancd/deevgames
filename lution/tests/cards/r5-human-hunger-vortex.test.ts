import { describe, it, expect } from 'vitest';
import { createTestGame, testActionEffect, testCardDef, testKeeperEffect } from '../helpers';
import cardEffect from '../../src/effects/r5-human-hunger-vortex';

describe('r5-human-hunger-vortex (Hunger Vortex)', () => {
  it("with an empty opponent deck, logs a flavor message and resolves without crashing", async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r5-human-hunger-vortex'] },
    });

    const result = await game.play('r5-human-hunger-vortex');

    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['r5-human-hunger-vortex']);
    expect(
      game.state().log.some((e) => e.type === 'flavor' && e.message.includes('empty'))
    ).toBe(true);
  });

  it("with exactly 1 card in the opponent's deck, finds and plays it as the OWNER's own without requesting a choice (a keeper enters the owner's play)", async () => {
    const def = testCardDef('test-vortex-only-deck-keeper');
    const effect = testKeeperEffect('test-vortex-only-deck-keeper', 4);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: ['test-vortex-only-deck-keeper'] },
      hands: { human: ['r5-human-hunger-vortex'], claude: [] },
    });

    await game.play('r5-human-hunger-vortex');

    expect(game.state().players.claude.drawPile).toHaveLength(0);
    expect(game.state().players.claude.inPlay).toHaveLength(0);
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['test-vortex-only-deck-keeper']);
    expect(await game.score('human')).toBe(4);
    expect(await game.score('claude')).toBe(0);
  });

  it("finds and plays an action from the opponent's deck as the owner, resolving its onPlay hook AS the owner and discarding it to the owner's discard", async () => {
    let onPlayOwner: string | undefined;
    const def = testCardDef('test-vortex-deck-action');
    const effect = testActionEffect('test-vortex-deck-action', {
      hooks: {
        onPlay: {
          scope: 'inHand',
          handler: (ctx) => {
            onPlayOwner = ctx.owner;
          },
        },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: ['test-vortex-deck-action'] },
      hands: { human: ['r5-human-hunger-vortex'], claude: [] },
    });

    await game.play('r5-human-hunger-vortex');

    expect(onPlayOwner).toBe('human');
    expect(game.state().players.claude.drawPile).toHaveLength(0);
    expect(game.state().players.claude.discard).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toContain('test-vortex-deck-action');
    expect(game.state().players.human.inPlay).toHaveLength(0);
  });

  it("when the opponent's deck has more than 1 card, requests a choice (posed to the owner) and plays only the chosen one", async () => {
    const aDef = testCardDef('test-vortex-choice-a');
    const aEffect = testKeeperEffect('test-vortex-choice-a', 2);
    const bDef = testCardDef('test-vortex-choice-b');
    const bEffect = testKeeperEffect('test-vortex-choice-b', 6);
    const game = createTestGame({
      extraRegistry: [aDef, bDef],
      extraEffects: [aEffect, bEffect],
      decks: { human: [], claude: ['test-vortex-choice-a', 'test-vortex-choice-b'] },
      hands: { human: ['r5-human-hunger-vortex'], claude: [] },
      // No scripted choice queued -- default responder falls back to the
      // first offered option (test-vortex-choice-a).
    });

    const aInstanceId = game.state().players.claude.drawPile[0].instanceId;
    const bInstanceId = game.state().players.claude.drawPile[1].instanceId;

    await game.play('r5-human-hunger-vortex');

    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual([aInstanceId]);
    expect(game.state().players.claude.drawPile.map((i) => i.instanceId)).toEqual([bInstanceId]);
    expect(await game.score('human')).toBe(2);
  });

  it('requestChoice options are labeled with card names, and no raw instance ids ever appear in the log', async () => {
    const aDef = testCardDef('test-vortex-label-a', { name: 'Label Vortex Card A' });
    const aEffect = testKeeperEffect('test-vortex-label-a', 1);
    const bDef = testCardDef('test-vortex-label-b', { name: 'Label Vortex Card B' });
    const bEffect = testKeeperEffect('test-vortex-label-b', 1);
    const game = createTestGame({
      extraRegistry: [aDef, bDef],
      extraEffects: [aEffect, bEffect],
      decks: { human: [], claude: ['test-vortex-label-a', 'test-vortex-label-b'] },
      hands: { human: ['r5-human-hunger-vortex'], claude: [] },
    });

    await game.play('r5-human-hunger-vortex');

    const labelLogs = game.state().log.filter((entry) => entry.message.includes('Label Vortex Card'));
    expect(labelLogs.length).toBeGreaterThan(0);
    for (const entry of game.state().log) {
      expect(entry.message).not.toMatch(/inst-\d+/);
    }
  });

  it('leaves a found cardId with no registered effect module sitting in the owner\'s hand instead of erroring', async () => {
    const game = createTestGame({
      decks: { human: [], claude: ['totally-unregistered-vortex-card'] },
      hands: { human: ['r5-human-hunger-vortex'], claude: [] },
    });

    await expect(game.play('r5-human-hunger-vortex')).resolves.toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.hand.map((i) => i.cardId)).toEqual(['totally-unregistered-vortex-card']);
    expect(game.state().players.claude.drawPile).toHaveLength(0);
  });

  it("strategy.choose prefers the HIGHEST-value candidate", () => {
    const view = {
      self: 'human' as const,
      opponent: 'claude' as const,
      state: {} as never,
      score: () => 0,
    };
    const options = [
      { id: 'a', label: 'A', value: 0 },
      { id: 'b', label: 'B', value: 5 },
      { id: 'c', label: 'C', value: 2 },
    ];
    const chosen = cardEffect.strategy?.choose?.(view, options);
    expect(chosen?.id).toBe('b');
  });

  it("strategy.playValue drops to a low value once the opponent's deck is empty", () => {
    const emptyView = {
      self: 'human' as const,
      opponent: 'claude' as const,
      state: {
        players: {
          human: { hand: [], drawPile: [] },
          claude: { hand: [], drawPile: [] },
        },
      } as never,
      score: () => 0,
    };
    const nonEmptyView = {
      self: 'human' as const,
      opponent: 'claude' as const,
      state: {
        players: {
          human: { hand: [], drawPile: [] },
          claude: { hand: [], drawPile: [{ instanceId: 'x', cardId: 'test-vortex-choice-a' }] },
        },
      } as never,
      score: () => 0,
    };
    const playValue = cardEffect.strategy?.playValue;
    const emptyResolved = typeof playValue === 'function' ? playValue(emptyView, { instanceId: 'a', cardId: cardEffect.cardId }) : playValue;
    const nonEmptyResolved = typeof playValue === 'function' ? playValue(nonEmptyView, { instanceId: 'a', cardId: cardEffect.cardId }) : playValue;
    expect(emptyResolved).toBeLessThan(nonEmptyResolved as number);
  });
});
