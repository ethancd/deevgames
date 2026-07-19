import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';

describe('r1-human-bone-chilling-breeze (Bone-Chilling Breeze)', () => {
  it('is discarded after resolving and contributes 0 points itself', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r1-human-bone-chilling-breeze'] },
    });

    const result = await game.play('r1-human-bone-chilling-breeze');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.inPlay).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual([
      'r1-human-bone-chilling-breeze',
    ]);
    expect(await game.score('human')).toBe(0);
  });

  it('is a no-op (but does not throw) when the table has no keepers in play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r1-human-bone-chilling-breeze'] },
    });
    await expect(game.play('r1-human-bone-chilling-breeze')).resolves.toEqual({
      passed: false,
      cancelled: false,
    });
  });

  it("freezes every keeper on BOTH players' boards down to 1 point", async () => {
    const bigHuman = testCardDef('test-freeze-human-big');
    const bigClaude = testCardDef('test-freeze-claude-big');
    const bigHumanEffect = testKeeperEffect('test-freeze-human-big', 5);
    const bigClaudeEffect = testKeeperEffect('test-freeze-claude-big', 7);

    const game = createTestGame({
      extraRegistry: [bigHuman, bigClaude],
      extraEffects: [bigHumanEffect, bigClaudeEffect],
      decks: { human: [], claude: [] },
      hands: {
        human: ['test-freeze-human-big', 'r1-human-bone-chilling-breeze'],
        claude: ['test-freeze-claude-big'],
      },
      firstPlayer: 'human',
    });

    await game.play('test-freeze-human-big');
    expect(await game.score('human')).toBe(5);

    // Finish human's turn (forced pass, so the breeze stays in hand for
    // later) so activePlayer swaps to claude, then have claude play its big
    // keeper and swap back to human.
    await game.runTurn({ playInstanceId: null });
    const claudeInstanceId = game.state().players.claude.hand[0].instanceId;
    await game.runTurn({ playInstanceId: claudeInstanceId });
    expect(await game.score('claude')).toBe(7);

    await game.play('r1-human-bone-chilling-breeze');

    expect(await game.score('human')).toBe(1);
    expect(await game.score('claude')).toBe(1);
  });

  it("caps a keeper whose value is normally computed dynamically via its own modifyScore hook", async () => {
    const dynamicDef = testCardDef('test-freeze-dynamic');
    const dynamicEffect = testKeeperEffect('test-freeze-dynamic', 0, {
      hooks: {
        modifyScore: {
          scope: 'inPlay',
          handler: (ctx) => {
            const payload = ctx.event.payload as { score: number } | undefined;
            if (payload) payload.score += 20;
          },
        },
      },
    });

    const game = createTestGame({
      extraRegistry: [dynamicDef],
      extraEffects: [dynamicEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-freeze-dynamic', 'r1-human-bone-chilling-breeze'] },
    });

    await game.play('test-freeze-dynamic');
    expect(await game.score('human')).toBe(20);

    await game.play('r1-human-bone-chilling-breeze');
    // Without suppressing the frozen instance's own modifyScore hook this
    // would still be 20 (or 21) instead of exactly 1.
    expect(await game.score('human')).toBe(1);
  });

  it('freezes The Snowballing Interest Trust to exactly 1 point regardless of how much it has already compounded', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: {
        human: ['r1-claude-the-snowballing-interest-trust', 'r1-human-bone-chilling-breeze'],
        claude: [],
      },
      firstPlayer: 'human',
    });

    await game.play('r1-claude-the-snowballing-interest-trust');
    await game.runTurn({ playInstanceId: null }); // human's turn 1 -> Trust compounds to 2
    await game.runTurn({ playInstanceId: null }); // claude's turn -> unchanged, and swaps back to human
    expect(await game.score('human')).toBe(2);

    await game.play('r1-human-bone-chilling-breeze');
    expect(await game.score('human')).toBe(1);
  });

  it('leaves an unfrozen keeper played AFTER the freeze completely unaffected', async () => {
    const freshDef = testCardDef('test-freeze-fresh-after');
    const freshEffect = testKeeperEffect('test-freeze-fresh-after', 3);

    const game = createTestGame({
      extraRegistry: [freshDef],
      extraEffects: [freshEffect],
      decks: { human: [], claude: [] },
      hands: {
        human: ['test-freeze-fresh-after', 'r1-human-bone-chilling-breeze'],
      },
    });

    await game.play('r1-human-bone-chilling-breeze'); // nothing to freeze yet
    await game.play('test-freeze-fresh-after');
    // Played after the freeze resolved -- never had an override applied to
    // it, so it scores normally.
    expect(await game.score('human')).toBe(3);
  });
});
