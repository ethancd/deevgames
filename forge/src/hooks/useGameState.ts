import { useState, useCallback } from 'react';
import type { GameState, Position, SymbolPool } from '../game/types';
import { loadCards, shuffleCards } from '../game/cardLoader';
import { createInitialGrid } from '../game/grid';
import {
  initiateBuy,
  handleCounterBid,
  handleFinalBid,
  handleDeclineCounter,
  handleDeclineInitialBid,
  burnCard,
} from '../game/actions';
import { checkGameEnd } from '../game/gameEnd';
import { calculateWinner } from '../game/scoring';

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>(() => createNewGame());

  const buyCard = useCallback((pos: Position, payment: SymbolPool) => {
    setGameState(state => {
      const newState = initiateBuy(state, pos, payment);
      return newState;
    });
  }, []);

  const counterBid = useCallback((payment: SymbolPool) => {
    setGameState(state => {
      const newState = handleCounterBid(state, payment);
      return newState;
    });
  }, []);

  const finalBid = useCallback((payment: SymbolPool) => {
    setGameState(state => {
      const newState = handleFinalBid(state, payment);
      // After final bid, resolve the purchase
      return handleDeclineInitialBid(newState);
    });
  }, []);

  const declineCounter = useCallback(() => {
    setGameState(state => {
      let newState = handleDeclineCounter(state);

      // Check for game end
      if (checkGameEnd(newState)) {
        const { winner } = calculateWinner(newState);
        newState = {
          ...newState,
          phase: 'game_over',
          winner,
        };
      }

      return newState;
    });
  }, []);

  const declineInitialBid = useCallback(() => {
    setGameState(state => {
      let newState = handleDeclineInitialBid(state);

      // Check for game end
      if (checkGameEnd(newState)) {
        const { winner } = calculateWinner(newState);
        newState = {
          ...newState,
          phase: 'game_over',
          winner,
        };
      }

      return newState;
    });
  }, []);

  const burn = useCallback((pos: Position) => {
    setGameState(state => {
      let newState = burnCard(state, pos);

      // Check for game end
      if (checkGameEnd(newState)) {
        const { winner } = calculateWinner(newState);
        newState = {
          ...newState,
          phase: 'game_over',
          winner,
        };
      }

      return newState;
    });
  }, []);

  const newGame = useCallback(() => {
    setGameState(createNewGame());
  }, []);

  return {
    gameState,
    actions: {
      buyCard,
      counterBid,
      finalBid,
      declineCounter,
      declineInitialBid,
      burn,
      newGame,
    },
  };
}

function createNewGame(): GameState {
  const allCards = loadCards();
  const shuffled = shuffleCards(allCards);
  const grid = createInitialGrid(shuffled);

  return {
    phase: 'playing',
    players: [
      {
        id: 'player1',
        name: 'Player 1',
        symbols: { mars: 4, venus: 4, mercury: 4, moon: 4 },
        tableau: [],
        cardsWonByCounterBid: 0,
        cardsBurnedThisGame: 0,
      },
      {
        id: 'player2',
        name: 'Player 2',
        symbols: { mars: 4, venus: 4, mercury: 4, moon: 4 },
        tableau: [],
        cardsWonByCounterBid: 0,
        cardsBurnedThisGame: 0,
      },
    ],
    currentPlayerIndex: Math.random() < 0.5 ? 0 : 1,
    grid,
    cardsBurnedThisGame: 0,
    turnHistory: [],
  };
}
