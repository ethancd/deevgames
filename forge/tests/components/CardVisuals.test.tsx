import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Card } from '../../src/components/Card';
import type { Card as CardType } from '../../src/game/types';

describe('Card Visual Rendering', () => {
  it('should display faction emoji on face-down cards', () => {
    const card: CardType = {
      name: 'Test',
      faction: 'Iron Tide',
      cost: 1,
      symbols: '♂',
      baseVP: 1,
      conditionalVP: '',
      game3Effect: '',
      parsedCost: { mars: 1, venus: 0, mercury: 0, moon: 0, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={false} />);
    expect(container.textContent).toContain('⚙️');
  });

  it('should display VP in "N ★" format (not "★ N VP")', () => {
    const card: CardType = {
      name: 'Test',
      faction: 'General',
      cost: 1,
      symbols: '♂',
      baseVP: 3,
      conditionalVP: '',
      game3Effect: '',
      parsedCost: { mars: 1, venus: 0, mercury: 0, moon: 0, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    const text = container.textContent;

    expect(text).toContain('3 ★');
    expect(text).not.toContain('★ 3 VP');
  });

  it('should replace "any" with ☉ in costs', () => {
    const card: CardType = {
      name: 'Supply Cache',
      faction: 'General',
      cost: 1,
      symbols: 'any',
      baseVP: 2,
      conditionalVP: '',
      game3Effect: '',
      parsedCost: { mars: 0, venus: 0, mercury: 0, moon: 0, any: 1 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    expect(container.textContent).toContain('☉');
    expect(container.textContent).not.toContain('any');
  });

  it('should emojify conditional VPs - Crimson Covenant', () => {
    const card: CardType = {
      name: 'The Hivemind',
      faction: 'Crimson Covenant',
      cost: 3,
      symbols: '♂♂♀',
      baseVP: 0,
      conditionalVP: '+1 per Crimson Covenant card',
      game3Effect: '',
      parsedCost: { mars: 2, venus: 1, mercury: 0, moon: 0, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    expect(container.textContent).toContain('1★ x 🩸');
  });

  it('should emojify conditional VPs - Iron Tide', () => {
    const card: CardType = {
      name: 'The Foundry',
      faction: 'Iron Tide',
      cost: 3,
      symbols: '♂♂☿',
      baseVP: 0,
      conditionalVP: '+1 per Iron Tide card',
      game3Effect: '',
      parsedCost: { mars: 2, venus: 0, mercury: 1, moon: 0, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    expect(container.textContent).toContain('1★ x ⚙️');
  });

  it('should emojify conditional VPs - Void Legion', () => {
    const card: CardType = {
      name: 'The Rift',
      faction: 'Void Legion',
      cost: 3,
      symbols: '♂♂☽',
      baseVP: 0,
      conditionalVP: '+1 per Void Legion card',
      game3Effect: '',
      parsedCost: { mars: 2, venus: 0, mercury: 0, moon: 1, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    expect(container.textContent).toContain('1★ x 🌀');
  });

  it('should emojify conditional VPs - Silk Network', () => {
    const card: CardType = {
      name: 'The Exchange',
      faction: 'Silk Network',
      cost: 3,
      symbols: '♀♀☿',
      baseVP: 0,
      conditionalVP: '+1 per Silk Network card',
      game3Effect: '',
      parsedCost: { mars: 0, venus: 2, mercury: 1, moon: 0, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    expect(container.textContent).toContain('1★ x 🕸️');
  });

  it('should emojify conditional VPs - Dream Garden', () => {
    const card: CardType = {
      name: 'The Grove',
      faction: 'Dream Garden',
      cost: 3,
      symbols: '♀♀☽',
      baseVP: 0,
      conditionalVP: '+1 per Dream Garden card',
      game3Effect: '',
      parsedCost: { mars: 0, venus: 2, mercury: 0, moon: 1, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    expect(container.textContent).toContain('1★ x 🪷');
  });

  it('should emojify conditional VPs - Ghost Protocol', () => {
    const card: CardType = {
      name: 'The Archive',
      faction: 'Ghost Protocol',
      cost: 3,
      symbols: '☿☿☽',
      baseVP: 0,
      conditionalVP: '+1 per Ghost Protocol card',
      game3Effect: '',
      parsedCost: { mars: 0, venus: 0, mercury: 2, moon: 1, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    expect(container.textContent).toContain('1★ x 👤');
  });

  it('should emojify burn-related conditional VPs', () => {
    const card: CardType = {
      name: 'Erasure Protocol',
      faction: 'Ghost Protocol',
      cost: 4,
      symbols: '☿☿☽☽',
      baseVP: 0,
      conditionalVP: '+1 per card you burned this game',
      game3Effect: '',
      parsedCost: { mars: 0, venus: 0, mercury: 2, moon: 2, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    expect(container.textContent).toContain('1★ x 🔥');
  });

  it('should emojify diversity conditional VPs', () => {
    const card: CardType = {
      name: 'Thorne',
      faction: 'Crimson Covenant',
      cost: 3,
      symbols: '♂♀♀',
      baseVP: 0,
      conditionalVP: '+1 per faction represented',
      game3Effect: '',
      parsedCost: { mars: 1, venus: 2, mercury: 0, moon: 0, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    expect(container.textContent).toContain('1★ x 🌈');
  });

  it('should display faction emoji on face-up cards', () => {
    const card: CardType = {
      name: 'Ghost Agent',
      faction: 'Ghost Protocol',
      cost: 2,
      symbols: '☿☽',
      baseVP: 2,
      conditionalVP: '',
      game3Effect: 'Infiltration',
      parsedCost: { mars: 0, venus: 0, mercury: 1, moon: 1, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    expect(container.textContent).toContain('👤');
  });

  it('should not display game3Effect text in card body', () => {
    const card: CardType = {
      name: 'Test',
      faction: 'General',
      cost: 1,
      symbols: '♂',
      baseVP: 1,
      conditionalVP: '',
      game3Effect: 'This is a game 3 effect that should not appear',
      parsedCost: { mars: 1, venus: 0, mercury: 0, moon: 0, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    const text = container.textContent;

    expect(text).not.toContain('This is a game 3 effect');
  });

  it('should have game3Effect in title attribute for tooltip', () => {
    const card: CardType = {
      name: 'Test',
      faction: 'General',
      cost: 1,
      symbols: '♂',
      baseVP: 1,
      conditionalVP: '',
      game3Effect: 'This is a tooltip effect',
      parsedCost: { mars: 1, venus: 0, mercury: 0, moon: 0, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={true} />);
    const cardElement = container.firstChild as HTMLElement;

    expect(cardElement.getAttribute('title')).toBe('This is a tooltip effect');
  });

  it('should show faction emoji for all factions', () => {
    const factions = [
      { faction: 'Crimson Covenant' as const, emoji: '🩸' },
      { faction: 'Iron Tide' as const, emoji: '⚙️' },
      { faction: 'Void Legion' as const, emoji: '🌀' },
      { faction: 'Silk Network' as const, emoji: '🕸️' },
      { faction: 'Dream Garden' as const, emoji: '🪷' },
      { faction: 'Ghost Protocol' as const, emoji: '👤' },
      { faction: 'General' as const, emoji: '📦' }
    ];

    factions.forEach(({ faction, emoji }) => {
      const card: CardType = {
        name: 'Test',
        faction,
        cost: 1,
        symbols: '♂',
        baseVP: 1,
        conditionalVP: '',
        game3Effect: '',
        parsedCost: { mars: 1, venus: 0, mercury: 0, moon: 0, any: 0 }
      };

      const { container } = render(<Card card={card} faceUp={false} />);
      expect(container.textContent).toContain(emoji);
    });
  });

  it('should not show faction name text on face-down cards', () => {
    const card: CardType = {
      name: 'Test',
      faction: 'Crimson Covenant',
      cost: 1,
      symbols: '♂',
      baseVP: 1,
      conditionalVP: '',
      game3Effect: '',
      parsedCost: { mars: 1, venus: 0, mercury: 0, moon: 0, any: 0 }
    };

    const { container } = render(<Card card={card} faceUp={false} />);
    expect(container.textContent).not.toContain('Crimson Covenant');
  });
});
