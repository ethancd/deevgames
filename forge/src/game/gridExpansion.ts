import type { GridState, Position, Card } from './types';
import { getAdjacentPositions, positionToKey } from './adjacency';
import { updateGridBounds } from './grid';

export function flipAdjacentCards(grid: GridState, pos: Position): GridState {
  const newCells = new Map(grid.cells);
  const adjacents = getAdjacentPositions(pos.x, pos.y);

  for (const adjPos of adjacents) {
    const key = positionToKey(adjPos);
    const cell = newCells.get(key);

    // Flip face-down cards to face-up
    if (cell && cell.type === 'card' && !cell.faceUp) {
      newCells.set(key, { ...cell, faceUp: true });
    }
  }

  return {
    ...grid,
    cells: newCells,
  };
}

export function dealNewCards(
  grid: GridState,
  positions: Position[]
): GridState {
  if (grid.drawPile.length === 0) {
    return grid;
  }

  const newCells = new Map(grid.cells);
  const newDrawPile = [...grid.drawPile];
  let dealtCount = 0;

  for (const pos of positions) {
    const key = positionToKey(pos);

    // Only deal to empty positions (not ruins, not occupied)
    if (!newCells.has(key) && dealtCount < newDrawPile.length) {
      const card = newDrawPile[dealtCount];
      newCells.set(key, {
        type: 'card',
        card,
        faceUp: false,
        x: pos.x,
        y: pos.y,
      });
      dealtCount++;
    }
  }

  return updateGridBounds({
    ...grid,
    cells: newCells,
    drawPile: newDrawPile.slice(dealtCount),
  });
}

export function getNewCardPositions(
  grid: GridState,
  flippedPositions: Position[]
): Position[] {
  const newPositions: Position[] = [];
  const positionKeys = new Set<string>();

  // For each flipped card, get its adjacent positions
  for (const flippedPos of flippedPositions) {
    const adjacents = getAdjacentPositions(flippedPos.x, flippedPos.y);

    for (const adjPos of adjacents) {
      const key = positionToKey(adjPos);
      const cell = grid.cells.get(key);

      // Only add if position is empty (not occupied, not ruins)
      if (!cell && !positionKeys.has(key)) {
        newPositions.push(adjPos);
        positionKeys.add(key);
      }
    }
  }

  return newPositions;
}
