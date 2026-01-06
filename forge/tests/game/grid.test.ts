import { describe, it, expect } from 'vitest';
import { createInitialGrid, getCellAt, getAvailableCards } from '../../src/game/grid';
import { loadCards } from '../../src/game/cardLoader';

describe('createInitialGrid', () => {
  it('should create grid with center empty', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    const center = getCellAt(grid, 0, 0);
    expect(center).toBeDefined();
    expect(center?.type).toBe('empty');
  });

  it('should place 4 face-up cards adjacent to center', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    // Check all 4 orthogonal positions
    const positions = [
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
    ];

    positions.forEach(pos => {
      const cell = getCellAt(grid, pos.x, pos.y);
      expect(cell?.type).toBe('card');
      expect(cell?.faceUp).toBe(true);
      expect(cell?.card).toBeDefined();
    });
  });

  it('should place 8 face-down cards around the face-up cards', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    let faceDownCount = 0;
    for (const cell of grid.cells.values()) {
      if (cell.type === 'card' && !cell.faceUp) {
        faceDownCount++;
      }
    }

    expect(faceDownCount).toBe(8);
  });

  it('should put remaining cards in draw pile', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    // 4 face-up + 8 face-down + draw pile should equal total cards
    const totalCards = 82;
    expect(grid.drawPile.length).toBe(totalCards - 12);
  });

  it('should create exactly 13 cells (1 empty + 4 face-up + 8 face-down)', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    expect(grid.cells.size).toBe(13);
  });
});

describe('getCellAt', () => {
  it('should return cell at position', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    const center = getCellAt(grid, 0, 0);
    expect(center).toBeDefined();
    expect(center?.type).toBe('empty');
  });

  it('should return null for non-existent position', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    const cell = getCellAt(grid, 100, 100);
    expect(cell).toBeNull();
  });
});

describe('getAvailableCards', () => {
  it('should return 4 available cards initially (all adjacent to empty center)', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    const available = getAvailableCards(grid);
    expect(available).toHaveLength(4);
  });

  it('should only include face-up cards', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    const available = getAvailableCards(grid);
    available.forEach(avail => {
      const cell = getCellAt(grid, avail.x, avail.y);
      expect(cell?.faceUp).toBe(true);
    });
  });

  it('should only include cards adjacent to empty spaces', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    const available = getAvailableCards(grid);

    // All 4 initial face-up cards are adjacent to center (0,0) which is empty
    expect(available).toHaveLength(4);
    const positions = available.map(a => `${a.x},${a.y}`);
    expect(positions).toContain('0,1');
    expect(positions).toContain('0,-1');
    expect(positions).toContain('1,0');
    expect(positions).toContain('-1,0');
  });

  it('should not include face-down cards', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    const available = getAvailableCards(grid);

    // None of the face-down cards should be available
    available.forEach(avail => {
      const cell = getCellAt(grid, avail.x, avail.y);
      expect(cell?.faceUp).toBe(true);
    });
  });

  it('should not include cards when ruins block adjacency', () => {
    const cards = loadCards();
    const grid = createInitialGrid(cards);

    // Manually set center to ruins instead of empty
    grid.cells.set('0,0', {
      type: 'ruins',
      faceUp: true,
      x: 0,
      y: 0,
    });

    const available = getAvailableCards(grid);

    // No cards should be available now (ruins don't make adjacent cards available)
    expect(available).toHaveLength(0);
  });
});
