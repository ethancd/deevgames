import { describe, it, expect } from 'vitest';
import { checkGameEnd } from '../../src/game/gameEnd';
import type { GameState } from '../../src/game/types';
import { loadCards } from '../../src/game/cardLoader';
import { createInitialGrid } from '../../src/game/grid';

function createTestGameState(): GameState {
  const cards = loadCards();
  const grid = createInitialGrid(cards);

  return {
    phase: 'playing',
    players: [
      {
        id: 'player1',
        name: 'Alice',
        symbols: { mars: 4, venus: 4, mercury: 4, moon: 4 },
        tableau: [],
        cardsWonByCounterBid: 0,
        cardsBurnedThisGame: 0,
      },
      {
        id: 'player2',
        name: 'Bob',
        symbols: { mars: 4, venus: 4, mercury: 4, moon: 4 },
        tableau: [],
        cardsWonByCounterBid: 0,
        cardsBurnedThisGame: 0,
      },
    ],
    currentPlayerIndex: 0,
    grid,
    cardsBurnedThisGame: 0,
    turnHistory: [],
  };
}

describe('checkGameEnd', () => {
  it('should return false when players have symbols and cards are available', () => {
    const state = createTestGameState();
    expect(checkGameEnd(state)).toBe(false);
  });

  it('should return true when no available cards', () => {
    const state = createTestGameState();

    // Clear all cells (no available cards)
    state.grid.cells.clear();

    expect(checkGameEnd(state)).toBe(true);
  });

  it('should return true when neither player can afford any available card', () => {
    const state = createTestGameState();

    // Set both players to have no symbols
    state.players[0].symbols = { mars: 0, venus: 0, mercury: 0, moon: 0 };
    state.players[1].symbols = { mars: 0, venus: 0, mercury: 0, moon: 0 };

    expect(checkGameEnd(state)).toBe(true);
  });

  it('should return false if at least one player can afford a card', () => {
    const state = createTestGameState();

    // Player 1 has no symbols
    state.players[0].symbols = { mars: 0, venus: 0, mercury: 0, moon: 0 };

    // Player 2 has symbols (game continues)
    state.players[1].symbols = { mars: 4, venus: 4, mercury: 4, moon: 4 };

    expect(checkGameEnd(state)).toBe(false);
  });
});
