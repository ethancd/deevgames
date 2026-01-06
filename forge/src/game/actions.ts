import type { GameState, Position, SymbolPool, PlayerIndex } from './types';
import { positionToKey, getAdjacentPositions } from './adjacency';
import { deductSymbols, canPayCost } from './payment';
import { flipAdjacentCards, dealNewCards, getNewCardPositions } from './gridExpansion';
import { updateGridBounds } from './grid';

export function initiateBuy(
  state: GameState,
  pos: Position,
  payment: SymbolPool
): GameState {
  const key = positionToKey(pos);
  const cell = state.grid.cells.get(key);

  if (!cell || cell.type !== 'card' || !cell.card) {
    throw new Error('Invalid card position');
  }

  const card = cell.card;
  const player = state.players[state.currentPlayerIndex];

  // Validate payment
  if (!canPayCost(player.symbols, card.parsedCost)) {
    throw new Error('Cannot afford card');
  }

  return {
    ...state,
    phase: 'bidding',
    activeBid: {
      cardPos: pos,
      originalBidder: state.currentPlayerIndex,
      currentBid: payment,
      bidStage: 'initial',
    },
  };
}

export function handleCounterBid(state: GameState, payment: SymbolPool): GameState {
  if (!state.activeBid || state.activeBid.bidStage !== 'initial') {
    throw new Error('Invalid bid state');
  }

  const opponentIndex = (1 - state.activeBid.originalBidder) as PlayerIndex;

  return {
    ...state,
    activeBid: {
      ...state.activeBid,
      bidStage: 'countered',
      currentBid: payment,
      counterBidder: opponentIndex,
    },
  };
}

export function handleFinalBid(state: GameState, payment: SymbolPool): GameState {
  if (!state.activeBid || state.activeBid.bidStage !== 'countered') {
    throw new Error('Invalid bid state');
  }

  return {
    ...state,
    activeBid: {
      ...state.activeBid,
      bidStage: 'final',
      currentBid: payment,
    },
  };
}

export function handleDeclineCounter(state: GameState): GameState {
  if (!state.activeBid) {
    throw new Error('No active bid');
  }

  // Counter-bidder wins the card
  const winner = state.activeBid.counterBidder!;
  return resolveCardAcquisition(state, winner, state.activeBid.cardPos, true);
}

export function handleDeclineInitialBid(state: GameState): GameState {
  if (!state.activeBid || state.activeBid.bidStage !== 'initial') {
    throw new Error('Invalid bid state');
  }

  // Original bidder wins the card
  return resolveCardAcquisition(
    state,
    state.activeBid.originalBidder,
    state.activeBid.cardPos,
    false
  );
}

export function resolveCardAcquisition(
  state: GameState,
  winnerIndex: PlayerIndex,
  pos: Position,
  wonByCounter: boolean
): GameState {
  const key = positionToKey(pos);
  const cell = state.grid.cells.get(key);

  if (!cell || cell.type !== 'card' || !cell.card) {
    throw new Error('Invalid card position');
  }

  const card = cell.card;
  const payment = state.activeBid?.currentBid || { mars: 0, venus: 0, mercury: 0, moon: 0 };

  // 1. Add card to winner's tableau
  const newPlayers: [typeof state.players[0], typeof state.players[1]] = [
    { ...state.players[0] },
    { ...state.players[1] },
  ];

  newPlayers[winnerIndex] = {
    ...newPlayers[winnerIndex],
    tableau: [...newPlayers[winnerIndex].tableau, card],
    symbols: deductSymbols(newPlayers[winnerIndex].symbols, payment),
    cardsWonByCounterBid: newPlayers[winnerIndex].cardsWonByCounterBid + (wonByCounter ? 1 : 0),
  };

  // 2. Mark grid cell as empty
  const newCells = new Map(state.grid.cells);
  newCells.set(key, {
    type: 'empty',
    faceUp: true,
    x: pos.x,
    y: pos.y,
  });

  let newGrid = {
    ...state.grid,
    cells: newCells,
  };

  // 3. Flip adjacent face-down cards
  const adjacents = getAdjacentPositions(pos.x, pos.y);
  const flippedPositions: Position[] = [];

  for (const adjPos of adjacents) {
    const adjKey = positionToKey(adjPos);
    const adjCell = newGrid.cells.get(adjKey);
    if (adjCell && adjCell.type === 'card' && !adjCell.faceUp) {
      flippedPositions.push(adjPos);
    }
  }

  newGrid = flipAdjacentCards(newGrid, pos);

  // 4. Deal new cards adjacent to flipped cards
  const newCardPositions = getNewCardPositions(newGrid, flippedPositions);
  newGrid = dealNewCards(newGrid, newCardPositions);

  // 5. Add turn event
  const newTurnHistory = [
    ...state.turnHistory,
    {
      player: winnerIndex,
      action: 'buy' as const,
      cardId: card.id,
      symbolsSpent: payment,
      wonByCounter,
    },
  ];

  // 6. Determine next state
  let newState: GameState = {
    ...state,
    players: newPlayers,
    grid: newGrid,
    turnHistory: newTurnHistory,
    activeBid: undefined,
    phase: 'playing',
  };

  // If won by counter-bid, original player's turn continues
  // Otherwise, advance to next player
  if (!wonByCounter) {
    newState = {
      ...newState,
      currentPlayerIndex: (1 - state.currentPlayerIndex) as PlayerIndex,
    };
  }

  return newState;
}

export function burnCard(state: GameState, pos: Position): GameState {
  const key = positionToKey(pos);
  const cell = state.grid.cells.get(key);

  if (!cell || cell.type !== 'card' || !cell.card) {
    throw new Error('Invalid card position');
  }

  const card = cell.card;

  // 1. Mark cell as ruins
  const newCells = new Map(state.grid.cells);
  newCells.set(key, {
    type: 'ruins',
    faceUp: true,
    x: pos.x,
    y: pos.y,
  });

  const newGrid = updateGridBounds({
    ...state.grid,
    cells: newCells,
  });

  // 2. Update player's burned count
  const newPlayers: [typeof state.players[0], typeof state.players[1]] = [
    { ...state.players[0] },
    { ...state.players[1] },
  ];

  newPlayers[state.currentPlayerIndex] = {
    ...newPlayers[state.currentPlayerIndex],
    cardsBurnedThisGame: newPlayers[state.currentPlayerIndex].cardsBurnedThisGame + 1,
  };

  // 3. Add turn event
  const newTurnHistory = [
    ...state.turnHistory,
    {
      player: state.currentPlayerIndex,
      action: 'burn' as const,
      cardId: card.id,
    },
  ];

  // 4. Advance turn
  return {
    ...state,
    players: newPlayers,
    grid: newGrid,
    cardsBurnedThisGame: state.cardsBurnedThisGame + 1,
    turnHistory: newTurnHistory,
    currentPlayerIndex: (1 - state.currentPlayerIndex) as PlayerIndex,
  };
}
