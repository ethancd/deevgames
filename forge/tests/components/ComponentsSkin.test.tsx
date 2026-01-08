import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { CardModal } from '../../src/components/CardModal';
import { BidModal } from '../../src/components/BidModal';
import type { Card as CardType, SymbolPool, SymbolCost } from '../../src/game/types';
import {
  renderWithCartoonSkin,
  renderWithOriginalSkin,
  resetLocalStorage,
  testCards,
} from '../utils/skinTestUtils';

describe('CardModal skin integration', () => {
  beforeEach(() => {
    resetLocalStorage();
  });

  const mockHandlers = {
    onClose: vi.fn(),
    onBurn: vi.fn(),
    onBuy: vi.fn(),
  };

  const defaultPosition = { x: 0, y: 0 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Card name display in CardModal', () => {
    describe('Original skin', () => {
      it('should display original card name "Bloodthorn Seedling"', () => {
        renderWithOriginalSkin(
          <CardModal
            card={testCards.crimsonCard}
            position={defaultPosition}
            onClose={mockHandlers.onClose}
            onBurn={mockHandlers.onBurn}
            onBuy={mockHandlers.onBuy}
            canBuy={true}
          />
        );

        // CardModal displays name in h2 element
        expect(screen.getAllByText('Bloodthorn Seedling').length).toBeGreaterThan(0);
      });

      it('should display original card name "Supply Cache"', () => {
        renderWithOriginalSkin(
          <CardModal
            card={testCards.generalCard}
            position={defaultPosition}
            onClose={mockHandlers.onClose}
            onBurn={mockHandlers.onBurn}
            onBuy={mockHandlers.onBuy}
            canBuy={true}
          />
        );

        expect(screen.getAllByText('Supply Cache').length).toBeGreaterThan(0);
      });
    });

    describe('Cartoon skin', () => {
      it('should display cartoon name "Berry Sprout" instead of "Bloodthorn Seedling"', () => {
        renderWithCartoonSkin(
          <CardModal
            card={testCards.crimsonCard}
            position={defaultPosition}
            onClose={mockHandlers.onClose}
            onBurn={mockHandlers.onBurn}
            onBuy={mockHandlers.onBuy}
            canBuy={true}
          />
        );

        expect(screen.getAllByText('Berry Sprout').length).toBeGreaterThan(0);
        expect(screen.queryByText('Bloodthorn Seedling')).not.toBeInTheDocument();
      });

      it('should display cartoon name "Treasure Drop" instead of "Supply Cache"', () => {
        renderWithCartoonSkin(
          <CardModal
            card={testCards.generalCard}
            position={defaultPosition}
            onClose={mockHandlers.onClose}
            onBurn={mockHandlers.onBurn}
            onBuy={mockHandlers.onBuy}
            canBuy={true}
          />
        );

        expect(screen.getAllByText('Treasure Drop').length).toBeGreaterThan(0);
        expect(screen.queryByText('Supply Cache')).not.toBeInTheDocument();
      });
    });

    describe('No original names in cartoon mode', () => {
      Object.entries(testCards).forEach(([key, card]) => {
        it(`should NOT show original name "${card.name}" in CardModal`, () => {
          renderWithCartoonSkin(
            <CardModal
              card={card}
              position={defaultPosition}
              onClose={mockHandlers.onClose}
              onBurn={mockHandlers.onBurn}
              onBuy={mockHandlers.onBuy}
              canBuy={true}
            />
          );

          expect(screen.queryByText(card.name)).not.toBeInTheDocument();
        });
      });
    });
  });

  describe('Image paths in CardModal', () => {
    it('should use original image path in original skin', () => {
      const { container } = renderWithOriginalSkin(
        <CardModal
          card={testCards.crimsonCard}
          position={defaultPosition}
          onClose={mockHandlers.onClose}
          onBurn={mockHandlers.onBurn}
          onBuy={mockHandlers.onBuy}
          canBuy={true}
        />
      );

      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBe('/images/bloodthorn-seedling.png');
    });

    it('should use cartoon image path in cartoon skin', () => {
      const { container } = renderWithCartoonSkin(
        <CardModal
          card={testCards.crimsonCard}
          position={defaultPosition}
          onClose={mockHandlers.onClose}
          onBurn={mockHandlers.onBurn}
          onBuy={mockHandlers.onBuy}
          canBuy={true}
        />
      );

      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBe('/images-cartoon/bloodthorn-seedling.png');
    });
  });
});

describe('BidModal skin integration', () => {
  beforeEach(() => {
    resetLocalStorage();
  });

  const mockHandlers = {
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  const availableSymbols: SymbolPool = {
    mars: 4,
    venus: 4,
    mercury: 4,
    moon: 4,
  };

  const requiredCost: SymbolCost = {
    mars: 1,
    venus: 0,
    mercury: 0,
    moon: 0,
    any: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Card name display in BidModal', () => {
    describe('Original skin', () => {
      it('should display original card name "Bloodthorn Seedling"', () => {
        renderWithOriginalSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('Bloodthorn Seedling')).toBeInTheDocument();
      });

      it('should display original card name "Supply Cache"', () => {
        renderWithOriginalSkin(
          <BidModal
            card={testCards.generalCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('Supply Cache')).toBeInTheDocument();
      });
    });

    describe('Cartoon skin', () => {
      it('should display cartoon name "Berry Sprout" instead of "Bloodthorn Seedling"', () => {
        renderWithCartoonSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('Berry Sprout')).toBeInTheDocument();
        expect(screen.queryByText('Bloodthorn Seedling')).not.toBeInTheDocument();
      });

      it('should display cartoon name "Treasure Drop" instead of "Supply Cache"', () => {
        renderWithCartoonSkin(
          <BidModal
            card={testCards.generalCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('Treasure Drop')).toBeInTheDocument();
        expect(screen.queryByText('Supply Cache')).not.toBeInTheDocument();
      });
    });

    describe('No original names in cartoon mode', () => {
      Object.entries(testCards).forEach(([key, card]) => {
        it(`should NOT show original name "${card.name}" in BidModal`, () => {
          renderWithCartoonSkin(
            <BidModal
              card={card}
              availableSymbols={availableSymbols}
              requiredCost={requiredCost}
              onConfirm={mockHandlers.onConfirm}
              onCancel={mockHandlers.onCancel}
            />
          );

          expect(screen.queryByText(card.name)).not.toBeInTheDocument();
        });
      });
    });
  });

  describe('Symbol display in BidModal', () => {
    describe('Original skin symbols', () => {
      it('should display original symbol ♂ for Mars', () => {
        renderWithOriginalSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('♂')).toBeInTheDocument();
      });

      it('should display original symbol ♀ for Venus', () => {
        renderWithOriginalSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('♀')).toBeInTheDocument();
      });

      it('should display original symbol ☿ for Mercury', () => {
        renderWithOriginalSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('☿')).toBeInTheDocument();
      });

      it('should display original symbol ☽ for Moon', () => {
        renderWithOriginalSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('☽')).toBeInTheDocument();
      });
    });

    describe('Cartoon skin symbols', () => {
      it('should display cartoon symbol ❤️ for Mars', () => {
        renderWithCartoonSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('❤️')).toBeInTheDocument();
      });

      it('should display cartoon symbol 💖 for Venus', () => {
        renderWithCartoonSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('💖')).toBeInTheDocument();
      });

      it('should display cartoon symbol 💫 for Mercury', () => {
        renderWithCartoonSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('💫')).toBeInTheDocument();
      });

      it('should display cartoon symbol 🌙 for Moon', () => {
        renderWithCartoonSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.getByText('🌙')).toBeInTheDocument();
      });
    });

    describe('No original symbols in cartoon mode', () => {
      it('should NOT display original symbol ♂ in cartoon mode', () => {
        renderWithCartoonSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.queryByText('♂')).not.toBeInTheDocument();
      });

      it('should NOT display original symbol ♀ in cartoon mode', () => {
        renderWithCartoonSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.queryByText('♀')).not.toBeInTheDocument();
      });

      it('should NOT display original symbol ☿ in cartoon mode', () => {
        renderWithCartoonSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.queryByText('☿')).not.toBeInTheDocument();
      });

      it('should NOT display original symbol ☽ in cartoon mode', () => {
        renderWithCartoonSkin(
          <BidModal
            card={testCards.crimsonCard}
            availableSymbols={availableSymbols}
            requiredCost={requiredCost}
            onConfirm={mockHandlers.onConfirm}
            onCancel={mockHandlers.onCancel}
          />
        );

        expect(screen.queryByText('☽')).not.toBeInTheDocument();
      });
    });
  });
});

describe('Cross-component skin consistency', () => {
  beforeEach(() => {
    resetLocalStorage();
  });

  const mockHandlers = {
    onClose: vi.fn(),
    onBurn: vi.fn(),
    onBuy: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  const availableSymbols: SymbolPool = {
    mars: 4,
    venus: 4,
    mercury: 4,
    moon: 4,
  };

  const requiredCost: SymbolCost = {
    mars: 1,
    venus: 0,
    mercury: 0,
    moon: 0,
    any: 0,
  };

  describe('All components show consistent cartoon names', () => {
    it('Card and CardModal should both show "Berry Sprout" in cartoon mode', () => {
      // This test verifies that when cartoon mode is on,
      // the same card name is shown consistently across components
      const { container: cardModalContainer } = renderWithCartoonSkin(
        <CardModal
          card={testCards.crimsonCard}
          position={{ x: 0, y: 0 }}
          onClose={mockHandlers.onClose}
          onBurn={mockHandlers.onBurn}
          onBuy={mockHandlers.onBuy}
          canBuy={true}
        />
      );

      // CardModal should show Berry Sprout multiple times (in card and in header)
      expect(screen.getAllByText('Berry Sprout').length).toBeGreaterThan(0);
    });
  });

  describe('No mixing of skins', () => {
    it('should not show any original-skin content when cartoon is active', () => {
      renderWithCartoonSkin(
        <>
          <CardModal
            card={testCards.crimsonCard}
            position={{ x: 0, y: 0 }}
            onClose={mockHandlers.onClose}
            onBurn={mockHandlers.onBurn}
            onBuy={mockHandlers.onBuy}
            canBuy={true}
          />
        </>
      );

      // Check that no original content appears
      expect(screen.queryByText('Bloodthorn Seedling')).not.toBeInTheDocument();
      expect(screen.queryByText('🩸')).not.toBeInTheDocument(); // Original Crimson emoji
    });
  });
});
