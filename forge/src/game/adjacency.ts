import type { Position } from './types';

export function getAdjacentPositions(x: number, y: number): Position[] {
  return [
    { x, y: y + 1 },  // Up
    { x, y: y - 1 },  // Down
    { x: x + 1, y },  // Right
    { x: x - 1, y },  // Left
  ];
}

export function positionToKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}

export function keyToPosition(key: string): Position {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}
