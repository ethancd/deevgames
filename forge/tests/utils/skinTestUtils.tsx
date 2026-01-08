// Test utilities for skin-aware component testing
import { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { SkinProvider } from '../../src/skins/SkinContext';
import type { SkinId } from '../../src/skins/types';

// Mock localStorage for tests
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

// Replace global localStorage with mock
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

interface SkinWrapperOptions {
  skinId?: SkinId;
}

/**
 * Creates a wrapper component with SkinProvider configured for a specific skin
 */
export function createSkinWrapper(options: SkinWrapperOptions = {}) {
  const { skinId = 'original' } = options;

  // Set up localStorage before rendering
  mockLocalStorage.setItem('forge-skin-preference', skinId);

  return function SkinWrapper({ children }: { children: ReactNode }) {
    return <SkinProvider>{children}</SkinProvider>;
  };
}

/**
 * Renders a component with SkinProvider wrapper for a specific skin
 */
export function renderWithSkin(
  ui: React.ReactElement,
  skinId: SkinId = 'original',
  options?: Omit<RenderOptions, 'wrapper'>
) {
  // Set up localStorage before rendering
  mockLocalStorage.setItem('forge-skin-preference', skinId);

  return render(ui, {
    wrapper: ({ children }) => <SkinProvider>{children}</SkinProvider>,
    ...options,
  });
}

/**
 * Renders a component with cartoon skin
 */
export function renderWithCartoonSkin(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return renderWithSkin(ui, 'cartoon', options);
}

/**
 * Renders a component with original skin
 */
export function renderWithOriginalSkin(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return renderWithSkin(ui, 'original', options);
}

/**
 * Clears the skin preference from localStorage
 */
export function clearSkinPreference() {
  mockLocalStorage.removeItem('forge-skin-preference');
}

/**
 * Resets localStorage to clean state
 */
export function resetLocalStorage() {
  mockLocalStorage.clear();
}

// Test data: Sample cards for skin testing
export const testCards = {
  crimsonCard: {
    id: 'test-crimson',
    name: 'Bloodthorn Seedling',
    faction: 'Crimson Covenant' as const,
    symbols: '♂',
    baseVP: 1,
    cost: 1,
    conditionalVP: '+1 VP per Crimson card',
  },
  ironCard: {
    id: 'test-iron',
    name: 'Raid Scout',
    faction: 'Iron Tide' as const,
    symbols: '♂',
    baseVP: 1,
    cost: 1,
  },
  voidCard: {
    id: 'test-void',
    name: 'Null Shard',
    faction: 'Void Legion' as const,
    symbols: '☿',
    baseVP: 0,
    cost: 1,
  },
  silkCard: {
    id: 'test-silk',
    name: 'Trade Contact',
    faction: 'Silk Network' as const,
    symbols: '♀',
    baseVP: 1,
    cost: 1,
  },
  dreamCard: {
    id: 'test-dream',
    name: 'Seedling Shrine',
    faction: 'Dream Garden' as const,
    symbols: '☽',
    baseVP: 0,
    cost: 1,
  },
  ghostCard: {
    id: 'test-ghost',
    name: 'Data Fragment',
    faction: 'Ghost Protocol' as const,
    symbols: '☿',
    baseVP: 0,
    cost: 1,
  },
  generalCard: {
    id: 'test-general',
    name: 'Supply Cache',
    faction: 'General' as const,
    symbols: '☉',
    baseVP: 2,
    cost: 1,
  },
};

// Expected cartoon names for test cards
export const expectedCartoonNames = {
  'Bloodthorn Seedling': 'Berry Sprout',
  'Raid Scout': 'Scout Bot',
  'Null Shard': 'Magic Crystal',
  'Trade Contact': 'Toy Shop',
  'Seedling Shrine': 'Little Garden',
  'Data Fragment': 'Cloud Puff',
  'Supply Cache': 'Treasure Drop',
};

// Expected cartoon faction names
export const expectedCartoonFactionNames = {
  'Crimson Covenant': 'Strawberry Squad',
  'Iron Tide': 'Robot Rangers',
  'Void Legion': 'Sparkle Sprites',
  'Silk Network': 'Treasure Troop',
  'Dream Garden': 'Flower Friends',
  'Ghost Protocol': 'Cloud Crew',
  'General': 'Supply Stars',
};

// Expected cartoon faction emojis
export const expectedCartoonEmojis = {
  'Crimson Covenant': '🍓',
  'Iron Tide': '🤖',
  'Void Legion': '✨',
  'Silk Network': '🎁',
  'Dream Garden': '🌸',
  'Ghost Protocol': '☁️',
  'General': '⭐',
};

// Expected original faction emojis
export const expectedOriginalEmojis = {
  'Crimson Covenant': '🩸',
  'Iron Tide': '⚙️',
  'Void Legion': '🌀',
  'Silk Network': '🕸️',
  'Dream Garden': '🪷',
  'Ghost Protocol': '👤',
  'General': '📦',
};

// Expected cartoon symbol emojis
export const expectedCartoonSymbols = {
  any: '🌟',
  mars: '❤️',
  venus: '💖',
  mercury: '💫',
  moon: '🌙',
};

// Expected original symbol emojis
export const expectedOriginalSymbols = {
  any: '☉',
  mars: '♂',
  venus: '♀',
  mercury: '☿',
  moon: '☽',
};
