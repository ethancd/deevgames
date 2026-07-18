import { describe, it, expect } from 'vitest';
import { createTestGame } from '../helpers';

describe('r1-claude-the-snowballing-interest-trust (The Snowballing Interest Trust)', () => {
  it('is a keeper worth 1 point the instant it enters play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r1-claude-the-snowballing-interest-trust'] },
    });

    expect(await game.score('human')).toBe(0);

    const result = await game.play('r1-claude-the-snowballing-interest-trust');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual([
      'r1-claude-the-snowballing-interest-trust',
    ]);
    expect(await game.score('human')).toBe(1);
  });

  it("grows by 1 at the start of its owner's turn, but NOT at the start of the opponent's turn", async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r1-claude-the-snowballing-interest-trust'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r1-claude-the-snowballing-interest-trust');
    expect(await game.score('human')).toBe(1);

    // Turn 1 is human's (the owner) -- onTurnStart (side: 'owner') fires and
    // compounds the bonus by 1.
    await game.runTurn({ playInstanceId: null });
    expect(await game.score('human')).toBe(2);

    // Turn 2 is claude's (the opponent) -- side: 'owner' means this only
    // fires when owner === activePlayer, so it stays at 2.
    await game.runTurn({ playInstanceId: null });
    expect(await game.score('human')).toBe(2);

    expect(
      game.state().log.some((e) => e.type === 'flavor' && e.message.includes('Snowballing Interest Trust'))
    ).toBe(true);
  });

  it("grows by exactly 1, permanently, at the start of each of its owner's subsequent turns", async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r1-claude-the-snowballing-interest-trust'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r1-claude-the-snowballing-interest-trust');
    expect(await game.score('human')).toBe(1);

    await game.runTurn({ playInstanceId: null }); // human's turn 1 -> 2
    expect(await game.score('human')).toBe(2);

    await game.runTurn({ playInstanceId: null }); // claude's turn -> unchanged
    await game.runTurn({ playInstanceId: null }); // human's turn 2 -> 3
    expect(await game.score('human')).toBe(3);

    await game.runTurn({ playInstanceId: null }); // claude's turn -> unchanged
    await game.runTurn({ playInstanceId: null }); // human's turn 3 -> 4
    expect(await game.score('human')).toBe(4);
  });

  it('resets its accumulated bonus if it ever leaves play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r1-claude-the-snowballing-interest-trust'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r1-claude-the-snowballing-interest-trust');
    await game.runTurn({ playInstanceId: null }); // human's turn 1 -> 2
    await game.runTurn({ playInstanceId: null }); // claude's turn -> unchanged
    expect(await game.score('human')).toBe(2);

    const instanceId = game.state().players.human.inPlay[0].instanceId;
    await game.api.destroyKeeper('human', instanceId);
    expect(await game.score('human')).toBe(0);

    await game.api.moveToHand(instanceId);
    await game.api.moveToPlay('human', instanceId);
    // Back in play with no accumulated bonus -- worth 1 point again.
    expect(await game.score('human')).toBe(1);
  });
});
