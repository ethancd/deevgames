// EngineAPI.setScoreOverride/getScoreOverride/clearScoreOverride -- a
// minimal, additive primitive added alongside the
// r1-human-bone-chilling-breeze implement job. A "freeze" effect needs to
// flatten a keeper's contribution to score() to a fixed amount regardless
// of whether that keeper's value is a plain baseValue or computed
// dynamically via its own modifyScore hook, without either card needing to
// know about the other. See src/engine/types.ts's EngineAPI doc comment.

import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('EngineAPI.setScoreOverride / getScoreOverride / clearScoreOverride', () => {
  it('getScoreOverride returns undefined when no override has been set', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['starter-pocket-nebula'] },
    });
    await game.play('starter-pocket-nebula');
    const instanceId = game.state().players.human.inPlay[0].instanceId;
    expect(game.api.getScoreOverride(instanceId)).toBeUndefined();
  });

  it('overrides a plain keeper\'s contribution to score(), ignoring its registered baseValue', async () => {
    const def = testCardDef('test-override-plain-keeper');
    const effect = testKeeperEffect('test-override-plain-keeper', 5);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-override-plain-keeper'] },
    });

    await game.play('test-override-plain-keeper');
    expect(await game.score('human')).toBe(5);

    const instanceId = game.state().players.human.inPlay[0].instanceId;
    game.api.setScoreOverride(instanceId, 1);

    expect(game.api.getScoreOverride(instanceId)).toBe(1);
    expect(await game.score('human')).toBe(1);
  });

  it("suppresses the overridden instance's own modifyScore hook instead of adding on top of the override", async () => {
    const def = testCardDef('test-override-dynamic-keeper');
    const effect = testKeeperEffect('test-override-dynamic-keeper', 0, {
      hooks: {
        modifyScore: {
          scope: 'inPlay',
          handler: (ctx) => {
            const payload = ctx.event.payload as { score: number } | undefined;
            if (payload) payload.score += 10;
          },
        },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-override-dynamic-keeper'] },
    });

    await game.play('test-override-dynamic-keeper');
    expect(await game.score('human')).toBe(10);

    const instanceId = game.state().players.human.inPlay[0].instanceId;
    game.api.setScoreOverride(instanceId, 1);

    // Without the modifyScore suppression this would be 0 (base) + 1
    // (override... but overrides replace the base sum) + 10 (unsuppressed
    // hook) = 11. With suppression, it's exactly the override value.
    expect(await game.score('human')).toBe(1);
  });

  it('does not affect an UN-overridden instance, even one belonging to the same player', async () => {
    const overriddenDef = testCardDef('test-override-a');
    const plainDef = testCardDef('test-override-b');
    const overriddenEffect = testKeeperEffect('test-override-a', 3);
    const plainEffect = testKeeperEffect('test-override-b', 4);
    const game = createTestGame({
      extraRegistry: [overriddenDef, plainDef],
      extraEffects: [overriddenEffect, plainEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-override-a', 'test-override-b'] },
    });

    await game.play('test-override-a');
    await game.play('test-override-b');
    expect(await game.score('human')).toBe(7);

    const overriddenInstanceId = game.state().players.human.inPlay.find(
      (i) => i.cardId === 'test-override-a'
    )!.instanceId;
    game.api.setScoreOverride(overriddenInstanceId, 1);

    expect(await game.score('human')).toBe(1 + 4);
  });

  it('clearScoreOverride restores the normal baseValue + modifyScore contribution', async () => {
    const def = testCardDef('test-override-clear');
    const effect = testKeeperEffect('test-override-clear', 6);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-override-clear'] },
    });

    await game.play('test-override-clear');
    const instanceId = game.state().players.human.inPlay[0].instanceId;

    game.api.setScoreOverride(instanceId, 1);
    expect(await game.score('human')).toBe(1);

    game.api.clearScoreOverride(instanceId);
    expect(game.api.getScoreOverride(instanceId)).toBeUndefined();
    expect(await game.score('human')).toBe(6);
  });

  it('clearScoreOverride on an instance with no override set is a no-op', async () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    expect(() => game.api.clearScoreOverride('not-a-real-instance')).not.toThrow();
    expect(game.api.getScoreOverride('not-a-real-instance')).toBeUndefined();
  });
});
