import type { Element, PlayerId } from '../game/types';

export const ELEMENT_COLORS: Record<Element, { primary: string; secondary: string; text: string }> = {
  fire: {
    primary: 'bg-rose-500',
    secondary: 'bg-rose-300',
    text: 'text-rose-500',
  },
  lightning: {
    primary: 'bg-yellow-400',
    secondary: 'bg-yellow-200',
    text: 'text-yellow-400',
  },
  water: {
    primary: 'bg-blue-500',
    secondary: 'bg-blue-300',
    text: 'text-blue-500',
  },
  shadow: {
    primary: 'bg-purple-600',
    secondary: 'bg-purple-400',
    text: 'text-purple-500',
  },
  plant: {
    primary: 'bg-green-500',
    secondary: 'bg-green-300',
    text: 'text-green-500',
  },
  metal: {
    primary: 'bg-orange-600',
    secondary: 'bg-orange-300',
    text: 'text-orange-500',
  },
};

// Base colors (used in unit shop)
export const ELEMENT_HEX: Record<Element, string> = {
  fire: '#FF6C79',
  lightning: '#F5EF55',
  water: '#3B82F6',
  shadow: '#7C3AED',
  plant: '#22C55E',
  metal: '#F2A54C',
};

// White player: lighter, pastel colors
export const ELEMENT_HEX_WHITE: Record<Element, string> = {
  fire: '#FF8B98',      // lighter ruby red
  lightning: '#FFF176', // lighter lemon yellow
  water: '#93C5FD',     // lighter blue
  shadow: '#C4B5FD',    // lighter purple/lavender
  plant: '#86EFAC',     // lighter green/mint
  metal: '#EAA361',     // polished copper on White pieces
};

// Black player: darker, more saturated colors
export const ELEMENT_HEX_BLACK: Record<Element, string> = {
  fire: '#B42343',      // deeper crimson red
  lightning: '#827600', // deeper yellow
  water: '#1D4ED8',     // deeper blue
  shadow: '#5B21B6',    // deeper purple
  plant: '#15803D',     // deeper green
  metal: '#934A18',     // burnished copper on Black pieces
};

export function getElementColor(element: Element): string {
  return ELEMENT_COLORS[element].primary;
}

export function getElementHex(element: Element): string {
  return ELEMENT_HEX[element];
}

/**
 * Get element color for a specific player
 * White player: lighter, pastel colors
 * Black player: darker, more saturated colors
 */
export function getElementHexForPlayer(element: Element, player: PlayerId): string {
  return player === 'white' ? ELEMENT_HEX_WHITE[element] : ELEMENT_HEX_BLACK[element];
}
