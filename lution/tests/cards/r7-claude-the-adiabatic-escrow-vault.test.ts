import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';
import cardEffect from '../../src/effects/r7-claude-the-adiabatic-escrow-vault';

describe('r7-claude-the-adiabatic-escrow-vault (The Adiabatic Escrow Vault)', () => {
  it('is a keeper worth 1 point while in play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r7-claude-the-adiabatic-escrow-vault'] },
    });

    expect(await game.score('human')).toBe(0);

    const result = await game.play('r7-claude-the-adiabatic-escrow-vault');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual([
      'r7-claude-the-adiabatic-escrow-vault',
    ]);
    expect(await game.score('human')).toBe(1);
  });

  it("makes the owner's OTHER keepers immune to setScoreOverride (the only existing freeze primitive)", async () => {
    const def = testCardDef('test-vault-protected-keeper');
    const effect = testKeeperEffect('test-vault-protected-keeper', 5);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r7-claude-the-adiabatic-escrow-vault', 'test-vault-protected-keeper'] },
    });

    await game.play('r7-claude-the-adiabatic-escrow-vault');
    await game.play('test-vault-protected-keeper');

    const protectedInstanceId = game.state().players.human.inPlay.find(
      (i) => i.cardId === 'test-vault-protected-keeper'
    )!.instanceId;

    game.api.setScoreOverride(protectedInstanceId, 1);

    expect(game.api.getScoreOverride(protectedInstanceId)).toBeUndefined();
    expect(await game.score('human')).toBe(1 + 5);
  });

  it("protects a keeper played BEFORE the vault enters play too (immunity is player-scoped, not tied to when the keeper arrived)", async () => {
    const def = testCardDef('test-vault-early-keeper');
    const effect = testKeeperEffect('test-vault-early-keeper', 3);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-vault-early-keeper', 'r7-claude-the-adiabatic-escrow-vault'] },
    });

    await game.play('test-vault-early-keeper');
    await game.play('r7-claude-the-adiabatic-escrow-vault');

    const earlyInstanceId = game.state().players.human.inPlay.find(
      (i) => i.cardId === 'test-vault-early-keeper'
    )!.instanceId;

    game.api.setScoreOverride(earlyInstanceId, 1);
    expect(game.api.getScoreOverride(earlyInstanceId)).toBeUndefined();
  });

  it("does NOT protect the OPPONENT's keepers", async () => {
    const def = testCardDef('test-vault-opponent-keeper');
    const effect = testKeeperEffect('test-vault-opponent-keeper', 4);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r7-claude-the-adiabatic-escrow-vault'], claude: ['test-vault-opponent-keeper'] },
    });

    await game.play('r7-claude-the-adiabatic-escrow-vault');
    game.state().activePlayer = 'claude';
    await game.play('test-vault-opponent-keeper');

    const opponentInstanceId = game.state().players.claude.inPlay[0].instanceId;
    game.api.setScoreOverride(opponentInstanceId, 1);

    expect(game.api.getScoreOverride(opponentInstanceId)).toBe(1);
    expect(await game.score('claude')).toBe(1);
  });

  it('freeze immunity lifts once the vault leaves play', async () => {
    const def = testCardDef('test-vault-after-leave-keeper');
    const effect = testKeeperEffect('test-vault-after-leave-keeper', 2);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r7-claude-the-adiabatic-escrow-vault', 'test-vault-after-leave-keeper'] },
    });

    await game.play('r7-claude-the-adiabatic-escrow-vault');
    await game.play('test-vault-after-leave-keeper');
    const vaultInstanceId = game.state().players.human.inPlay.find(
      (i) => i.cardId === 'r7-claude-the-adiabatic-escrow-vault'
    )!.instanceId;
    const keeperInstanceId = game.state().players.human.inPlay.find(
      (i) => i.cardId === 'test-vault-after-leave-keeper'
    )!.instanceId;

    expect(game.api.isKeeperFreezeImmune('human')).toBe(true);

    await game.api.destroyKeeper('human', vaultInstanceId);
    expect(game.api.isKeeperFreezeImmune('human')).toBe(false);

    game.api.setScoreOverride(keeperInstanceId, 1);
    expect(game.api.getScoreOverride(keeperInstanceId)).toBe(1);
  });

  it('logs a flavor message when it enters play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r7-claude-the-adiabatic-escrow-vault'] },
    });

    await game.play('r7-claude-the-adiabatic-escrow-vault');

    expect(
      game
        .state()
        .log.some((e) => e.type === 'flavor' && e.message.includes('The Adiabatic Escrow Vault'))
    ).toBe(true);
  });

  it('strategy.playValue and strategy.stealTargetValue are defined and sensible', () => {
    const view = {
      self: 'human' as const,
      opponent: 'claude' as const,
      state: {
        players: {
          human: { inPlay: [{ instanceId: 'a', cardId: 'x' }, { instanceId: 'b', cardId: 'y' }] },
          claude: { inPlay: [] },
        },
      } as never,
      score: () => 0,
    };
    const playValue = cardEffect.strategy?.playValue;
    const resolved = typeof playValue === 'function' ? playValue(view, { instanceId: 'v', cardId: cardEffect.cardId }) : playValue;
    expect(typeof resolved).toBe('number');
    expect(resolved as number).toBeGreaterThanOrEqual(1);
    expect(cardEffect.strategy?.stealTargetValue).toBe(1);
  });
});
