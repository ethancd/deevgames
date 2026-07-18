// EngineAPI.grantKeeperFreezeImmunity/revokeKeeperFreezeImmunity/
// isKeeperFreezeImmune -- a minimal, additive primitive added alongside the
// r7-claude-the-adiabatic-escrow-vault implement job ("Your keepers can't
// be frozen"). setScoreOverride -- the only existing "freeze a keeper"
// primitive -- consults isKeeperFreezeImmune for the TARGET instance's
// current owner and silently no-ops when immune, so every existing
// setScoreOverride caller stays completely unaffected unless some card has
// actually granted immunity. See src/engine/types.ts's EngineAPI doc
// comment.

import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('EngineAPI.grantKeeperFreezeImmunity / revokeKeeperFreezeImmunity / isKeeperFreezeImmune', () => {
  it('isKeeperFreezeImmune is false for both players until granted', () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    expect(game.api.isKeeperFreezeImmune('human')).toBe(false);
    expect(game.api.isKeeperFreezeImmune('claude')).toBe(false);
  });

  it('grantKeeperFreezeImmunity makes a player immune; revoke lifts it again', () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    game.api.grantKeeperFreezeImmunity('human');
    expect(game.api.isKeeperFreezeImmune('human')).toBe(true);
    expect(game.api.isKeeperFreezeImmune('claude')).toBe(false);

    game.api.revokeKeeperFreezeImmunity('human');
    expect(game.api.isKeeperFreezeImmune('human')).toBe(false);
  });

  it('revokeKeeperFreezeImmunity never goes negative -- an extra revoke is a harmless no-op', () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    game.api.revokeKeeperFreezeImmunity('human');
    game.api.revokeKeeperFreezeImmunity('human');
    expect(game.api.isKeeperFreezeImmune('human')).toBe(false);
    game.api.grantKeeperFreezeImmunity('human');
    expect(game.api.isKeeperFreezeImmune('human')).toBe(true);
  });

  it('composes across multiple grants: immunity only lifts once every grant has a matching revoke', () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    game.api.grantKeeperFreezeImmunity('human');
    game.api.grantKeeperFreezeImmunity('human');
    game.api.revokeKeeperFreezeImmunity('human');
    expect(game.api.isKeeperFreezeImmune('human')).toBe(true);
    game.api.revokeKeeperFreezeImmunity('human');
    expect(game.api.isKeeperFreezeImmune('human')).toBe(false);
  });

  it("setScoreOverride silently no-ops against an immune player's keeper instance", async () => {
    const def = testCardDef('test-immune-keeper');
    const effect = testKeeperEffect('test-immune-keeper', 4);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-immune-keeper'] },
    });
    await game.play('test-immune-keeper');
    const instanceId = game.state().players.human.inPlay[0].instanceId;

    game.api.grantKeeperFreezeImmunity('human');
    game.api.setScoreOverride(instanceId, 1);

    expect(game.api.getScoreOverride(instanceId)).toBeUndefined();
    expect(await game.score('human')).toBe(4);
  });

  it('setScoreOverride still applies normally once immunity is revoked', async () => {
    const def = testCardDef('test-immune-keeper-2');
    const effect = testKeeperEffect('test-immune-keeper-2', 4);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-immune-keeper-2'] },
    });
    await game.play('test-immune-keeper-2');
    const instanceId = game.state().players.human.inPlay[0].instanceId;

    game.api.grantKeeperFreezeImmunity('human');
    game.api.setScoreOverride(instanceId, 1);
    expect(game.api.getScoreOverride(instanceId)).toBeUndefined();

    game.api.revokeKeeperFreezeImmunity('human');
    game.api.setScoreOverride(instanceId, 1);
    expect(game.api.getScoreOverride(instanceId)).toBe(1);
  });

  it("does not affect the OTHER player's keepers", async () => {
    const def = testCardDef('test-immune-cross');
    const effect = testKeeperEffect('test-immune-cross', 3);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { claude: ['test-immune-cross'] },
      firstPlayer: 'claude',
    });
    await game.play('test-immune-cross');
    const instanceId = game.state().players.claude.inPlay[0].instanceId;

    game.api.grantKeeperFreezeImmunity('human');
    game.api.setScoreOverride(instanceId, 1);

    expect(game.api.getScoreOverride(instanceId)).toBe(1);
    expect(await game.score('claude')).toBe(1);
  });

  it('setScoreOverride on an instance not currently in any inPlay zone (e.g. a bogus id) still just sets it, immunity check is a harmless miss', () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    expect(() => game.api.setScoreOverride('not-a-real-instance', 1)).not.toThrow();
    expect(game.api.getScoreOverride('not-a-real-instance')).toBe(1);
  });
});
