// Emoji mappings for FORGE card game

export const FACTION_EMOJIS = {
  'Crimson Covenant': '🩸',  // blood drop
  'Iron Tide': '⚙️',          // gear
  'Void Legion': '🌀',        // spiral
  'Silk Network': '🕸️',       // spider web
  'Dream Garden': '🪷',       // lotus
  'Ghost Protocol': '👤',     // silhouette
  'General': '📦'             // box
} as const;

export type Faction = keyof typeof FACTION_EMOJIS;

export const SYMBOL_EMOJIS = {
  'any': '☉',      // circumpunct (replaces "any" in costs)
  'mars': '♂',     // existing
  'venus': '♀',    // existing
  'mercury': '☿',  // existing
  'moon': '☽'      // existing
} as const;

export const VP_CONDITION_EMOJIS = {
  // Core concepts
  'card': '🃏',
  'faction': '🏴',
  'symbol': '✦',

  // Game mechanics
  'counter-bid': '⚔️',
  'burn': '🔥',
  'ruins': '🏚️',
  'grid': '⊞',
  'opponent': '🎯',     // target (changed from 👤 which is now Ghost Protocol)
  'fewer': '↓',
  'more': '↑',

  // Comparisons
  'per': 'x',
  'if': 'if',
  'have': '+',
  'total': '∑',
  'unspent': '💎',

  // Numbers and counts
  'diversity': '🌈',  // for "factions represented" or "cards from N+ factions"
  'timing': '⏰',     // for "5th+ card"

  // VP itself
  'vp': '★'
} as const;

/**
 * Convert conditional VP text to emojified format
 * Examples:
 *   "+1 per Crimson Covenant card" → "★ x 🩸"
 *   "+3 if you have burned 3+ cards" → "3★ if 3+🔥"
 */
export function emojifyConditionalVP(conditionalVP: string): string {
  if (!conditionalVP) return '';

  // Extract VP amount from start
  const vpMatch = conditionalVP.match(/^\+?(\d+)/);
  const vpAmount = vpMatch ? vpMatch[1] : '';

  // Mapping of text patterns to emoji representations
  const patterns: Array<{ regex: RegExp; replacer: (match: RegExpMatchArray) => string }> = [
    // Faction-specific patterns
    { regex: /per Crimson Covenant card/i, replacer: () => `${vpAmount}★ x 🩸` },
    { regex: /per Iron Tide card/i, replacer: () => `${vpAmount}★ x ⚙️` },
    { regex: /per Void Legion card/i, replacer: () => `${vpAmount}★ x 🌀` },
    { regex: /per Silk Network card/i, replacer: () => `${vpAmount}★ x 🕸️` },
    { regex: /per Dream Garden card/i, replacer: () => `${vpAmount}★ x 🪷` },
    { regex: /per Ghost Protocol card/i, replacer: () => `${vpAmount}★ x 👤` },

    // Game mechanic patterns
    { regex: /per card you won by counter-bidding/i, replacer: () => `${vpAmount}★ x ⚔️` },
    { regex: /if you won a card by counter-bidding/i, replacer: () => `${vpAmount}★ if ⚔️` },
    { regex: /per ruins space in grid/i, replacer: () => `${vpAmount}★ x 🏚️` },
    { regex: /per card you burned this game/i, replacer: () => `${vpAmount}★ x 🔥` },
    { regex: /if you have burned (\d+)\+ cards/i, replacer: (m) => `${vpAmount}★ if ${m[1]}+🔥` },
    { regex: /if ≥(\d+) cards burned this game/i, replacer: (m) => `${vpAmount}★ if ≥${m[1]}🔥` },

    // Card count patterns
    { regex: /per card you have \(including this\)/i, replacer: () => `${vpAmount}★ x 🃏` },
    { regex: /if you have ≤(\d+) cards total/i, replacer: (m) => `${vpAmount}★ if ≤${m[1]} 🃏` },
    { regex: /per card fewer than opponent/i, replacer: () => `${vpAmount}★ x ↓🎯` },

    // Faction diversity patterns
    { regex: /per faction represented/i, replacer: () => `${vpAmount}★ x 🌈` },
    { regex: /per faction with 2\+ cards/i, replacer: () => `${vpAmount}★ x 🌈` },
    { regex: /if cards from (\d+)\+ factions/i, replacer: (m) => `${vpAmount}★ if ${m[1]}+🌈` },

    // Symbol patterns
    { regex: /if you have 1 of each symbol unspent/i, replacer: () => `${vpAmount}★ if 1ea💎` },
    { regex: /if you have 2 of each symbol unspent/i, replacer: () => `${vpAmount}★ if 2ea💎` },

    // Timing patterns
    { regex: /if this is your (\d+)th\+ card/i, replacer: (m) => `${vpAmount}★ if ${m[1]}+⏰` },
    { regex: /if this is your (\d+)\+ card/i, replacer: (m) => `${vpAmount}★ if ${m[1]}+⏰` },

    // Grid patterns
    { regex: /if ≤(\d+) cards remain face up in grid/i, replacer: (m) => `${vpAmount}★ if ≤${m[1]}⊞` },

    // Generic faction pattern
    { regex: /if you have another card of this faction/i, replacer: () => `${vpAmount}★ if +1🏴` },
  ];

  for (const { regex, replacer } of patterns) {
    const match = conditionalVP.match(regex);
    if (match) {
      return replacer(match);
    }
  }

  // Fallback: return original if no pattern matches
  return conditionalVP;
}

/**
 * Replace "any" with ☉ in symbol costs
 */
export function formatSymbolCost(symbols: string): string {
  if (!symbols) return 'Free';
  if (symbols === 'free') return 'Free';

  return symbols
    .replace(/any/g, '☉')
    .replace(/\s+/g, ' ')
    .trim();
}
