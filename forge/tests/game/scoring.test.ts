import { describe, it, expect } from 'vitest';
import { evaluateConditional, calculateVP, calculateWinner } from '../../src/game/scoring';
import type { Player, GameState, Card } from '../../src/game/types';
import { createInitialGrid } from '../../src/game/grid';
import { loadCards } from '../../src/game/cardLoader';

function createMockCard(overrides: Partial<Card>): Card {
  return {
    id: 'test-card',
    name: 'Test Card',
    faction: 'General',
    cost: 0,
    symbols: 'free',
    baseVP: 0,
    conditionalVP: '',
    game3Effect: '',
    parsedCost: { mars: 0, venus: 0, mercury: 0, moon: 0, any: 0 },
    ...overrides,
  };
}

function createMockPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player1',
    name: 'Test Player',
    symbols: { mars: 0, venus: 0, mercury: 0, moon: 0 },
    tableau: [],
    cardsWonByCounterBid: 0,
    cardsBurnedThisGame: 0,
    ...overrides,
  };
}

function createMockState(overrides: Partial<GameState> = {}): GameState {
  const cards = loadCards();
  const grid = createInitialGrid(cards);

  return {
    phase: 'playing',
    players: [
      createMockPlayer({ id: 'player1' }),
      createMockPlayer({ id: 'player2' }),
    ],
    currentPlayerIndex: 0,
    grid,
    cardsBurnedThisGame: 0,
    turnHistory: [],
    ...overrides,
  };
}

describe('evaluateConditional', () => {
  it('should return 0 for empty conditional', () => {
    const player = createMockPlayer();
    const state = createMockState();
    const card = createMockCard({});

    expect(evaluateConditional('', player, state, card)).toBe(0);
    expect(evaluateConditional('—', player, state, card)).toBe(0);
  });

  it('should evaluate "+2 if you have another card of this faction"', () => {
    const card1 = createMockCard({ faction: 'Crimson Covenant', conditionalVP: '+2 if you have another card of this faction' });
    const card2 = createMockCard({ faction: 'Crimson Covenant' });
    const player = createMockPlayer({ tableau: [card1, card2] });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(evaluateConditional(card1.conditionalVP, player, state, card1)).toBe(2);
  });

  it('should evaluate "+1 per Crimson Covenant card"', () => {
    const card = createMockCard({ conditionalVP: '+1 per Crimson Covenant card' });
    const crimsonCards = [
      createMockCard({ faction: 'Crimson Covenant' }),
      createMockCard({ faction: 'Crimson Covenant' }),
      createMockCard({ faction: 'Crimson Covenant' }),
    ];
    const player = createMockPlayer({ tableau: [...crimsonCards, card] });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(evaluateConditional(card.conditionalVP, player, state, card)).toBe(3);
  });

  it('should evaluate "+1 per faction represented"', () => {
    const card = createMockCard({ conditionalVP: '+1 per faction represented' });
    const tableau = [
      createMockCard({ faction: 'Crimson Covenant' }),
      createMockCard({ faction: 'Iron Tide' }),
      createMockCard({ faction: 'Void Legion' }),
      createMockCard({ faction: 'General' }), // General doesn't count
    ];
    const player = createMockPlayer({ tableau: [...tableau, card] });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(evaluateConditional(card.conditionalVP, player, state, card)).toBe(3);
  });

  it('should evaluate "+3 if you won a card by counter-bidding"', () => {
    const card = createMockCard({ conditionalVP: '+3 if you won a card by counter-bidding' });
    const player = createMockPlayer({ tableau: [card], cardsWonByCounterBid: 1 });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(evaluateConditional(card.conditionalVP, player, state, card)).toBe(3);
  });

  it('should evaluate "+2 per card you won by counter-bidding"', () => {
    const card = createMockCard({ conditionalVP: '+2 per card you won by counter-bidding' });
    const player = createMockPlayer({ tableau: [card], cardsWonByCounterBid: 3 });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(evaluateConditional(card.conditionalVP, player, state, card)).toBe(6);
  });

  it('should evaluate "+1 per ruins space in grid"', () => {
    const card = createMockCard({ conditionalVP: '+1 per ruins space in grid' });
    const player = createMockPlayer({ tableau: [card] });
    const state = createMockState({ players: [player, createMockPlayer()] });

    // Add some ruins to the grid
    state.grid.cells.set('5,5', { type: 'ruins', faceUp: true, x: 5, y: 5 });
    state.grid.cells.set('6,6', { type: 'ruins', faceUp: true, x: 6, y: 6 });

    expect(evaluateConditional(card.conditionalVP, player, state, card)).toBe(2);
  });

  it('should evaluate "+3 if you have ≤4 cards total"', () => {
    const card = createMockCard({ conditionalVP: '+3 if you have ≤4 cards total' });
    const player = createMockPlayer({ tableau: [card, createMockCard({}), createMockCard({})] });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(evaluateConditional(card.conditionalVP, player, state, card)).toBe(3);
  });

  it('should evaluate "+2 per card fewer than opponent (min 0)"', () => {
    const card = createMockCard({ conditionalVP: '+2 per card fewer than opponent (min 0)' });
    const player1 = createMockPlayer({ id: 'p1', tableau: [card, createMockCard({})] }); // 2 cards
    const player2 = createMockPlayer({ id: 'p2', tableau: [createMockCard({}), createMockCard({}), createMockCard({}), createMockCard({}), createMockCard({})] }); // 5 cards
    const state = createMockState({ players: [player1, player2] });

    // Player1 has 3 fewer cards than player2
    expect(evaluateConditional(card.conditionalVP, player1, state, card)).toBe(6);
  });

  it('should evaluate "+3 if this is your 5th+ card"', () => {
    const card = createMockCard({ conditionalVP: '+3 if this is your 5th+ card' });
    const player = createMockPlayer({
      tableau: [card, createMockCard({}), createMockCard({}), createMockCard({}), createMockCard({})],
    });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(evaluateConditional(card.conditionalVP, player, state, card)).toBe(3);
  });

  it('should evaluate "+1 per card you have (including this)"', () => {
    const card = createMockCard({ conditionalVP: '+1 per card you have (including this)' });
    const player = createMockPlayer({ tableau: [card, createMockCard({}), createMockCard({})] });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(evaluateConditional(card.conditionalVP, player, state, card)).toBe(3);
  });

  it('should evaluate "+4 if you have 1 of each symbol unspent"', () => {
    const card = createMockCard({ conditionalVP: '+4 if you have 1 of each symbol unspent' });
    const player = createMockPlayer({
      tableau: [card],
      symbols: { mars: 1, venus: 1, mercury: 1, moon: 1 },
    });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(evaluateConditional(card.conditionalVP, player, state, card)).toBe(4);
  });

  it('should evaluate "+8 if you have 2 of each symbol unspent"', () => {
    const card = createMockCard({ conditionalVP: '+8 if you have 2 of each symbol unspent' });
    const player = createMockPlayer({
      tableau: [card],
      symbols: { mars: 2, venus: 2, mercury: 2, moon: 2 },
    });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(evaluateConditional(card.conditionalVP, player, state, card)).toBe(8);
  });

  it('should evaluate "+4 if cards from 4+ factions"', () => {
    const card = createMockCard({ conditionalVP: '+4 if cards from 4+ factions' });
    const tableau = [
      createMockCard({ faction: 'Crimson Covenant' }),
      createMockCard({ faction: 'Iron Tide' }),
      createMockCard({ faction: 'Void Legion' }),
      createMockCard({ faction: 'Silk Network' }),
    ];
    const player = createMockPlayer({ tableau: [...tableau, card] });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(evaluateConditional(card.conditionalVP, player, state, card)).toBe(4);
  });
});

describe('calculateVP', () => {
  it('should sum base VP', () => {
    const player = createMockPlayer({
      tableau: [
        createMockCard({ baseVP: 2 }),
        createMockCard({ baseVP: 3 }),
        createMockCard({ baseVP: 1 }),
      ],
    });
    const state = createMockState({ players: [player, createMockPlayer()] });

    expect(calculateVP(player, state)).toBe(6);
  });

  it('should sum base VP and conditional VP', () => {
    const card1 = createMockCard({ baseVP: 2, conditionalVP: '+1 per faction represented', faction: 'Crimson Covenant' });
    const card2 = createMockCard({ baseVP: 3, faction: 'Iron Tide' });
    const player = createMockPlayer({ tableau: [card1, card2] });
    const state = createMockState({ players: [player, createMockPlayer()] });

    // Base: 2 + 3 = 5
    // Conditional: +1 per faction = +2 (Crimson, Iron)
    expect(calculateVP(player, state)).toBe(7);
  });
});

describe('calculateWinner', () => {
  it('should determine winner by VP', () => {
    const player1 = createMockPlayer({
      id: 'p1',
      tableau: [createMockCard({ baseVP: 5 })],
    });
    const player2 = createMockPlayer({
      id: 'p2',
      tableau: [createMockCard({ baseVP: 3 })],
    });
    const state = createMockState({ players: [player1, player2] });

    const result = calculateWinner(state);
    expect(result.winner).toBe(0);
    expect(result.scores).toEqual([5, 3]);
  });

  it('should use symbols as tiebreaker', () => {
    const player1 = createMockPlayer({
      id: 'p1',
      tableau: [createMockCard({ baseVP: 5 })],
      symbols: { mars: 3, venus: 2, mercury: 1, moon: 1 }, // 7 total
    });
    const player2 = createMockPlayer({
      id: 'p2',
      tableau: [createMockCard({ baseVP: 5 })],
      symbols: { mars: 2, venus: 2, mercury: 1, moon: 0 }, // 5 total
    });
    const state = createMockState({ players: [player1, player2] });

    const result = calculateWinner(state);
    expect(result.winner).toBe(0);
    expect(result.scores).toEqual([5, 5]);
  });

  it('should use card count as second tiebreaker', () => {
    const player1 = createMockPlayer({
      id: 'p1',
      tableau: [createMockCard({ baseVP: 2 }), createMockCard({ baseVP: 3 })], // 2 cards
      symbols: { mars: 1, venus: 1, mercury: 1, moon: 1 }, // 4 symbols
    });
    const player2 = createMockPlayer({
      id: 'p2',
      tableau: [createMockCard({ baseVP: 5 })], // 1 card
      symbols: { mars: 1, venus: 1, mercury: 1, moon: 1 }, // 4 symbols
    });
    const state = createMockState({ players: [player1, player2] });

    const result = calculateWinner(state);
    expect(result.winner).toBe(0);
  });

  it('should declare tie when all tiebreakers equal', () => {
    const player1 = createMockPlayer({
      id: 'p1',
      tableau: [createMockCard({ baseVP: 5 })],
      symbols: { mars: 1, venus: 1, mercury: 1, moon: 1 },
    });
    const player2 = createMockPlayer({
      id: 'p2',
      tableau: [createMockCard({ baseVP: 5 })],
      symbols: { mars: 1, venus: 1, mercury: 1, moon: 1 },
    });
    const state = createMockState({ players: [player1, player2] });

    const result = calculateWinner(state);
    expect(result.winner).toBe('tie');
  });
});
