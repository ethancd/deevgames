import { describe, it, expect } from 'vitest';
import { getAdjacentPositions, positionToKey, keyToPosition } from '../../src/game/adjacency';

describe('getAdjacentPositions', () => {
  it('should return 4 orthogonal neighbors for origin', () => {
    const positions = getAdjacentPositions(0, 0);
    expect(positions).toHaveLength(4);
    expect(positions).toContainEqual({ x: 0, y: 1 });
    expect(positions).toContainEqual({ x: 0, y: -1 });
    expect(positions).toContainEqual({ x: 1, y: 0 });
    expect(positions).toContainEqual({ x: -1, y: 0 });
  });

  it('should return 4 orthogonal neighbors for positive coordinates', () => {
    const positions = getAdjacentPositions(5, 3);
    expect(positions).toHaveLength(4);
    expect(positions).toContainEqual({ x: 5, y: 4 });
    expect(positions).toContainEqual({ x: 5, y: 2 });
    expect(positions).toContainEqual({ x: 6, y: 3 });
    expect(positions).toContainEqual({ x: 4, y: 3 });
  });

  it('should return 4 orthogonal neighbors for negative coordinates', () => {
    const positions = getAdjacentPositions(-2, -3);
    expect(positions).toHaveLength(4);
    expect(positions).toContainEqual({ x: -2, y: -2 });
    expect(positions).toContainEqual({ x: -2, y: -4 });
    expect(positions).toContainEqual({ x: -1, y: -3 });
    expect(positions).toContainEqual({ x: -3, y: -3 });
  });
});

describe('positionToKey and keyToPosition', () => {
  it('should convert position to key', () => {
    expect(positionToKey({ x: 0, y: 0 })).toBe('0,0');
    expect(positionToKey({ x: 5, y: 3 })).toBe('5,3');
    expect(positionToKey({ x: -2, y: -3 })).toBe('-2,-3');
  });

  it('should convert key to position', () => {
    expect(keyToPosition('0,0')).toEqual({ x: 0, y: 0 });
    expect(keyToPosition('5,3')).toEqual({ x: 5, y: 3 });
    expect(keyToPosition('-2,-3')).toEqual({ x: -2, y: -3 });
  });

  it('should be reversible', () => {
    const pos = { x: 7, y: -4 };
    const key = positionToKey(pos);
    expect(keyToPosition(key)).toEqual(pos);
  });
});
