import { describe, it, expect } from 'vitest';
import { createTestGame } from '../helpers';

describe('draw phase', () => {
  it('shuffles the discard pile back into the draw pile once the draw pile is empty', async () => {
    const game = createTestGame({
      decks: { human: ['starter-pocket-nebula'], claude: [] },
    });

    // draw pile has exactly one card; drain it, then discard some cards so
    // there's something to reshuffle in.
    await game.api.draw('human', 1);
    expect(game.state().players.human.drawPile).toHaveLength(0);

    const instanceId = game.state().players.human.hand[0].instanceId;
    await game.api.moveToDiscard('human', instanceId, 'hand');
    const other = game.state().players.human.hand[0]?.instanceId;
    if (other) await game.api.moveToDiscard('human', other, 'hand');

    expect(game.state().players.human.discard.length).toBeGreaterThan(0);
    expect(game.state().players.human.drawPile).toHaveLength(0);

    const drawn = await game.api.draw('human', 1);
    expect(drawn).toHaveLength(1);
    expect(game.state().log.some((e) => e.type === 'reshuffle')).toBe(true);
  });

  it('is a no-op when both the draw pile and discard pile are empty', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: [] },
    });
    expect(game.state().players.human.drawPile).toHaveLength(0);
    expect(game.state().players.human.discard).toHaveLength(0);

    const drawn = await game.api.draw('human', 1);
    expect(drawn).toHaveLength(0);
    expect(game.state().players.human.hand).toHaveLength(0);
  });

  it('passes when the active player has an empty hand', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: [] },
    });

    // No playInstanceId override: the natural runTurn path sees an empty
    // hand and passes on its own.
    await game.runTurn();

    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().log.some((e) => e.type === 'pass')).toBe(true);
  });
});
