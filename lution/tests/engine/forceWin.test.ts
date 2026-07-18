// EngineAPI.forceWin -- a minimal, additive primitive added alongside
// r5-claude-the-halting-problem-s-solution ("When you play this card, you
// win the game"). Sets state.result directly, the same InnerGameResult
// shape checkCheckpoint would produce, without waiting for a score
// threshold.

import { describe, it, expect } from 'vitest';
import { createTestGame } from '../helpers';

describe('EngineAPI.forceWin', () => {
  it('sets state.result to a decisive win for the given player', () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    expect(game.state().result).toBeNull();
    game.api.forceWin('human');
    expect(game.state().result).toEqual({ outcome: 'win', winner: 'human' });
  });

  it('does not clobber an existing result once one is already set', () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    game.api.forceWin('human');
    game.api.forceWin('claude');
    // First result wins -- the second call is a no-op.
    expect(game.state().result).toEqual({ outcome: 'win', winner: 'human' });
  });

  it('is a no-op call otherwise (no exceptions, no other state mutated)', () => {
    const game = createTestGame({ decks: { human: [], claude: [] } });
    const before = game.state();
    expect(() => game.api.forceWin('claude')).not.toThrow();
    expect(game.state().activePlayer).toBe(before.activePlayer);
    expect(game.state().turnNumber).toBe(before.turnNumber);
  });
});
