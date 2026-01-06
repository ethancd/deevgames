import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../../src/components/Card';
import type { Card as CardType } from '../../src/game/types';

describe('Card component sizing', () => {
  // Test cards with varying content lengths
  const shortCard: CardType = {
    id: 'short',
    name: 'Short',
    faction: 'General',
    symbols: '♂',
    baseVP: 1,
    game3Effect: 'Quick effect',
  };

  const longCard: CardType = {
    id: 'long',
    name: 'Very Long Card Name That Might Break Layout',
    faction: 'Crimson Covenant',
    symbols: '♂♀☿☽',
    baseVP: 5,
    conditionalVP: '+2 VP per faction represented in your tableau. This is a very long conditional VP text that should test overflow behavior and ensure the card maintains its dimensions.',
    game3Effect: 'This is an extremely long game 3 effect description that contains multiple sentences and should test whether the card can handle overflow content properly without breaking the fixed dimensions we have set.',
  };

  const emptyCard: CardType = {
    id: 'empty',
    name: 'E',
    faction: 'General',
    symbols: '',
    baseVP: 0,
  };

  describe('Hypothesis 1: Fixed dimensions are maintained regardless of content', () => {
    it('should render face-up cards with consistent dimensions', () => {
      const { container: container1 } = render(<Card card={shortCard} faceUp={true} />);
      const { container: container2 } = render(<Card card={longCard} faceUp={true} />);
      const { container: container3 } = render(<Card card={emptyCard} faceUp={true} />);

      const card1 = container1.querySelector('div');
      const card2 = container2.querySelector('div');
      const card3 = container3.querySelector('div');

      // All cards should have the same width and height classes (6rem squares)
      expect(card1?.className).toContain('w-24');
      expect(card1?.className).toContain('h-24');
      expect(card1?.className).toContain('min-w-[6rem]');
      expect(card1?.className).toContain('min-h-[6rem]');

      expect(card2?.className).toContain('w-24');
      expect(card2?.className).toContain('h-24');
      expect(card2?.className).toContain('min-w-[6rem]');
      expect(card2?.className).toContain('min-h-[6rem]');

      expect(card3?.className).toContain('w-24');
      expect(card3?.className).toContain('h-24');
      expect(card3?.className).toContain('min-w-[6rem]');
      expect(card3?.className).toContain('min-h-[6rem]');
    });

    it('should render face-down cards with consistent dimensions', () => {
      const { container: container1 } = render(<Card card={shortCard} faceUp={false} />);
      const { container: container2 } = render(<Card card={longCard} faceUp={false} />);

      const card1 = container1.querySelector('div');
      const card2 = container2.querySelector('div');

      expect(card1?.className).toContain('w-24');
      expect(card1?.className).toContain('h-24');
      expect(card2?.className).toContain('w-24');
      expect(card2?.className).toContain('h-24');
    });
  });

  describe('Hypothesis 2: Overflow is properly constrained', () => {
    it('should have overflow-hidden on the main card container', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);
      const card = container.querySelector('div');

      expect(card?.className).toContain('overflow-hidden');
    });

    it('should constrain text overflow with overflow-hidden and line-clamp', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);
      const html = container.innerHTML;

      // Card name should use line-clamp for truncation
      expect(html).toContain('line-clamp-2');
      // Content sections should have overflow-hidden
      expect(html).toContain('overflow-hidden');
    });
  });

  describe('Hypothesis 3: Flexbox layout does not cause expansion', () => {
    it('should use flex-col layout', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);
      const card = container.querySelector('div');

      expect(card?.className).toContain('flex');
      expect(card?.className).toContain('flex-col');
    });

    it('should have proper flex properties on spacer elements', () => {
      const { container } = render(<Card card={emptyCard} faceUp={true} />);

      // Should have a flex-1 spacer for cards without conditional VP
      const html = container.innerHTML;
      expect(html).toContain('flex-1');
    });
  });

  describe('Game 3 effect behavior', () => {
    it('should not render game3Effect text in the card body', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);

      // The game3Effect should only be in the title attribute, not visible text
      const cardText = container.textContent;
      expect(cardText).not.toContain('extremely long game 3 effect');
    });

    it('should have game3Effect in title attribute for tooltip', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);
      const card = container.querySelector('div');

      expect(card?.getAttribute('title')).toBe(longCard.game3Effect);
    });

    it('should not have title attribute if no game3Effect', () => {
      const { container } = render(<Card card={shortCard} faceUp={true} />);
      const card = container.querySelector('div');

      // Should have title for shortCard which has a game3Effect
      expect(card?.getAttribute('title')).toBe('Quick effect');
    });
  });

  describe('Face-down card behavior', () => {
    it('should show faction emoji only (not faction name)', () => {
      const { container } = render(<Card card={longCard} faceUp={false} />);

      const text = container.textContent;
      // Should show emoji not text
      expect(text).toContain('🩸'); // Crimson Covenant emoji
      expect(text).not.toContain('Crimson Covenant'); // No faction name text
    });

    it('should use dark background for face-down cards', () => {
      const { container } = render(<Card card={longCard} faceUp={false} />);
      const card = container.querySelector('div');

      // Should use faceDownBg gradient
      expect(card?.className).toContain('from-red-950');
      expect(card?.className).toContain('to-red-900');
    });
  });

  describe('Face-up card behavior', () => {
    it('should use faint background for face-up cards', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);
      const card = container.querySelector('div');

      // Should use faceUpBg with low opacity
      expect(card?.className).toContain('bg-red-950/20');
    });

    it('should render symbol cost in larger, bolder font', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);

      // Should have text-xs and font-black for cost (smaller for square cards)
      const html = container.innerHTML;
      expect(html).toContain('text-xs');
      expect(html).toContain('font-black');
    });

    it('should render VP in a text box at the bottom with "N ★" format', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);

      // VP should be in a box with dark background
      const html = container.innerHTML;
      expect(html).toContain('bg-stone-900/80');
      expect(html).toContain('5 ★'); // New format: "N ★"
      expect(html).not.toContain('VP'); // No "VP" text
    });
  });

  describe('Click behavior', () => {
    it('should call onClick when provided and card is clickable', () => {
      let clicked = false;
      const onClick = () => {
        clicked = true;
      };

      const { container } = render(<Card card={shortCard} faceUp={true} onClick={onClick} />);
      const card = container.querySelector('div') as HTMLElement;

      card.click();
      expect(clicked).toBe(true);
    });

    it('should have cursor-pointer class when onClick is provided', () => {
      const onClick = () => {};
      const { container } = render(<Card card={shortCard} faceUp={true} onClick={onClick} />);
      const card = container.querySelector('div');

      expect(card?.className).toContain('cursor-pointer');
    });

    it('should not have cursor-pointer class when onClick is not provided', () => {
      const { container } = render(<Card card={shortCard} faceUp={true} />);
      const card = container.querySelector('div');

      expect(card?.className).not.toContain('cursor-pointer');
    });
  });
});
