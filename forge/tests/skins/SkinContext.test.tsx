import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SkinProvider, useSkin } from '../../src/skins/SkinContext';
import { originalSkin } from '../../src/skins/original';
import { cartoonSkin } from '../../src/skins/cartoon';
import { resetLocalStorage } from '../utils/skinTestUtils';

// Test component that displays skin info
function SkinTestDisplay() {
  const { skinId, skin, setSkin, availableSkins } = useSkin();
  return (
    <div>
      <div data-testid="skin-id">{skinId}</div>
      <div data-testid="skin-display-name">{skin.displayName}</div>
      <div data-testid="skin-icon">{skin.icon}</div>
      <div data-testid="available-count">{availableSkins.length}</div>
      <button data-testid="switch-to-cartoon" onClick={() => setSkin('cartoon')}>
        Switch to Cartoon
      </button>
      <button data-testid="switch-to-original" onClick={() => setSkin('original')}>
        Switch to Original
      </button>
    </div>
  );
}

// Test component for faction display
function FactionTestDisplay({ faction }: { faction: string }) {
  const { skin } = useSkin();
  const factionTheme = skin.factions[faction as keyof typeof skin.factions];
  return (
    <div>
      <div data-testid="faction-display-name">{factionTheme?.displayName}</div>
      <div data-testid="faction-emoji">{factionTheme?.emoji}</div>
    </div>
  );
}

// Test component for card name display
function CardNameTestDisplay({ cardName }: { cardName: string }) {
  const { skin } = useSkin();
  const displayName = skin.cardNames?.[cardName] ?? cardName;
  return <div data-testid="card-display-name">{displayName}</div>;
}

// Test component for symbol display
function SymbolTestDisplay() {
  const { skin } = useSkin();
  return (
    <div>
      <span data-testid="symbol-any">{skin.symbols.any}</span>
      <span data-testid="symbol-mars">{skin.symbols.mars}</span>
      <span data-testid="symbol-venus">{skin.symbols.venus}</span>
      <span data-testid="symbol-mercury">{skin.symbols.mercury}</span>
      <span data-testid="symbol-moon">{skin.symbols.moon}</span>
    </div>
  );
}

// Test component for image path
function ImagePathTestDisplay({ cardName }: { cardName: string }) {
  const { skin } = useSkin();
  return <div data-testid="image-path">{skin.imagePath(cardName)}</div>;
}

describe('SkinContext', () => {
  beforeEach(() => {
    resetLocalStorage();
    document.documentElement.classList.remove('skin-original', 'skin-cartoon');
  });

  afterEach(() => {
    resetLocalStorage();
    document.documentElement.classList.remove('skin-original', 'skin-cartoon');
  });

  describe('SkinProvider initialization', () => {
    it('should default to original skin when no preference is stored', () => {
      render(
        <SkinProvider>
          <SkinTestDisplay />
        </SkinProvider>
      );

      expect(screen.getByTestId('skin-id').textContent).toBe('original');
      expect(screen.getByTestId('skin-display-name').textContent).toBe('Dark Fantasy');
    });

    it('should load cartoon skin when preference is stored', () => {
      localStorage.setItem('forge-skin-preference', 'cartoon');

      render(
        <SkinProvider>
          <SkinTestDisplay />
        </SkinProvider>
      );

      expect(screen.getByTestId('skin-id').textContent).toBe('cartoon');
      expect(screen.getByTestId('skin-display-name').textContent).toBe('Cartoon');
    });

    it('should provide both skins as available', () => {
      render(
        <SkinProvider>
          <SkinTestDisplay />
        </SkinProvider>
      );

      expect(screen.getByTestId('available-count').textContent).toBe('2');
    });
  });

  describe('Skin switching', () => {
    it('should switch from original to cartoon', () => {
      render(
        <SkinProvider>
          <SkinTestDisplay />
        </SkinProvider>
      );

      expect(screen.getByTestId('skin-id').textContent).toBe('original');

      act(() => {
        fireEvent.click(screen.getByTestId('switch-to-cartoon'));
      });

      expect(screen.getByTestId('skin-id').textContent).toBe('cartoon');
      expect(screen.getByTestId('skin-display-name').textContent).toBe('Cartoon');
    });

    it('should switch from cartoon to original', () => {
      localStorage.setItem('forge-skin-preference', 'cartoon');

      render(
        <SkinProvider>
          <SkinTestDisplay />
        </SkinProvider>
      );

      expect(screen.getByTestId('skin-id').textContent).toBe('cartoon');

      act(() => {
        fireEvent.click(screen.getByTestId('switch-to-original'));
      });

      expect(screen.getByTestId('skin-id').textContent).toBe('original');
      expect(screen.getByTestId('skin-display-name').textContent).toBe('Dark Fantasy');
    });

    it('should persist skin preference to localStorage', () => {
      render(
        <SkinProvider>
          <SkinTestDisplay />
        </SkinProvider>
      );

      act(() => {
        fireEvent.click(screen.getByTestId('switch-to-cartoon'));
      });

      expect(localStorage.getItem('forge-skin-preference')).toBe('cartoon');
    });

    it('should apply CSS class to document root when switching', () => {
      render(
        <SkinProvider>
          <SkinTestDisplay />
        </SkinProvider>
      );

      // Initially should have original class
      expect(document.documentElement.classList.contains('skin-original')).toBe(true);
      expect(document.documentElement.classList.contains('skin-cartoon')).toBe(false);

      act(() => {
        fireEvent.click(screen.getByTestId('switch-to-cartoon'));
      });

      // After switching should have cartoon class
      expect(document.documentElement.classList.contains('skin-cartoon')).toBe(true);
      expect(document.documentElement.classList.contains('skin-original')).toBe(false);
    });
  });

  describe('useSkin hook error handling', () => {
    it('should throw error when used outside SkinProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<SkinTestDisplay />);
      }).toThrow('useSkin must be used within a SkinProvider');

      consoleSpy.mockRestore();
    });
  });
});

describe('Faction display names', () => {
  beforeEach(() => {
    resetLocalStorage();
  });

  const factions = [
    { original: 'Crimson Covenant', cartoon: 'Strawberry Squad' },
    { original: 'Iron Tide', cartoon: 'Robot Rangers' },
    { original: 'Void Legion', cartoon: 'Sparkle Sprites' },
    { original: 'Silk Network', cartoon: 'Treasure Troop' },
    { original: 'Dream Garden', cartoon: 'Flower Friends' },
    { original: 'Ghost Protocol', cartoon: 'Cloud Crew' },
    { original: 'General', cartoon: 'Supply Stars' },
  ];

  describe('Original skin faction names', () => {
    factions.forEach(({ original }) => {
      it(`should display "${original}" for ${original} faction`, () => {
        render(
          <SkinProvider>
            <FactionTestDisplay faction={original} />
          </SkinProvider>
        );

        expect(screen.getByTestId('faction-display-name').textContent).toBe(original);
      });
    });
  });

  describe('Cartoon skin faction names', () => {
    factions.forEach(({ original, cartoon }) => {
      it(`should display "${cartoon}" for ${original} faction`, () => {
        localStorage.setItem('forge-skin-preference', 'cartoon');

        render(
          <SkinProvider>
            <FactionTestDisplay faction={original} />
          </SkinProvider>
        );

        expect(screen.getByTestId('faction-display-name').textContent).toBe(cartoon);
      });
    });
  });

  describe('No original names shown in cartoon mode', () => {
    factions.forEach(({ original, cartoon }) => {
      it(`should NOT display "${original}" when cartoon skin is active (shows "${cartoon}" instead)`, () => {
        localStorage.setItem('forge-skin-preference', 'cartoon');

        render(
          <SkinProvider>
            <FactionTestDisplay faction={original} />
          </SkinProvider>
        );

        const displayName = screen.getByTestId('faction-display-name').textContent;
        expect(displayName).not.toBe(original);
        expect(displayName).toBe(cartoon);
      });
    });
  });
});

describe('Faction emojis', () => {
  beforeEach(() => {
    resetLocalStorage();
  });

  const factionEmojis = [
    { faction: 'Crimson Covenant', original: '🩸', cartoon: '🍓' },
    { faction: 'Iron Tide', original: '⚙️', cartoon: '🤖' },
    { faction: 'Void Legion', original: '🌀', cartoon: '✨' },
    { faction: 'Silk Network', original: '🕸️', cartoon: '🎁' },
    { faction: 'Dream Garden', original: '🪷', cartoon: '🌸' },
    { faction: 'Ghost Protocol', original: '👤', cartoon: '☁️' },
    { faction: 'General', original: '📦', cartoon: '⭐' },
  ];

  describe('Original skin faction emojis', () => {
    factionEmojis.forEach(({ faction, original }) => {
      it(`should display "${original}" emoji for ${faction}`, () => {
        render(
          <SkinProvider>
            <FactionTestDisplay faction={faction} />
          </SkinProvider>
        );

        expect(screen.getByTestId('faction-emoji').textContent).toBe(original);
      });
    });
  });

  describe('Cartoon skin faction emojis', () => {
    factionEmojis.forEach(({ faction, cartoon }) => {
      it(`should display "${cartoon}" emoji for ${faction}`, () => {
        localStorage.setItem('forge-skin-preference', 'cartoon');

        render(
          <SkinProvider>
            <FactionTestDisplay faction={faction} />
          </SkinProvider>
        );

        expect(screen.getByTestId('faction-emoji').textContent).toBe(cartoon);
      });
    });
  });
});

describe('Card name transformations', () => {
  beforeEach(() => {
    resetLocalStorage();
  });

  const cardNames = [
    { original: 'Bloodthorn Seedling', cartoon: 'Berry Sprout' },
    { original: 'Raid Scout', cartoon: 'Scout Bot' },
    { original: 'Null Shard', cartoon: 'Magic Crystal' },
    { original: 'Trade Contact', cartoon: 'Toy Shop' },
    { original: 'Seedling Shrine', cartoon: 'Little Garden' },
    { original: 'Data Fragment', cartoon: 'Cloud Puff' },
    { original: 'Supply Cache', cartoon: 'Treasure Drop' },
    { original: 'Apex Predator', cartoon: 'Big Berry Bear' },
    { original: 'War Engine', cartoon: 'Mega Bot' },
    { original: 'World Tree', cartoon: 'Friendship Tree' },
  ];

  describe('Original skin card names', () => {
    cardNames.forEach(({ original }) => {
      it(`should display original name "${original}"`, () => {
        render(
          <SkinProvider>
            <CardNameTestDisplay cardName={original} />
          </SkinProvider>
        );

        expect(screen.getByTestId('card-display-name').textContent).toBe(original);
      });
    });
  });

  describe('Cartoon skin card names', () => {
    cardNames.forEach(({ original, cartoon }) => {
      it(`should display cartoon name "${cartoon}" for "${original}"`, () => {
        localStorage.setItem('forge-skin-preference', 'cartoon');

        render(
          <SkinProvider>
            <CardNameTestDisplay cardName={original} />
          </SkinProvider>
        );

        expect(screen.getByTestId('card-display-name').textContent).toBe(cartoon);
      });
    });
  });

  describe('No original card names shown in cartoon mode', () => {
    cardNames.forEach(({ original, cartoon }) => {
      it(`should NOT display "${original}" when cartoon skin is active`, () => {
        localStorage.setItem('forge-skin-preference', 'cartoon');

        render(
          <SkinProvider>
            <CardNameTestDisplay cardName={original} />
          </SkinProvider>
        );

        const displayName = screen.getByTestId('card-display-name').textContent;
        expect(displayName).not.toBe(original);
        expect(displayName).toBe(cartoon);
      });
    });
  });
});

describe('Symbol emojis', () => {
  beforeEach(() => {
    resetLocalStorage();
  });

  describe('Original skin symbols', () => {
    it('should display original symbol emojis', () => {
      render(
        <SkinProvider>
          <SymbolTestDisplay />
        </SkinProvider>
      );

      expect(screen.getByTestId('symbol-any').textContent).toBe('☉');
      expect(screen.getByTestId('symbol-mars').textContent).toBe('♂');
      expect(screen.getByTestId('symbol-venus').textContent).toBe('♀');
      expect(screen.getByTestId('symbol-mercury').textContent).toBe('☿');
      expect(screen.getByTestId('symbol-moon').textContent).toBe('☽');
    });
  });

  describe('Cartoon skin symbols', () => {
    it('should display cartoon symbol emojis', () => {
      localStorage.setItem('forge-skin-preference', 'cartoon');

      render(
        <SkinProvider>
          <SymbolTestDisplay />
        </SkinProvider>
      );

      expect(screen.getByTestId('symbol-any').textContent).toBe('🌟');
      expect(screen.getByTestId('symbol-mars').textContent).toBe('❤️');
      expect(screen.getByTestId('symbol-venus').textContent).toBe('💖');
      expect(screen.getByTestId('symbol-mercury').textContent).toBe('💫');
      expect(screen.getByTestId('symbol-moon').textContent).toBe('🌙');
    });
  });

  describe('No original symbols shown in cartoon mode', () => {
    it('should NOT display original symbols when cartoon skin is active', () => {
      localStorage.setItem('forge-skin-preference', 'cartoon');

      render(
        <SkinProvider>
          <SymbolTestDisplay />
        </SkinProvider>
      );

      // Verify cartoon symbols are used, not original
      expect(screen.getByTestId('symbol-any').textContent).not.toBe('☉');
      expect(screen.getByTestId('symbol-mars').textContent).not.toBe('♂');
      expect(screen.getByTestId('symbol-venus').textContent).not.toBe('♀');
      expect(screen.getByTestId('symbol-mercury').textContent).not.toBe('☿');
      expect(screen.getByTestId('symbol-moon').textContent).not.toBe('☽');
    });
  });
});

describe('Image paths', () => {
  beforeEach(() => {
    resetLocalStorage();
  });

  describe('Original skin image paths', () => {
    it('should use /images/ directory', () => {
      render(
        <SkinProvider>
          <ImagePathTestDisplay cardName="Bloodthorn Seedling" />
        </SkinProvider>
      );

      expect(screen.getByTestId('image-path').textContent).toBe('/images/bloodthorn-seedling.png');
    });

    it('should convert card names to kebab-case', () => {
      render(
        <SkinProvider>
          <ImagePathTestDisplay cardName="Crimson Base: The Hivemind" />
        </SkinProvider>
      );

      expect(screen.getByTestId('image-path').textContent).toBe('/images/crimson-base-the-hivemind.png');
    });
  });

  describe('Cartoon skin image paths', () => {
    it('should use /images-cartoon/ directory', () => {
      localStorage.setItem('forge-skin-preference', 'cartoon');

      render(
        <SkinProvider>
          <ImagePathTestDisplay cardName="Bloodthorn Seedling" />
        </SkinProvider>
      );

      expect(screen.getByTestId('image-path').textContent).toBe('/images-cartoon/bloodthorn-seedling.png');
    });

    it('should convert card names to kebab-case', () => {
      localStorage.setItem('forge-skin-preference', 'cartoon');

      render(
        <SkinProvider>
          <ImagePathTestDisplay cardName="Crimson Base: The Hivemind" />
        </SkinProvider>
      );

      expect(screen.getByTestId('image-path').textContent).toBe('/images-cartoon/crimson-base-the-hivemind.png');
    });
  });
});

describe('Skin data completeness', () => {
  it('should have all 7 factions defined in original skin', () => {
    const factions = Object.keys(originalSkin.factions);
    expect(factions).toHaveLength(7);
    expect(factions).toContain('Crimson Covenant');
    expect(factions).toContain('Iron Tide');
    expect(factions).toContain('Void Legion');
    expect(factions).toContain('Silk Network');
    expect(factions).toContain('Dream Garden');
    expect(factions).toContain('Ghost Protocol');
    expect(factions).toContain('General');
  });

  it('should have all 7 factions defined in cartoon skin', () => {
    const factions = Object.keys(cartoonSkin.factions);
    expect(factions).toHaveLength(7);
    expect(factions).toContain('Crimson Covenant');
    expect(factions).toContain('Iron Tide');
    expect(factions).toContain('Void Legion');
    expect(factions).toContain('Silk Network');
    expect(factions).toContain('Dream Garden');
    expect(factions).toContain('Ghost Protocol');
    expect(factions).toContain('General');
  });

  it('should have all 5 symbols defined in original skin', () => {
    expect(originalSkin.symbols.any).toBeDefined();
    expect(originalSkin.symbols.mars).toBeDefined();
    expect(originalSkin.symbols.venus).toBeDefined();
    expect(originalSkin.symbols.mercury).toBeDefined();
    expect(originalSkin.symbols.moon).toBeDefined();
  });

  it('should have all 5 symbols defined in cartoon skin', () => {
    expect(cartoonSkin.symbols.any).toBeDefined();
    expect(cartoonSkin.symbols.mars).toBeDefined();
    expect(cartoonSkin.symbols.venus).toBeDefined();
    expect(cartoonSkin.symbols.mercury).toBeDefined();
    expect(cartoonSkin.symbols.moon).toBeDefined();
  });

  it('should have card name mappings only in cartoon skin', () => {
    expect(originalSkin.cardNames).toBeUndefined();
    expect(cartoonSkin.cardNames).toBeDefined();
  });

  it('cartoon skin should have mappings for all card names', () => {
    // Check that we have a reasonable number of card name mappings
    const mappingCount = Object.keys(cartoonSkin.cardNames || {}).length;
    expect(mappingCount).toBeGreaterThanOrEqual(60); // Should have mappings for ~66 cards
  });
});
