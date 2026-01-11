import type { Element } from '../game/types';

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
  wind: {
    primary: 'bg-cyan-400',
    secondary: 'bg-cyan-200',
    text: 'text-cyan-400',
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

export const ELEMENT_HEX: Record<Element, string> = {
  fire: '#EF4444',
  lightning: '#EAB308',
  water: '#3B82F6',
  wind: '#22D3EE',
  plant: '#22C55E',
  metal: '#6B7280',
};

export function getElementColor(element: Element): string {
  return ELEMENT_COLORS[element].primary;
}

export function getElementHex(element: Element): string {
  return ELEMENT_HEX[element];
}
