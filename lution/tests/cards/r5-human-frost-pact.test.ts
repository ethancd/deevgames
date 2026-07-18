import { describe, it, expect } from 'vitest';
import { createTestGame, testActionEffect, testCardDef, testKeeperEffect } from '../helpers';
import { resolvePlay } from '../../src/engine/engine';
import cardEffect from '../../src/effects/r5-human-frost-pact';

describe('r5-human-frost-pact (Frost Pact)', () => {
  it('with nothing to freeze on either side, contributes 0 points and does not crash', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r5-human-frost-pact'], claude: [] },
    });

    const result = await game.play('r5-human-frost-pact');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(await game.score('human')).toBe(0);
  });

  it('freezes a single owner-hand keeper and a single opponent-hand action, unplayable by either side, worth their combined contribution', async () => {
    const keeperDef = testCardDef('test-pact-owner-keeper');
    const keeperEffect = testKeeperEffect('test-pact-owner-keeper', 3);
    const actionDef = testCardDef('test-pact-opp-action');
    const actionEffect = testActionEffect('test-pact-opp-action');

    const game = createTestGame({
      extraRegistry: [keeperDef, actionDef],
      extraEffects: [keeperEffect, actionEffect],
      decks: { human: [], claude: [] },
      hands: {
        human: ['r5-human-frost-pact', 'test-pact-owner-keeper'],
        claude: ['test-pact-opp-action'],
      },
    });

    const ownerCandidateId = game.state().players.human.hand[1].instanceId;
    const opponentCandidateId = game.state().players.claude.hand[0].instanceId;

    await game.play('r5-human-frost-pact');

    // Owner's keeper (base value 3) and the opponent's action (no base
    // value -> 1 flat point) are both now frozen in their respective hands.
    expect(game.api.isHandCardFrozen(ownerCandidateId)).toBe(true);
    expect(game.api.isHandCardFrozen(opponentCandidateId)).toBe(true);
    expect(await game.score('human')).toBe(3 + 1);

    // Neither side can play their frozen card.
    await expect(resolvePlay(game.runtime, 'human', ownerCandidateId)).rejects.toThrow(/frozen/i);
    await expect(resolvePlay(game.runtime, 'claude', opponentCandidateId)).rejects.toThrow(/frozen/i);
    expect(game.state().players.human.hand).toHaveLength(1);
    expect(game.state().players.claude.hand).toHaveLength(1);
  });

  it("a keeper whose base value happens to be 0 contributes 0, NOT the 'no base value' fallback of 1", async () => {
    const zeroKeeperDef = testCardDef('test-pact-zero-keeper');
    const zeroKeeperEffect = testKeeperEffect('test-pact-zero-keeper', 0);

    const game = createTestGame({
      extraRegistry: [zeroKeeperDef],
      extraEffects: [zeroKeeperEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r5-human-frost-pact', 'test-pact-zero-keeper'], claude: [] },
    });

    await game.play('r5-human-frost-pact');
    // 0 (owner's frozen keeper, a real base value of 0) + 0 (no opponent
    // card to freeze) = 0, distinct from the action-card "no base value"
    // case, which would contribute 1 instead.
    expect(await game.score('human')).toBe(0);
  });

  it('when the owner has more than 1 hand candidate, requests a choice and freezes only the chosen one', async () => {
    const aDef = testCardDef('test-pact-choice-a');
    const aEffect = testKeeperEffect('test-pact-choice-a', 2);
    const bDef = testCardDef('test-pact-choice-b');
    const bEffect = testKeeperEffect('test-pact-choice-b', 5);

    const game = createTestGame({
      extraRegistry: [aDef, bDef],
      extraEffects: [aEffect, bEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r5-human-frost-pact', 'test-pact-choice-a', 'test-pact-choice-b'], claude: [] },
      // No scripted choice queued -- the test helper's default responder
      // falls back to the first option offered, i.e. the first remaining
      // hand card (test-pact-choice-a).
    });

    const aInstanceId = game.state().players.human.hand[1].instanceId;
    const bInstanceId = game.state().players.human.hand[2].instanceId;

    await game.play('r5-human-frost-pact');

    expect(game.api.isHandCardFrozen(aInstanceId)).toBe(true);
    expect(game.api.isHandCardFrozen(bInstanceId)).toBe(false);
    expect(await game.score('human')).toBe(2);
  });

  it('randomly freezes exactly 1 card from a multi-card opponent hand, worth exactly that card\'s contribution', async () => {
    const oppADef = testCardDef('test-pact-opp-a');
    const oppAEffect = testKeeperEffect('test-pact-opp-a', 2);
    const oppBDef = testCardDef('test-pact-opp-b');
    const oppBEffect = testKeeperEffect('test-pact-opp-b', 6);

    const game = createTestGame({
      extraRegistry: [oppADef, oppBDef],
      extraEffects: [oppAEffect, oppBEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r5-human-frost-pact'], claude: ['test-pact-opp-a', 'test-pact-opp-b'] },
    });

    const aInstanceId = game.state().players.claude.hand[0].instanceId;
    const bInstanceId = game.state().players.claude.hand[1].instanceId;

    await game.play('r5-human-frost-pact');

    const aFrozen = game.api.isHandCardFrozen(aInstanceId);
    const bFrozen = game.api.isHandCardFrozen(bInstanceId);
    // Exactly 1 of the 2 opponent candidates gets frozen -- never both,
    // never neither.
    expect([aFrozen, bFrozen].filter(Boolean)).toHaveLength(1);

    const expectedValue = aFrozen ? 2 : 6;
    expect(await game.score('human')).toBe(expectedValue);
  });

  it('requestChoice options are labeled with card names, never raw instance ids', async () => {
    const aDef = testCardDef('test-pact-label-a', { name: 'Label Test Card A' });
    const aEffect = testKeeperEffect('test-pact-label-a', 1);
    const bDef = testCardDef('test-pact-label-b', { name: 'Label Test Card B' });
    const bEffect = testKeeperEffect('test-pact-label-b', 1);

    const game = createTestGame({
      extraRegistry: [aDef, bDef],
      extraEffects: [aEffect, bEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r5-human-frost-pact', 'test-pact-label-a', 'test-pact-label-b'], claude: [] },
    });

    await game.play('r5-human-frost-pact');

    const labelLogs = game.state().log.filter((entry) => entry.message.includes('Label Test Card'));
    expect(labelLogs.length).toBeGreaterThan(0);
    for (const entry of game.state().log) {
      expect(entry.message).not.toMatch(/inst-\d+/);
    }
  });

  it("strategy.choose prefers freezing the LOWEST-contribution candidate, to minimize what's sacrificed", () => {
    const view = {
      self: 'human' as const,
      opponent: 'claude' as const,
      state: {} as never,
      score: () => 0,
    };
    const options = [
      { id: 'a', label: 'A', value: 5 },
      { id: 'b', label: 'B', value: 1 },
      { id: 'c', label: 'C', value: 3 },
    ];
    const chosen = cardEffect.strategy?.choose?.(view, options);
    expect(chosen?.id).toBe('b');
  });
});
