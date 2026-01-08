// Skin system type definitions

export type SkinId = 'original' | 'cartoon';

// The original faction names used as keys in game data
export type OriginalFaction =
  | 'Crimson Covenant'
  | 'Iron Tide'
  | 'Void Legion'
  | 'Silk Network'
  | 'Dream Garden'
  | 'Ghost Protocol'
  | 'General';

export interface FactionTheme {
  displayName: string;      // Display name (can differ from game data key)
  emoji: string;            // Faction emoji
  faceUpBg: string;         // Tailwind classes for face-up background
  faceDownBg: string;       // Tailwind classes for face-down background
  border: string;           // Tailwind border class
  glow: string;             // Tailwind shadow/glow class
  browserColors: string;    // CardBrowser display colors
}

export interface SymbolTheme {
  any: string;
  mars: string;
  venus: string;
  mercury: string;
  moon: string;
}

export interface Skin {
  id: SkinId;
  displayName: string;
  description: string;
  icon: string;

  // Faction theming
  factions: Record<OriginalFaction, FactionTheme>;

  // Symbol emojis
  symbols: SymbolTheme;

  // Card name overrides (optional - if not present, use original name)
  cardNames?: Record<string, string>;

  // Image path function
  imagePath: (cardName: string) => string;

  // CSS class applied to root element
  cssClass: string;
}
