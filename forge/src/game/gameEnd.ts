import type { GameState } from './types';
import { getAvailableCards } from './grid';
import { canPayCost } from './payment';

export function checkGameEnd(state: GameState): boolean {
  const available = getAvailableCards(state.grid);

  // No available cards = game over
  if (available.length === 0) {
    return true;
  }

  // Check if either player can afford any available card
  const canEitherPlayerBuy = state.players.some(player =>
    available.some(({ card }) => canPayCost(player.symbols, card.parsedCost))
  );

  // Game ends when neither player can afford any available card
  return !canEitherPlayerBuy;
}
