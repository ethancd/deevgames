import { describe, it, expect } from 'vitest';
import { createTestGame } from '../helpers';

describe('r8-human-radium (Radium)', () => {
  it('is worth -1 point the instant it enters play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r8-human-radium'] },
    });

    expect(await game.score('human')).toBe(0);

    const result = await game.play('r8-human-radium');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['r8-human-radium']);
    expect(await game.score('human')).toBe(-1);
  });

  it("loses an additional 1 point on EITHER player's turn (side: any), compounding turn over turn", async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r8-human-radium'] },
      firstPlayer: 'human',
    });

    await game.play('r8-human-radium');
    expect(await game.score('human')).toBe(-1);

    // Start of human's own turn.
    game.state().activePlayer = 'human';
    await game.api.emit('onTurnStart', {});
    expect(await game.score('human')).toBe(-2);

    // Start of the OPPONENT's turn: side 'any' means it keeps ticking down
    // even on claude's turn.
    game.state().activePlayer = 'claude';
    await game.api.emit('onTurnStart', {});
    expect(await game.score('human')).toBe(-3);

    game.state().activePlayer = 'human';
    await game.api.emit('onTurnStart', {});
    expect(await game.score('human')).toBe(-4);
  });

  it('resets its turn-out counter if it leaves play and comes back (bounced to hand and replayed)', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r8-human-radium'] },
      firstPlayer: 'human',
    });

    await game.play('r8-human-radium');
    const instanceId = game.state().players.human.inPlay[0].instanceId;

    await game.api.emit('onTurnStart', {});
    await game.api.emit('onTurnStart', {});
    expect(await game.score('human')).toBe(-3);

    await game.api.destroyKeeper('human', instanceId);
    await game.api.moveToHand(instanceId);
    await game.play('r8-human-radium');

    expect(await game.score('human')).toBe(-1); // reset, not resumed at -3
  });
});
