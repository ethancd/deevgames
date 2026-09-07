import type { Skin, OriginalFaction, FactionTheme } from '../types';

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const factions: Record<OriginalFaction, FactionTheme> = {
  'Crimson Covenant': {
    displayName: 'Crimson Covenant',
    emoji: '🩸',
    faceUpBg: 'bg-red-950/20',
    faceDownBg: 'bg-gradient-to-br from-red-950 to-red-900',
    border: 'border-red-700',
    glow: 'shadow-red-900/50',
    browserColors: 'border-red-700 bg-red-950/30',
  },
  'Iron Tide': {
    displayName: 'Iron Tide',
    emoji: '⚙️',
    faceUpBg: 'bg-slate-700/20',
    faceDownBg: 'bg-gradient-to-br from-slate-800 to-slate-700',
    border: 'border-slate-500',
    glow: 'shadow-slate-700/50',
    browserColors: 'border-slate-500 bg-slate-800/30',
  },
  'Void Legion': {
    displayName: 'Void Legion',
    emoji: '🌀',
    faceUpBg: 'bg-purple-950/20',
    faceDownBg: 'bg-gradient-to-br from-black via-purple-950 to-black',
    border: 'border-purple-600',
    glow: 'shadow-purple-900/50',
    browserColors: 'border-purple-600 bg-purple-950/30',
  },
  'Silk Network': {
    displayName: 'Silk Network',
    emoji: '🕸️',
    faceUpBg: 'bg-amber-800/20',
    faceDownBg: 'bg-gradient-to-br from-amber-900 to-yellow-800',
    border: 'border-amber-600',
    glow: 'shadow-amber-800/50',
    browserColors: 'border-amber-600 bg-amber-900/30',
  },
  'Dream Garden': {
    displayName: 'Dream Garden',
    emoji: '🪷',
    faceUpBg: 'bg-teal-900/20',
    faceDownBg: 'bg-gradient-to-br from-teal-950 to-teal-800',
    border: 'border-teal-600',
    glow: 'shadow-teal-900/50',
    browserColors: 'border-teal-600 bg-teal-950/30',
  },
  'Ghost Protocol': {
    displayName: 'Ghost Protocol',
    emoji: '👤',
    faceUpBg: 'bg-slate-700/20',
    faceDownBg: 'bg-gradient-to-br from-slate-900 to-slate-800',
    border: 'border-slate-500',
    glow: 'shadow-slate-800/50',
    browserColors: 'border-slate-500 bg-slate-900/30',
  },
  'General': {
    displayName: 'General',
    emoji: '📦',
    faceUpBg: 'bg-stone-700/20',
    faceDownBg: 'bg-gradient-to-br from-stone-800 to-stone-700',
    border: 'border-stone-500',
    glow: 'shadow-stone-700/50',
    browserColors: 'border-stone-500 bg-stone-800/30',
  },
};

export const originalSkin: Skin = {
  id: 'original',
  displayName: 'Dark Fantasy',
  description: 'The original cosmic horror aesthetic',
  icon: '🌑',

  factions,

  symbols: {
    any: '☉',
    mars: '♂',
    venus: '♀',
    mercury: '☿',
    moon: '☽',
  },

  // No card name overrides - use original names
  cardNames: undefined,

  imagePath: (cardName: string) => `${import.meta.env.BASE_URL}images/${toKebabCase(cardName)}.png`,

  cssClass: 'skin-original',
};
