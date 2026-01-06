import { describe, it, expect, beforeEach } from 'vitest';
import type { GameState, Position } from '../../src/game/types';
import {
  initiateBuy,
  handleDeclineInitialBid,
  handleCounterBid,
  handleFinalBid,
  handleDeclineCounter,
  burnCard,
} from '../../src/game/actions';
import { loadCards } from '../../src/game/cardLoader';
import { createInitialGrid, getAvailableCards } from '../../src/game/grid';

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

describe('initiateBuy', () => {
  it('should start bidding phase', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const newState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    expect(newState.phase).toBe('bidding');
    expect(newState.activeBid).toBeDefined();
    expect(newState.activeBid?.bidStage).toBe('initial');
  });

  it('should record original bidder', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const newState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    expect(newState.activeBid?.originalBidder).toBe(0);
  });
});

describe('handleDeclineInitialBid', () => {
  it('should give card to original bidder', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const newState = handleDeclineInitialBid(bidState);

    expect(newState.players[0].tableau).toHaveLength(1);
    expect(newState.players[0].tableau[0].id).toBe(targetCard.card.id);
  });

  it('should deduct symbols from winner', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const newState = handleDeclineInitialBid(bidState);

    expect(newState.players[0].symbols.mars).toBe(3);
  });

  it('should mark cell as empty', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const newState = handleDeclineInitialBid(bidState);
    const cell = newState.grid.cells.get(`${targetCard.x},${targetCard.y}`);

    expect(cell?.type).toBe('empty');
  });

  it('should advance turn to opponent', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const newState = handleDeclineInitialBid(bidState);

    expect(newState.currentPlayerIndex).toBe(1);
  });

  it('should return to playing phase', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const newState = handleDeclineInitialBid(bidState);

    expect(newState.phase).toBe('playing');
    expect(newState.activeBid).toBeUndefined();
  });
});

describe('handleCounterBid', () => {
  it('should update bid stage to countered', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const counterState = handleCounterBid(bidState, {
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
    });

    expect(counterState.activeBid?.bidStage).toBe('countered');
  });

  it('should record counter bidder', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const counterState = handleCounterBid(bidState, {
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
    });

    expect(counterState.activeBid?.counterBidder).toBe(1);
  });
});

describe('handleDeclineCounter', () => {
  it('should give card to counter bidder', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const counterState = handleCounterBid(bidState, {
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
    });

    const newState = handleDeclineCounter(counterState);

    expect(newState.players[1].tableau).toHaveLength(1);
    expect(newState.players[1].tableau[0].id).toBe(targetCard.card.id);
  });

  it('should NOT advance turn (original player keeps turn)', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const counterState = handleCounterBid(bidState, {
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
    });

    const newState = handleDeclineCounter(counterState);

    // Turn stays with player 0
    expect(newState.currentPlayerIndex).toBe(0);
  });

  it('should increment cardsWonByCounterBid', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const counterState = handleCounterBid(bidState, {
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
    });

    const newState = handleDeclineCounter(counterState);

    expect(newState.players[1].cardsWonByCounterBid).toBe(1);
  });
});

describe('handleFinalBid', () => {
  it('should update bid stage to final', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const counterState = handleCounterBid(bidState, {
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
    });

    const finalState = handleFinalBid(counterState, {
      mars: 1,
      venus: 1,
      mercury: 1,
      moon: 0,
    });

    expect(finalState.activeBid?.bidStage).toBe('final');
  });
});

describe('burnCard', () => {
  it('should mark cell as ruins', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const newState = burnCard(state, { x: targetCard.x, y: targetCard.y });

    const cell = newState.grid.cells.get(`${targetCard.x},${targetCard.y}`);
    expect(cell?.type).toBe('ruins');
  });

  it('should increment cardsBurnedThisGame', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const newState = burnCard(state, { x: targetCard.x, y: targetCard.y });

    expect(newState.cardsBurnedThisGame).toBe(1);
    expect(newState.players[0].cardsBurnedThisGame).toBe(1);
  });

  it('should advance turn', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const newState = burnCard(state, { x: targetCard.x, y: targetCard.y });

    expect(newState.currentPlayerIndex).toBe(1);
  });

  it('should add turn event', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const newState = burnCard(state, { x: targetCard.x, y: targetCard.y });

    expect(newState.turnHistory).toHaveLength(1);
    expect(newState.turnHistory[0].action).toBe('burn');
  });
});

describe('grid expansion after purchase', () => {
  it('should flip adjacent face-down cards', () => {
    const state = createTestGameState();
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const newState = handleDeclineInitialBid(bidState);

    // Count face-up cards (should be more than initial 4)
    let faceUpCount = 0;
    for (const cell of newState.grid.cells.values()) {
      if (cell.type === 'card' && cell.faceUp) {
        faceUpCount++;
      }
    }

    expect(faceUpCount).toBeGreaterThan(3); // Initial had 4, after purchase at least some remain
  });

  it('should deal new cards if draw pile has cards', () => {
    const state = createTestGameState();
    const initialDrawPileSize = state.grid.drawPile.length;
    const available = getAvailableCards(state.grid);
    const targetCard = available[0];

    const bidState = initiateBuy(
      state,
      { x: targetCard.x, y: targetCard.y },
      { mars: 1, venus: 0, mercury: 0, moon: 0 }
    );

    const newState = handleDeclineInitialBid(bidState);

    // Draw pile should be smaller (cards were dealt)
    expect(newState.grid.drawPile.length).toBeLessThan(initialDrawPileSize);
  });
});
