import type { Card, GridState, GridCell, Position } from './types';
import { getAdjacentPositions, positionToKey } from './adjacency';

export function createInitialGrid(cards: Card[]): GridState {
  const cells = new Map<string, GridCell>();

  // Center (0,0) is empty
  cells.set('0,0', {
    type: 'empty',
    faceUp: true,
    x: 0,
    y: 0,
  });

  // Deal 4 face-up cards orthogonally adjacent to center
  const initialPositions: Position[] = [
    { x: 0, y: 1 },   // Up
    { x: 0, y: -1 },  // Down
    { x: 1, y: 0 },   // Right
    { x: -1, y: 0 },  // Left
  ];

  const faceUpCards = cards.slice(0, 4);
  initialPositions.forEach((pos, i) => {
    cells.set(positionToKey(pos), {
      type: 'card',
      card: faceUpCards[i],
      faceUp: true,
      x: pos.x,
      y: pos.y,
    });
  });

  // Deal 8 face-down cards adjacent to the face-up cards
  const faceDownPositions: Position[] = [];
  initialPositions.forEach(pos => {
    getAdjacentPositions(pos.x, pos.y).forEach(adjPos => {
      const key = positionToKey(adjPos);
      // Only add if not already occupied
      if (!cells.has(key)) {
        faceDownPositions.push(adjPos);
      }
    });
  });

  // Remove duplicates by using unique keys
  const uniqueFaceDownKeys = new Set(faceDownPositions.map(positionToKey));
  const uniqueFaceDownPositions = Array.from(uniqueFaceDownKeys).map(keyToPosition);

  const faceDownCards = cards.slice(4, 4 + uniqueFaceDownPositions.length);
  uniqueFaceDownPositions.forEach((pos, i) => {
    if (i < faceDownCards.length) {
      cells.set(positionToKey(pos), {
        type: 'card',
        card: faceDownCards[i],
        faceUp: false,
        x: pos.x,
        y: pos.y,
      });
    }
  });

  // Remaining cards go to draw pile
  const drawPile = cards.slice(4 + uniqueFaceDownPositions.length);

  return {
    cells,
    drawPile,
    bounds: {
      minX: -2,
      maxX: 2,
      minY: -2,
      maxY: 2,
    },
  };
}

function keyToPosition(key: string): Position {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function getCellAt(grid: GridState, x: number, y: number): GridCell | null {
  return grid.cells.get(positionToKey({ x, y })) || null;
}

export interface AvailableCard {
  x: number;
  y: number;
  card: Card;
}

export function getAvailableCards(grid: GridState): AvailableCard[] {
  const available: AvailableCard[] = [];

  for (const cell of grid.cells.values()) {
    // Only face-up cards can be available
    if (cell.type !== 'card' || !cell.faceUp || !cell.card) {
      continue;
    }

    // Check if adjacent to an empty space
    const adjacents = getAdjacentPositions(cell.x, cell.y);
    const hasAdjacentEmpty = adjacents.some(pos => {
      const adjCell = getCellAt(grid, pos.x, pos.y);
      return adjCell?.type === 'empty';
    });

    if (hasAdjacentEmpty) {
      available.push({
        x: cell.x,
        y: cell.y,
        card: cell.card,
      });
    }
  }

  return available;
}

export function updateGridBounds(grid: GridState): GridState {
  let minX = 0, maxX = 0, minY = 0, maxY = 0;

  for (const cell of grid.cells.values()) {
    minX = Math.min(minX, cell.x);
    maxX = Math.max(maxX, cell.x);
    minY = Math.min(minY, cell.y);
    maxY = Math.max(maxY, cell.y);
  }

  return {
    ...grid,
    bounds: {
      minX: minX - 1,
      maxX: maxX + 1,
      minY: minY - 1,
      maxY: maxY + 1,
    },
  };
}
