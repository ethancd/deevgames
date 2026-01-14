import type { Element, PlayerId } from '../game/types';

export const ELEMENT_COLORS: Record<Element, { primary: string; secondary: string; text: string }> = {
  fire: {
    primary: 'bg-red-500',
    secondary: 'bg-red-300',
    text: 'text-red-500',
  },
  lightning: {
    primary: 'bg-yellow-500',
    secondary: 'bg-yellow-300',
    text: 'text-yellow-500',
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
    primary: 'bg-gray-500',
    secondary: 'bg-gray-300',
    text: 'text-gray-500',
  },
};

// Base colors (used in unit shop)
export const ELEMENT_HEX: Record<Element, string> = {
  fire: '#EF4444',
  lightning: '#EAB308',
  water: '#3B82F6',
  shadow: '#7C3AED',
  plant: '#22C55E',
  metal: '#6B7280',
};

// White player: lighter, pastel colors
export const ELEMENT_HEX_WHITE: Record<Element, string> = {
  fire: '#FCA5A5',      // lighter red/coral
  lightning: '#FDE047', // lighter yellow
  water: '#93C5FD',     // lighter blue
  shadow: '#C4B5FD',    // lighter purple/lavender
  plant: '#86EFAC',     // lighter green/mint
  metal: '#D1D5DB',     // lighter gray
};

// Black player: darker, more saturated colors
export const ELEMENT_HEX_BLACK: Record<Element, string> = {
  fire: '#B91C1C',      // deeper red
  lightning: '#A16207', // deeper amber/gold
  water: '#1D4ED8',     // deeper blue
  shadow: '#5B21B6',    // deeper purple
  plant: '#15803D',     // deeper green
  metal: '#374151',     // deeper gray
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
