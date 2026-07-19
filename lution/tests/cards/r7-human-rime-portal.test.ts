import { describe, it, expect } from 'vitest';
import { createTestGame, testActionEffect, testCardDef, testKeeperEffect } from '../helpers';
import { resolvePlay } from '../../src/engine/engine';
import cardEffect from '../../src/effects/r7-human-rime-portal';

describe('r7-human-rime-portal (Rime Portal)', () => {
  it('with an empty hand (besides itself) and an empty deck, resolves without crashing', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r7-human-rime-portal'] },
    });

    const result = await game.play('r7-human-rime-portal');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['r7-human-rime-portal']);
  });

  it('freezes every other card in hand -- none of them can be played afterward', async () => {
    const keeperDef = testCardDef('test-portal-frozen-keeper');
    const keeperEffect = testKeeperEffect('test-portal-frozen-keeper', 2);
    const game = createTestGame({
      extraRegistry: [keeperDef],
      extraEffects: [keeperEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r7-human-rime-portal', 'test-portal-frozen-keeper'] },
    });

    const frozenInstanceId = game.state().players.human.hand[1].instanceId;

    await game.play('r7-human-rime-portal');

    expect(game.api.isHandCardFrozen(frozenInstanceId)).toBe(true);
    await expect(resolvePlay(game.runtime, 'human', frozenInstanceId)).rejects.toThrow(/frozen/i);
    expect(game.state().players.human.hand).toHaveLength(1);
  });

  it('with exactly 1 card in the deck, finds and plays it without requesting a choice (a keeper enters play)', async () => {
    const def = testCardDef('test-portal-only-deck-keeper');
    const effect = testKeeperEffect('test-portal-only-deck-keeper', 4);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: ['test-portal-only-deck-keeper'], claude: [] },
      hands: { human: ['r7-human-rime-portal'] },
    });

    await game.play('r7-human-rime-portal');

    expect(game.state().players.human.drawPile).toHaveLength(0);
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['test-portal-only-deck-keeper']);
    expect(await game.score('human')).toBe(4);
  });

  it("finds and plays an action from the deck, resolving its onPlay hook and discarding it", async () => {
    let onPlayRan = false;
    const def = testCardDef('test-portal-deck-action');
    const effect = testActionEffect('test-portal-deck-action', {
      hooks: {
        onPlay: {
          scope: 'inHand',
          handler: () => {
            onPlayRan = true;
          },
        },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: ['test-portal-deck-action'], claude: [] },
      hands: { human: ['r7-human-rime-portal'] },
    });

    await game.play('r7-human-rime-portal');

    expect(onPlayRan).toBe(true);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toContain('test-portal-deck-action');
    expect(game.state().players.human.inPlay).toHaveLength(0);
  });

  it('with an empty deck, logs a flavor message and leaves the frozen hand as-is', async () => {
    const keeperDef = testCardDef('test-portal-empty-deck-keeper');
    const keeperEffect = testKeeperEffect('test-portal-empty-deck-keeper', 1);
    const game = createTestGame({
      extraRegistry: [keeperDef],
      extraEffects: [keeperEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r7-human-rime-portal', 'test-portal-empty-deck-keeper'] },
    });

    await game.play('r7-human-rime-portal');

    expect(
      game.state().log.some((e) => e.type === 'flavor' && e.message.includes('empty deck'))
    ).toBe(true);
    const remainingInstanceId = game.state().players.human.hand[0].instanceId;
    expect(game.api.isHandCardFrozen(remainingInstanceId)).toBe(true);
  });

  it('when the deck has more than 1 card, requests a choice and plays only the chosen one', async () => {
    const aDef = testCardDef('test-portal-choice-a');
    const aEffect = testKeeperEffect('test-portal-choice-a', 2);
    const bDef = testCardDef('test-portal-choice-b');
    const bEffect = testKeeperEffect('test-portal-choice-b', 6);
    const game = createTestGame({
      extraRegistry: [aDef, bDef],
      extraEffects: [aEffect, bEffect],
      decks: { human: ['test-portal-choice-a', 'test-portal-choice-b'], claude: [] },
      hands: { human: ['r7-human-rime-portal'] },
      // No scripted choice queued -- default responder falls back to the
      // first offered option (test-portal-choice-a).
    });

    const aInstanceId = game.state().players.human.drawPile[0].instanceId;
    const bInstanceId = game.state().players.human.drawPile[1].instanceId;

    await game.play('r7-human-rime-portal');

    expect(game.state().players.human.inPlay.map((i) => i.instanceId)).toEqual([aInstanceId]);
    expect(game.state().players.human.drawPile.map((i) => i.instanceId)).toEqual([bInstanceId]);
    expect(await game.score('human')).toBe(2);
  });

  it('requestChoice options are labeled with card names, and no raw instance ids ever appear in the log', async () => {
    const aDef = testCardDef('test-portal-label-a', { name: 'Label Deck Card A' });
    const aEffect = testKeeperEffect('test-portal-label-a', 1);
    const bDef = testCardDef('test-portal-label-b', { name: 'Label Deck Card B' });
    const bEffect = testKeeperEffect('test-portal-label-b', 1);
    const game = createTestGame({
      extraRegistry: [aDef, bDef],
      extraEffects: [aEffect, bEffect],
      decks: { human: ['test-portal-label-a', 'test-portal-label-b'], claude: [] },
      hands: { human: ['r7-human-rime-portal'] },
    });

    await game.play('r7-human-rime-portal');

    const labelLogs = game.state().log.filter((entry) => entry.message.includes('Label Deck Card'));
    expect(labelLogs.length).toBeGreaterThan(0);
    for (const entry of game.state().log) {
      expect(entry.message).not.toMatch(/inst-\d+/);
    }
  });

  it("strategy.choose prefers the HIGHEST-value candidate (a keeper's real base value over an action/unknown's 0)", () => {
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

  it('strategy.playValue drops to a low value once the deck is empty', () => {
    const view = {
      self: 'human' as const,
      opponent: 'claude' as const,
      state: {
        players: {
          human: { hand: [{ instanceId: 'a', cardId: 'r7-human-rime-portal' }], drawPile: [] },
          claude: { hand: [], drawPile: [] },
        },
      } as never,
      score: () => 0,
    };
    const playValue = cardEffect.strategy?.playValue;
    const resolved = typeof playValue === 'function' ? playValue(view, { instanceId: 'a', cardId: cardEffect.cardId }) : playValue;
    expect(resolved).toBe(0.25);
  });
});
