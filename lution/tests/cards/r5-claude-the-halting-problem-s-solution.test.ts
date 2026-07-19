import { describe, it, expect } from 'vitest';
import { createTestGame } from '../helpers';
import { compileComposition } from '../../src/engine/compileComposition';
import cardsData from '../../data/cards.json';

const r5ClaudeTheHaltingProblemSSolutionRow = (
  cardsData as Array<{ id: string; composition?: unknown }>
).find((c) => c.id === 'r5-claude-the-halting-problem-s-solution')!;
const cardEffect = compileComposition(
  'r5-claude-the-halting-problem-s-solution',
  r5ClaudeTheHaltingProblemSSolutionRow.composition as any
);

describe("r5-claude-the-halting-problem-s-solution (The Halting Problem's Solution)", () => {
  it('winning player: playing it instantly sets state.result to a win for the owner', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ["r5-claude-the-halting-problem-s-solution"] },
    });

    expect(game.state().result).toBeNull();
    const result = await game.play('r5-claude-the-halting-problem-s-solution');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().result).toEqual({ outcome: 'win', winner: 'human' });
  });

  it('is discarded after resolving, same as any other action card', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ["r5-claude-the-halting-problem-s-solution"] },
    });

    await game.play('r5-claude-the-halting-problem-s-solution');
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual([
      'r5-claude-the-halting-problem-s-solution',
    ]);
  });

  it('wins for whichever player actually played it, not always the same seat', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: [], claude: ["r5-claude-the-halting-problem-s-solution"] },
      firstPlayer: 'claude',
    });

    await game.play('r5-claude-the-halting-problem-s-solution');
    expect(game.state().result).toEqual({ outcome: 'win', winner: 'claude' });
  });

  it('a full turn via runTurn ends the instant this card is played, mid-turn', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ["r5-claude-the-halting-problem-s-solution"] },
    });

    const instanceId = game.state().players.human.hand[0].instanceId;
    await game.runTurn({ playInstanceId: instanceId });

    expect(game.state().result).toEqual({ outcome: 'win', winner: 'human' });
    // runTurn returns early on the post-play checkpoint-equivalent result,
    // so activePlayer never swaps to claude.
    expect(game.state().activePlayer).toBe('human');
  });

  it('the built-in AI always prefers to play it the instant it is in hand', () => {
    // Sanity check on the strategy hint rather than the effect itself: this
    // card's playValue must dominate any ordinary keeper's.
    expect(cardEffect.strategy?.playValue).toBeGreaterThan(1000);
  });
});
