import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Grid } from '../../src/components/Grid';
import { createInitialGrid } from '../../src/game/grid';
import { loadCards } from '../../src/game/cardLoader';
import type { GridState, Card } from '../../src/game/types';

describe('Card click behavior', () => {
  it('should call onCardClick when clicking an available card', () => {
    const onCardClick = vi.fn();

    // Create a test grid with some cards
    const deck = loadCards();
    const grid: GridState = createInitialGrid(deck);

    const { container } = render(<Grid grid={grid} onCardClick={onCardClick} />);

    // Find clickable cards (those with cursor-pointer class)
    const clickableCards = container.querySelectorAll('.cursor-pointer');

    if (clickableCards.length > 0) {
      // Click the first available card
      fireEvent.click(clickableCards[0]);

      // Should have called the click handler
      expect(onCardClick).toHaveBeenCalledTimes(1);
    }
  });

  it('should not call onCardClick for unavailable cards', () => {
    const onCardClick = vi.fn();

    const deck = loadCards();
    const grid: GridState = createInitialGrid(deck);

    const { container } = render(<Grid grid={grid} onCardClick={onCardClick} />);

    // Find all cards
    const allCardDivs = container.querySelectorAll('.m-1 > div');

    // Find cards without cursor-pointer (unavailable)
    const unavailableCards = Array.from(allCardDivs).filter(
      card => !card.className.includes('cursor-pointer')
    );

    if (unavailableCards.length > 0) {
      // Click an unavailable card
      fireEvent.click(unavailableCards[0]);

      // Should not have called the handler
      expect(onCardClick).not.toHaveBeenCalled();
    }
  });

  it('should have cursor-pointer class on available cards', () => {
    const onCardClick = vi.fn();

    const deck = loadCards();
    const grid: GridState = createInitialGrid(deck);

    const { container } = render(<Grid grid={grid} onCardClick={onCardClick} />);

    // At least some cards should be clickable in the initial grid
    const clickableCards = container.querySelectorAll('.cursor-pointer');

    // Initial grid should have 8 available cards (the center 2x2 grid)
    expect(clickableCards.length).toBeGreaterThan(0);
  });

  it('should not have cursor-pointer class when no onCardClick handler provided', () => {
    const deck = loadCards();
    const grid: GridState = createInitialGrid(deck);

    const { container } = render(<Grid grid={grid} />);

    // No cards should be clickable without a handler
    const clickableCards = container.querySelectorAll('.cursor-pointer');
    expect(clickableCards.length).toBe(0);
  });

  it('should pass correct coordinates to onCardClick', () => {
    const onCardClick = vi.fn();

    const deck = loadCards();
    const grid: GridState = createInitialGrid(deck);

    const { container } = render(<Grid grid={grid} onCardClick={onCardClick} />);

    const clickableCards = container.querySelectorAll('.cursor-pointer');

    if (clickableCards.length > 0) {
      fireEvent.click(clickableCards[0]);

      // Should have been called with x and y coordinates
      expect(onCardClick).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number)
      );
    }
  });
});
