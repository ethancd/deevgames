import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Card } from '../../src/components/Card';
import type { Card as CardType } from '../../src/game/types';
import {
  renderWithCartoonSkin,
  renderWithOriginalSkin,
  resetLocalStorage,
  testCards,
  expectedCartoonNames,
  expectedCartoonEmojis,
  expectedOriginalEmojis,
} from '../utils/skinTestUtils';

describe('Card component skin integration', () => {
  beforeEach(() => {
    resetLocalStorage();
  });

  describe('Card name display', () => {
    describe('Original skin - displays original names', () => {
      it('should display "Bloodthorn Seedling" for Crimson card', () => {
        renderWithOriginalSkin(<Card card={testCards.crimsonCard} faceUp={true} />);
        expect(screen.getByText('Bloodthorn Seedling')).toBeInTheDocument();
      });

      it('should display "Raid Scout" for Iron card', () => {
        renderWithOriginalSkin(<Card card={testCards.ironCard} faceUp={true} />);
        expect(screen.getByText('Raid Scout')).toBeInTheDocument();
      });

      it('should display "Supply Cache" for General card', () => {
        renderWithOriginalSkin(<Card card={testCards.generalCard} faceUp={true} />);
        expect(screen.getByText('Supply Cache')).toBeInTheDocument();
      });
    });

    describe('Cartoon skin - displays cartoon names', () => {
      it('should display "Berry Sprout" instead of "Bloodthorn Seedling"', () => {
        renderWithCartoonSkin(<Card card={testCards.crimsonCard} faceUp={true} />);
        expect(screen.getByText('Berry Sprout')).toBeInTheDocument();
        expect(screen.queryByText('Bloodthorn Seedling')).not.toBeInTheDocument();
      });

      it('should display "Scout Bot" instead of "Raid Scout"', () => {
        renderWithCartoonSkin(<Card card={testCards.ironCard} faceUp={true} />);
        expect(screen.getByText('Scout Bot')).toBeInTheDocument();
        expect(screen.queryByText('Raid Scout')).not.toBeInTheDocument();
      });

      it('should display "Magic Crystal" instead of "Null Shard"', () => {
        renderWithCartoonSkin(<Card card={testCards.voidCard} faceUp={true} />);
        expect(screen.getByText('Magic Crystal')).toBeInTheDocument();
        expect(screen.queryByText('Null Shard')).not.toBeInTheDocument();
      });

      it('should display "Toy Shop" instead of "Trade Contact"', () => {
        renderWithCartoonSkin(<Card card={testCards.silkCard} faceUp={true} />);
        expect(screen.getByText('Toy Shop')).toBeInTheDocument();
        expect(screen.queryByText('Trade Contact')).not.toBeInTheDocument();
      });

      it('should display "Little Garden" instead of "Seedling Shrine"', () => {
        renderWithCartoonSkin(<Card card={testCards.dreamCard} faceUp={true} />);
        expect(screen.getByText('Little Garden')).toBeInTheDocument();
        expect(screen.queryByText('Seedling Shrine')).not.toBeInTheDocument();
      });

      it('should display "Cloud Puff" instead of "Data Fragment"', () => {
        renderWithCartoonSkin(<Card card={testCards.ghostCard} faceUp={true} />);
        expect(screen.getByText('Cloud Puff')).toBeInTheDocument();
        expect(screen.queryByText('Data Fragment')).not.toBeInTheDocument();
      });

      it('should display "Treasure Drop" instead of "Supply Cache"', () => {
        renderWithCartoonSkin(<Card card={testCards.generalCard} faceUp={true} />);
        expect(screen.getByText('Treasure Drop')).toBeInTheDocument();
        expect(screen.queryByText('Supply Cache')).not.toBeInTheDocument();
      });
    });

    describe('Cartoon skin - NO original names visible', () => {
      Object.entries(testCards).forEach(([key, card]) => {
        it(`should NOT display original name "${card.name}" in cartoon mode`, () => {
          renderWithCartoonSkin(<Card card={card} faceUp={true} />);
          expect(screen.queryByText(card.name)).not.toBeInTheDocument();
        });
      });
    });
  });

  describe('Faction emoji display', () => {
    describe('Original skin - displays original emojis', () => {
      it('should display 🩸 for Crimson Covenant', () => {
        renderWithOriginalSkin(<Card card={testCards.crimsonCard} faceUp={true} />);
        expect(screen.getByText('🩸')).toBeInTheDocument();
      });

      it('should display ⚙️ for Iron Tide', () => {
        renderWithOriginalSkin(<Card card={testCards.ironCard} faceUp={true} />);
        expect(screen.getByText('⚙️')).toBeInTheDocument();
      });

      it('should display 🌀 for Void Legion', () => {
        renderWithOriginalSkin(<Card card={testCards.voidCard} faceUp={true} />);
        expect(screen.getByText('🌀')).toBeInTheDocument();
      });

      it('should display 🕸️ for Silk Network', () => {
        renderWithOriginalSkin(<Card card={testCards.silkCard} faceUp={true} />);
        expect(screen.getByText('🕸️')).toBeInTheDocument();
      });

      it('should display 🪷 for Dream Garden', () => {
        renderWithOriginalSkin(<Card card={testCards.dreamCard} faceUp={true} />);
        expect(screen.getByText('🪷')).toBeInTheDocument();
      });

      it('should display 👤 for Ghost Protocol', () => {
        renderWithOriginalSkin(<Card card={testCards.ghostCard} faceUp={true} />);
        expect(screen.getByText('👤')).toBeInTheDocument();
      });

      it('should display 📦 for General', () => {
        renderWithOriginalSkin(<Card card={testCards.generalCard} faceUp={true} />);
        expect(screen.getByText('📦')).toBeInTheDocument();
      });
    });

    describe('Cartoon skin - displays cartoon emojis', () => {
      it('should display 🍓 for Strawberry Squad (Crimson)', () => {
        renderWithCartoonSkin(<Card card={testCards.crimsonCard} faceUp={true} />);
        expect(screen.getByText('🍓')).toBeInTheDocument();
      });

      it('should display 🤖 for Robot Rangers (Iron)', () => {
        renderWithCartoonSkin(<Card card={testCards.ironCard} faceUp={true} />);
        expect(screen.getByText('🤖')).toBeInTheDocument();
      });

      it('should display ✨ for Sparkle Sprites (Void)', () => {
        renderWithCartoonSkin(<Card card={testCards.voidCard} faceUp={true} />);
        expect(screen.getByText('✨')).toBeInTheDocument();
      });

      it('should display 🎁 for Treasure Troop (Silk)', () => {
        renderWithCartoonSkin(<Card card={testCards.silkCard} faceUp={true} />);
        expect(screen.getByText('🎁')).toBeInTheDocument();
      });

      it('should display 🌸 for Flower Friends (Dream)', () => {
        renderWithCartoonSkin(<Card card={testCards.dreamCard} faceUp={true} />);
        expect(screen.getByText('🌸')).toBeInTheDocument();
      });

      it('should display ☁️ for Cloud Crew (Ghost)', () => {
        renderWithCartoonSkin(<Card card={testCards.ghostCard} faceUp={true} />);
        expect(screen.getByText('☁️')).toBeInTheDocument();
      });

      it('should display ⭐ for Supply Stars (General)', () => {
        renderWithCartoonSkin(<Card card={testCards.generalCard} faceUp={true} />);
        expect(screen.getByText('⭐')).toBeInTheDocument();
      });
    });

    describe('Cartoon skin - NO original emojis visible', () => {
      const emojiChecks = [
        { card: testCards.crimsonCard, originalEmoji: '🩸', faction: 'Crimson' },
        { card: testCards.ironCard, originalEmoji: '⚙️', faction: 'Iron' },
        { card: testCards.voidCard, originalEmoji: '🌀', faction: 'Void' },
        { card: testCards.silkCard, originalEmoji: '🕸️', faction: 'Silk' },
        { card: testCards.dreamCard, originalEmoji: '🪷', faction: 'Dream' },
        { card: testCards.ghostCard, originalEmoji: '👤', faction: 'Ghost' },
        { card: testCards.generalCard, originalEmoji: '📦', faction: 'General' },
      ];

      emojiChecks.forEach(({ card, originalEmoji, faction }) => {
        it(`should NOT display ${originalEmoji} (original ${faction} emoji) in cartoon mode`, () => {
          renderWithCartoonSkin(<Card card={card} faceUp={true} />);
          expect(screen.queryByText(originalEmoji)).not.toBeInTheDocument();
        });
      });
    });
  });

  describe('Face-down cards', () => {
    describe('Original skin face-down', () => {
      it('should show original emoji on face-down Crimson card', () => {
        renderWithOriginalSkin(<Card card={testCards.crimsonCard} faceUp={false} />);
        expect(screen.getByText('🩸')).toBeInTheDocument();
      });

      it('should NOT show card name on face-down card', () => {
        renderWithOriginalSkin(<Card card={testCards.crimsonCard} faceUp={false} />);
        expect(screen.queryByText('Bloodthorn Seedling')).not.toBeInTheDocument();
      });
    });

    describe('Cartoon skin face-down', () => {
      it('should show cartoon emoji on face-down Crimson card', () => {
        renderWithCartoonSkin(<Card card={testCards.crimsonCard} faceUp={false} />);
        expect(screen.getByText('🍓')).toBeInTheDocument();
      });

      it('should NOT show original emoji on face-down Crimson card', () => {
        renderWithCartoonSkin(<Card card={testCards.crimsonCard} faceUp={false} />);
        expect(screen.queryByText('🩸')).not.toBeInTheDocument();
      });

      it('should NOT show any card name on face-down card', () => {
        renderWithCartoonSkin(<Card card={testCards.crimsonCard} faceUp={false} />);
        expect(screen.queryByText('Bloodthorn Seedling')).not.toBeInTheDocument();
        expect(screen.queryByText('Berry Sprout')).not.toBeInTheDocument();
      });
    });
  });

  describe('CSS class application', () => {
    it('should apply original faction background classes in original skin', () => {
      const { container } = renderWithOriginalSkin(<Card card={testCards.crimsonCard} faceUp={true} />);
      const cardElement = container.querySelector('div');
      expect(cardElement?.className).toContain('bg-red-950/20');
    });

    it('should apply cartoon faction background classes in cartoon skin', () => {
      const { container } = renderWithCartoonSkin(<Card card={testCards.crimsonCard} faceUp={true} />);
      const cardElement = container.querySelector('div');
      expect(cardElement?.className).toContain('bg-pink-100');
    });

    it('should apply original border classes in original skin', () => {
      const { container } = renderWithOriginalSkin(<Card card={testCards.crimsonCard} faceUp={true} />);
      const cardElement = container.querySelector('div');
      expect(cardElement?.className).toContain('border-red-700');
    });

    it('should apply cartoon border classes in cartoon skin', () => {
      const { container } = renderWithCartoonSkin(<Card card={testCards.crimsonCard} faceUp={true} />);
      const cardElement = container.querySelector('div');
      expect(cardElement?.className).toContain('border-pink-400');
    });
  });

  describe('All factions have correct theming', () => {
    const allFactions = [
      { card: testCards.crimsonCard, faction: 'Crimson Covenant' },
      { card: testCards.ironCard, faction: 'Iron Tide' },
      { card: testCards.voidCard, faction: 'Void Legion' },
      { card: testCards.silkCard, faction: 'Silk Network' },
      { card: testCards.dreamCard, faction: 'Dream Garden' },
      { card: testCards.ghostCard, faction: 'Ghost Protocol' },
      { card: testCards.generalCard, faction: 'General' },
    ];

    allFactions.forEach(({ card, faction }) => {
      it(`should render ${faction} card without errors in original skin`, () => {
        expect(() => {
          renderWithOriginalSkin(<Card card={card} faceUp={true} />);
        }).not.toThrow();
      });

      it(`should render ${faction} card without errors in cartoon skin`, () => {
        expect(() => {
          renderWithCartoonSkin(<Card card={card} faceUp={true} />);
        }).not.toThrow();
      });
    });
  });
});
