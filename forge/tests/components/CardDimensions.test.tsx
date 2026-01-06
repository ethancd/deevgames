import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Card } from '../../src/components/Card';
import type { Card as CardType } from '../../src/game/types';

describe('Card Dimensional Testing', () => {
  const testCard: CardType = {
    name: 'Test Card',
    faction: 'Iron Tide',
    cost: 2,
    symbols: '♂☿',
    baseVP: 2,
    conditionalVP: '',
    game3Effect: 'Test effect',
    parsedCost: { mars: 1, mercury: 1, venus: 0, moon: 0, any: 0 }
  };

  const longTextCard: CardType = {
    ...testCard,
    name: 'Very Long Card Name That Should Be Truncated',
    conditionalVP: '+1 per Iron Tide card'
  };

  const emptyCard: CardType = {
    ...testCard,
    name: 'Empty',
    conditionalVP: '',
    baseVP: 0
  };

  it('should have square dimension classes (width === height)', () => {
    const { container } = render(<Card card={testCard} faceUp={true} />);
    const cardElement = container.firstChild as HTMLElement;

    // Assert has matching width and height classes (w-24 and h-24 = square)
    expect(cardElement.className).toContain('w-24');
    expect(cardElement.className).toContain('h-24');
  });

  it('should have 6rem (w-24 h-24) dimension classes', () => {
    const { container } = render(<Card card={testCard} faceUp={true} />);
    const cardElement = container.firstChild as HTMLElement;

    // w-24 = 6rem, h-24 = 6rem in Tailwind
    expect(cardElement.className).toContain('w-24');
    expect(cardElement.className).toContain('h-24');
    expect(cardElement.className).toContain('min-w-[6rem]');
    expect(cardElement.className).toContain('min-h-[6rem]');
  });

  it('should maintain consistent dimension classes regardless of content', () => {
    const { container: c1 } = render(<Card card={testCard} faceUp={true} />);
    const { container: c2 } = render(<Card card={longTextCard} faceUp={true} />);
    const { container: c3 } = render(<Card card={emptyCard} faceUp={true} />);

    const card1 = c1.firstChild as HTMLElement;
    const card2 = c2.firstChild as HTMLElement;
    const card3 = c3.firstChild as HTMLElement;

    // All cards should have the same dimension classes
    expect(card1.className).toContain('w-24');
    expect(card1.className).toContain('h-24');
    expect(card2.className).toContain('w-24');
    expect(card2.className).toContain('h-24');
    expect(card3.className).toContain('w-24');
    expect(card3.className).toContain('h-24');
  });

  it('should have square dimension classes when face-down', () => {
    const { container } = render(<Card card={testCard} faceUp={false} />);
    const cardElement = container.firstChild as HTMLElement;

    expect(cardElement.className).toContain('w-24');
    expect(cardElement.className).toContain('h-24');
    expect(cardElement.className).toContain('min-w-[6rem]');
    expect(cardElement.className).toContain('min-h-[6rem]');
  });

  it('should have overflow-hidden class to prevent content overflow', () => {
    const { container } = render(<Card card={longTextCard} faceUp={true} />);
    const cardElement = container.firstChild as HTMLElement;

    expect(cardElement.className).toContain('overflow-hidden');
  });

  it('should not change dimension classes on hover', () => {
    const { container } = render(
      <Card card={testCard} faceUp={true} isAvailable={true} onClick={() => {}} />
    );
    const cardElement = container.firstChild as HTMLElement;

    const classesBefore = cardElement.className;

    // Simulate hover
    cardElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    const classesAfter = cardElement.className;

    // Dimension classes should remain the same
    expect(classesAfter).toContain('w-24');
    expect(classesAfter).toContain('h-24');
    // Should have hover:opacity but not hover:scale
    expect(classesAfter).toContain('hover:opacity');
    expect(classesAfter).not.toContain('hover:scale');
  });

  it('should use opacity transition instead of scale on hover', () => {
    const { container } = render(
      <Card card={testCard} faceUp={true} isAvailable={true} onClick={() => {}} />
    );
    const cardElement = container.firstChild as HTMLElement;

    // Should have opacity transition, not scale transition
    expect(cardElement.className).toContain('transition-opacity');
    expect(cardElement.className).not.toContain('hover:scale');
  });

  it('should render empty card placeholder with square dimension classes', () => {
    const { container } = render(<Card card={undefined} faceUp={true} />);
    const cardElement = container.firstChild as HTMLElement;

    expect(cardElement.className).toContain('w-24');
    expect(cardElement.className).toContain('h-24');
    expect(cardElement.className).toContain('min-w-[6rem]');
    expect(cardElement.className).toContain('min-h-[6rem]');
  });
});
