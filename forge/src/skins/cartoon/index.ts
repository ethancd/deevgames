import type { Skin, OriginalFaction, FactionTheme } from '../types';
import { CARTOON_CARD_NAMES } from './cardNames';

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const factions: Record<OriginalFaction, FactionTheme> = {
  'Crimson Covenant': {
    displayName: 'Strawberry Squad',
    emoji: '🍓',
    faceUpBg: 'bg-pink-100',
    faceDownBg: 'bg-gradient-to-br from-pink-300 to-red-300',
    border: 'border-pink-400',
    glow: 'shadow-pink-300/50',
    browserColors: 'border-pink-400 bg-pink-100',
  },
  'Iron Tide': {
    displayName: 'Robot Rangers',
    emoji: '🤖',
    faceUpBg: 'bg-sky-100',
    faceDownBg: 'bg-gradient-to-br from-sky-300 to-blue-300',
    border: 'border-sky-400',
    glow: 'shadow-sky-300/50',
    browserColors: 'border-sky-400 bg-sky-100',
  },
  'Void Legion': {
    displayName: 'Sparkle Sprites',
    emoji: '✨',
    faceUpBg: 'bg-violet-100',
    faceDownBg: 'bg-gradient-to-br from-violet-300 to-purple-300',
    border: 'border-violet-400',
    glow: 'shadow-violet-300/50',
    browserColors: 'border-violet-400 bg-violet-100',
  },
  'Silk Network': {
    displayName: 'Treasure Troop',
    emoji: '🎁',
    faceUpBg: 'bg-yellow-100',
    faceDownBg: 'bg-gradient-to-br from-yellow-300 to-amber-300',
    border: 'border-yellow-400',
    glow: 'shadow-yellow-300/50',
    browserColors: 'border-yellow-400 bg-yellow-100',
  },
  'Dream Garden': {
    displayName: 'Flower Friends',
    emoji: '🌸',
    faceUpBg: 'bg-green-100',
    faceDownBg: 'bg-gradient-to-br from-green-300 to-emerald-300',
    border: 'border-green-400',
    glow: 'shadow-green-300/50',
    browserColors: 'border-green-400 bg-green-100',
  },
  'Ghost Protocol': {
    displayName: 'Cloud Crew',
    emoji: '☁️',
    faceUpBg: 'bg-slate-100',
    faceDownBg: 'bg-gradient-to-br from-slate-200 to-blue-200',
    border: 'border-slate-300',
    glow: 'shadow-slate-200/50',
    browserColors: 'border-slate-300 bg-slate-100',
  },
  'General': {
    displayName: 'Supply Stars',
    emoji: '⭐',
    faceUpBg: 'bg-orange-100',
    faceDownBg: 'bg-gradient-to-br from-orange-200 to-amber-200',
    border: 'border-orange-300',
    glow: 'shadow-orange-200/50',
    browserColors: 'border-orange-300 bg-orange-100',
  },
};

export const cartoonSkin: Skin = {
  id: 'cartoon',
  displayName: 'Cartoon',
  description: 'Kid-friendly cartoon style',
  icon: '🌈',

  factions,

  symbols: {
    any: '🌟',
    mars: '❤️',
    venus: '💖',
    mercury: '💫',
    moon: '🌙',
  },

  cardNames: CARTOON_CARD_NAMES,

  imagePath: (cardName: string) => `${import.meta.env.BASE_URL}images-cartoon/${toKebabCase(cardName)}.png`,

  cssClass: 'skin-cartoon',
};
