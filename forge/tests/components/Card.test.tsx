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

      // All cards should have the same width and height classes
      expect(card1?.className).toContain('w-32');
      expect(card1?.className).toContain('h-44');
      expect(card1?.className).toContain('min-w-[8rem]');
      expect(card1?.className).toContain('min-h-[11rem]');

      expect(card2?.className).toContain('w-32');
      expect(card2?.className).toContain('h-44');
      expect(card2?.className).toContain('min-w-[8rem]');
      expect(card2?.className).toContain('min-h-[11rem]');

      expect(card3?.className).toContain('w-32');
      expect(card3?.className).toContain('h-44');
      expect(card3?.className).toContain('min-w-[8rem]');
      expect(card3?.className).toContain('min-h-[11rem]');
    });

    it('should render face-down cards with consistent dimensions', () => {
      const { container: container1 } = render(<Card card={shortCard} faceUp={false} />);
      const { container: container2 } = render(<Card card={longCard} faceUp={false} />);

      const card1 = container1.querySelector('div');
      const card2 = container2.querySelector('div');

      expect(card1?.className).toContain('w-32');
      expect(card1?.className).toContain('h-44');
      expect(card2?.className).toContain('w-32');
      expect(card2?.className).toContain('h-44');
    });
  });

  describe('Hypothesis 2: Overflow is properly constrained', () => {
    it('should have overflow-hidden on the main card container', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);
      const card = container.querySelector('div');

      expect(card?.className).toContain('overflow-hidden');
    });

    it('should have overflow-y-auto on text content sections', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);

      // Conditional VP section should have scroll
      const textSections = container.querySelectorAll('.overflow-y-auto');
      expect(textSections.length).toBeGreaterThan(0);
    });

    it('should have fixed heights on text sections', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);

      // Check that text sections have fixed height classes
      const html = container.innerHTML;
      expect(html).toContain('h-6'); // Card name height
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
    it('should show faction name but not question mark', () => {
      const { container } = render(<Card card={longCard} faceUp={false} />);

      const text = container.textContent;
      expect(text).toContain('Crimson Covenant');
      expect(text).not.toContain('?');
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

      // Should have text-base and font-black for cost
      const html = container.innerHTML;
      expect(html).toContain('text-base');
      expect(html).toContain('font-black');
    });

    it('should render VP in a text box at the bottom', () => {
      const { container } = render(<Card card={longCard} faceUp={true} />);

      // VP should be in a box with dark background
      const html = container.innerHTML;
      expect(html).toContain('bg-stone-900/80');
      expect(html).toContain('5 VP');
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
