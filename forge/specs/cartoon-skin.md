# Cartoon Skin Feature Specification

## Overview

This spec describes the implementation of a secondary "cartoon" skin for the Forge card game that transforms all visual elements into kid-friendly, colorful cartoon versions while preserving all game mechanics and the ability to switch back to the original dark fantasy aesthetic.

## Goals

1. Create a complete alternate visual identity for the game
2. Make all visual elements (colors, art, names) kid-friendly and whimsical
3. Allow users to switch between skins seamlessly
4. Preserve the original theme as the default
5. Generate cartoon versions of all 66 card artworks

## Architecture

### Skin System Structure

```
src/
├── skins/
│   ├── types.ts                 # Skin type definitions
│   ├── SkinContext.tsx          # React context for skin state
│   ├── useSkin.ts               # Hook to access current skin
│   ├── original/
│   │   ├── index.ts             # Original skin export
│   │   ├── factions.ts          # Original faction definitions
│   │   ├── colors.ts            # Original color palette
│   │   └── prompts.ts           # Original image generation prompts
│   └── cartoon/
│       ├── index.ts             # Cartoon skin export
│       ├── factions.ts          # Cartoon faction definitions
│       ├── colors.ts            # Cartoon color palette
│       └── prompts.ts           # Cartoon image generation prompts
├── constants/
│   └── emojis.ts                # Updated to use skin context
```

### Skin Type Definition

```typescript
// src/skins/types.ts

export type SkinId = 'original' | 'cartoon';

export interface FactionTheme {
  name: string;           // Display name (can differ from game data key)
  emoji: string;          // Faction emoji
  faceUpBg: string;       // Tailwind classes for face-up background
  faceDownBg: string;     // Tailwind classes for face-down background
  border: string;         // Tailwind border class
  glow: string;           // Tailwind shadow/glow class
  browserColors: string;  // CardBrowser display colors
  accent: string;         // Accent color hex
}

export interface ColorPalette {
  // Core palette
  background: string;
  backgroundDeep: string;
  backgroundNebula: string;
  text: string;
  textMuted: string;

  // Faction colors
  crimson: string;
  crimsonLight: string;
  iron: string;
  ironLight: string;
  void: string;
  voidLight: string;
  silk: string;
  silkLight: string;
  dream: string;
  dreamLight: string;
  ghost: string;
  ghostLight: string;

  // Accents
  gold: string;
  bronze: string;
  silver: string;

  // Planetary symbols
  mars: string;
  venus: string;
  mercury: string;
  moon: string;
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

  // Visual theming
  factions: Record<OriginalFaction, FactionTheme>;
  colors: ColorPalette;
  symbols: SymbolTheme;

  // Typography
  fonts: {
    display: string;      // Headers, titles
    cardTitle: string;    // Card names
    body: string;         // Body text
  };

  // Image paths
  imagePath: (cardName: string) => string;

  // CSS class overrides
  cssClass: string;       // Applied to root element

  // Image generation
  stylePrefix: string;
  factionPrompts: Record<OriginalFaction, string>;
}

// The original faction names used as keys in game data
export type OriginalFaction =
  | 'Crimson Covenant'
  | 'Iron Tide'
  | 'Void Legion'
  | 'Silk Network'
  | 'Dream Garden'
  | 'Ghost Protocol'
  | 'General';
```

---

## Faction Mapping

### Original Factions (Default)

| Faction Key | Display Name | Emoji | Theme |
|-------------|--------------|-------|-------|
| Crimson Covenant | Crimson Covenant | 🩸 | Blood magic, biological horror |
| Iron Tide | Iron Tide | ⚙️ | Industrial warfare, machines |
| Void Legion | Void Legion | 🌀 | Cosmic horror, reality-breaking |
| Silk Network | Silk Network | 🕸️ | Wealth, espionage, gold |
| Dream Garden | Dream Garden | 🪷 | Nature mysticism, flora |
| Ghost Protocol | Ghost Protocol | 👤 | Stealth, digital warfare |
| General | General | 📦 | Neutral resources |

### Cartoon Factions

| Faction Key | Display Name | Emoji | Theme |
|-------------|--------------|-------|-------|
| Crimson Covenant | Strawberry Squad | 🍓 | Berry friends, garden helpers |
| Iron Tide | Robot Rangers | 🤖 | Friendly robots, builders |
| Void Legion | Sparkle Sprites | ✨ | Glitter, rainbows, magic |
| Silk Network | Treasure Troop | 🎁 | Gift-giving, sharing |
| Dream Garden | Flower Friends | 🌸 | Happy plants, garden pals |
| Ghost Protocol | Cloud Crew | ☁️ | Fluffy clouds, hide-and-seek |
| General | Supply Stars | ⭐ | Helpful items, tools |

---

## Color Palettes

### Original Palette (Current)

```css
:root {
  /* Cosmic color palette */
  --cosmic-void: #0a0a0f;
  --cosmic-deep: #121218;
  --cosmic-nebula: #1a1a2e;
  --cosmic-star: #eee8d5;

  /* Faction colors - dark, moody */
  --crimson: #8B0000;
  --iron: #4A5568;
  --void: #4C1D95;
  --silk: #B7791F;
  --dream: #065F46;
  --ghost: #1F2937;
}
```

### Cartoon Palette

```css
:root.skin-cartoon {
  /* Bright, cheerful base */
  --cosmic-void: #FFF5E6;      /* Warm cream background */
  --cosmic-deep: #FFE4CC;       /* Soft peach */
  --cosmic-nebula: #E8F4FD;     /* Light sky blue */
  --cosmic-star: #2D3748;       /* Dark text for contrast */

  /* Faction colors - bright, saturated, kid-friendly */
  --crimson: #FF6B9D;           /* Strawberry pink */
  --crimson-light: #FF8FB3;
  --iron: #5BB5E0;              /* Robot blue */
  --iron-light: #7EC8ED;
  --void: #B794F6;              /* Sparkle purple */
  --void-light: #D6BCFA;
  --silk: #FFD93D;              /* Treasure gold/yellow */
  --silk-light: #FFE566;
  --dream: #7ED957;             /* Grass green */
  --dream-light: #9EE879;
  --ghost: #A8D5E5;             /* Cloud blue */
  --ghost-light: #C5E4EF;

  /* Accents - playful */
  --gold: #FFD700;
  --bronze: #FFA07A;            /* Light salmon */
  --silver: #E0E0E0;

  /* Planetary symbols - bright */
  --mars: #FF7675;              /* Coral red */
  --venus: #FD79A8;             /* Pink */
  --mercury: #FFEAA7;           /* Soft yellow */
  --moon: #81ECEC;              /* Turquoise */
}
```

---

## Symbol Mapping

### Original Symbols

```typescript
export const SYMBOL_EMOJIS = {
  'any': '☉',      // circumpunct
  'mars': '♂',     // male symbol
  'venus': '♀',    // female symbol
  'mercury': '☿',  // mercury symbol
  'moon': '☽'      // crescent moon
};
```

### Cartoon Symbols

```typescript
export const CARTOON_SYMBOL_EMOJIS = {
  'any': '🌟',     // star
  'mars': '❤️',    // heart (action/courage)
  'venus': '💖',   // sparkling heart (love/beauty)
  'mercury': '💫', // dizzy star (speed/cleverness)
  'moon': '🌙'     // crescent moon (dreams/night)
};
```

---

## Typography

### Original Fonts

```css
/* Headers, UI titles */
font-family: 'Cinzel', serif;

/* Card titles */
font-family: 'Crimson Pro', serif;

/* Body text */
font-family: 'Epilogue', sans-serif;
```

### Cartoon Fonts

```css
/* Headers, UI titles - playful rounded */
font-family: 'Fredoka', sans-serif;

/* Card titles - friendly bold */
font-family: 'Nunito', sans-serif;

/* Body text - clean, readable */
font-family: 'Quicksand', sans-serif;
```

**Font Loading (add to index.html):**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700&family=Quicksand:wght@400;500;600&display=swap" rel="stylesheet">
```

---

## Image Generation Prompts

### Original Style Prefix

```typescript
const ORIGINAL_STYLE_PREFIX = `
Square 1:1 aspect ratio. No text, letters, words, or writing of any kind.
Painterly digital illustration with rich detail. Dark fantasy meets cosmic horror.
Strong use of dramatic chiaroscuro lighting. Deep shadows with strategic illumination...
`;
```

### Cartoon Style Prefix

```typescript
const CARTOON_STYLE_PREFIX = `
Square 1:1 aspect ratio. No text, letters, words, or writing of any kind.
Bright, cheerful cartoon illustration in a modern animated style.
Soft rounded shapes, friendly characters, vibrant saturated colors.
Clean linework with subtle shading. Whimsical and playful atmosphere.
Style inspired by modern children's animation (Bluey, Hilda, Steven Universe).
Kid-friendly imagery only - no scary elements, weapons shown as toys.
Warm lighting, pastel accents, everything looks huggable and inviting.
`;
```

### Cartoon Faction Prompts

```typescript
const CARTOON_FACTION_THEMES: Record<OriginalFaction, string> = {
  'Crimson Covenant': `
    Berry-themed friends! Cute strawberry characters, cherry companions,
    raspberry helpers. Red and pink color scheme with green leaf accents.
    Garden setting with berry bushes, jam jars as treasures, fruit baskets.
    Everything looks sweet and delicious. Friendly expressions, rosy cheeks.
  `,

  'Iron Tide': `
    Friendly robot friends! Cute mechanical helpers with expressive LED eyes,
    chrome bodies with colorful buttons and dials. Workshop settings with
    gears, wrenches, and building blocks. Constructive and helpful vibes.
    Robots that build, fix, and create. Shiny metal with rainbow reflections.
  `,

  'Void Legion': `
    Magical sparkle sprites! Glittery fairy-like creatures made of stardust.
    Rainbow colors, iridescent wings, trails of sparkles and glitter.
    Magical effects like floating crystals, prisms, light beams.
    Cosmic but friendly - cute aliens, smiling stars, playful comets.
  `,

  'Silk Network': `
    Treasure friends and gift-givers! Characters carrying presents, treasure
    chests full of toys, golden coins that look like chocolate. Party
    atmosphere with ribbons, bows, and wrapped gifts. Sharing and generosity
    themes. Warm yellows and golds with festive accents.
  `,

  'Dream Garden': `
    Happy flower friends! Smiling sunflowers, dancing daisies, friendly
    butterflies and bees. Lush garden settings with rainbows, watering cans,
    garden tools as fun items. Bright greens, cheerful yellows, soft pinks.
    Nature that looks alive and friendly. Cozy garden vibes.
  `,

  'Ghost Protocol': `
    Fluffy cloud buddies! Soft puffy clouds with cute faces, floating
    through blue skies. Hide-and-seek themes with clouds playing games.
    Gentle mist, soft grays and whites with sky blue accents.
    Cozy blanket forts, pillow castles, soft and comforting imagery.
  `,

  'General': `
    Helpful supply stars! Floating star-shaped helpers carrying useful items.
    Backpacks, lunchboxes, craft supplies, building materials - all cute
    and appealing. Neutral but cheerful colors. Rainbow star trails.
    Everything looks ready for an adventure or craft project.
  `
};
```

---

## Card Name Transformations

For a complete cartoon experience, card names should also be transformed. This mapping preserves the original card key while displaying a cartoon-friendly name.

### Example Transformations

| Original Name | Cartoon Name | Original Faction | Cartoon Faction |
|--------------|--------------|------------------|-----------------|
| Bloodthorn Seedling | Berry Sprout | Crimson Covenant | Strawberry Squad |
| Soul Harvest | Berry Picking | Crimson Covenant | Strawberry Squad |
| Plague Engine | Helper Bot | Iron Tide | Robot Rangers |
| Siege Breaker | Builder Buddy | Iron Tide | Robot Rangers |
| Reality Fracture | Rainbow Burst | Void Legion | Sparkle Sprites |
| Mind Shatter | Glitter Shower | Void Legion | Sparkle Sprites |
| Shadow Broker | Gift Giver | Silk Network | Treasure Troop |
| Information War | Sharing Time | Silk Network | Treasure Troop |
| Thornweave Guardian | Flower Keeper | Dream Garden | Flower Friends |
| Spore Cloud | Pollen Puff | Dream Garden | Flower Friends |
| Phantom Strike | Cloud Dash | Ghost Protocol | Cloud Crew |
| Memory Wipe | Naptime | Ghost Protocol | Cloud Crew |

**Full mapping file:** Create `src/skins/cartoon/cardNames.ts` with all 66 card name mappings.

---

## Image Path Strategy

### Directory Structure

```
public/
├── images/                    # Original dark fantasy art
│   ├── bloodthorn-seedling.png
│   ├── soul-harvest.png
│   └── ...
└── images-cartoon/            # Cartoon art
    ├── bloodthorn-seedling.png  # Same filename, different folder
    ├── soul-harvest.png
    └── ...
```

### Path Resolution

```typescript
// In skin definition
const originalSkin: Skin = {
  // ...
  imagePath: (cardName: string) => `/images/${toKebabCase(cardName)}.png`,
};

const cartoonSkin: Skin = {
  // ...
  imagePath: (cardName: string) => `/images-cartoon/${toKebabCase(cardName)}.png`,
};
```

---

## Implementation

### Skin Context Provider

```typescript
// src/skins/SkinContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { SkinId, Skin } from './types';
import { originalSkin } from './original';
import { cartoonSkin } from './cartoon';

const SKINS: Record<SkinId, Skin> = {
  original: originalSkin,
  cartoon: cartoonSkin,
};

const STORAGE_KEY = 'forge-skin-preference';

interface SkinContextValue {
  skinId: SkinId;
  skin: Skin;
  setSkin: (id: SkinId) => void;
  availableSkins: SkinId[];
}

const SkinContext = createContext<SkinContextValue | null>(null);

export function SkinProvider({ children }: { children: React.ReactNode }) {
  const [skinId, setSkinId] = useState<SkinId>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored === 'cartoon' ? 'cartoon' : 'original') as SkinId;
  });

  const setSkin = (id: SkinId) => {
    setSkinId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  useEffect(() => {
    // Apply skin class to document root
    document.documentElement.classList.remove('skin-original', 'skin-cartoon');
    document.documentElement.classList.add(`skin-${skinId}`);
  }, [skinId]);

  return (
    <SkinContext.Provider value={{
      skinId,
      skin: SKINS[skinId],
      setSkin,
      availableSkins: Object.keys(SKINS) as SkinId[],
    }}>
      {children}
    </SkinContext.Provider>
  );
}

export function useSkin() {
  const context = useContext(SkinContext);
  if (!context) {
    throw new Error('useSkin must be used within a SkinProvider');
  }
  return context;
}
```

### Hook Usage Example

```typescript
// In any component
import { useSkin } from '../skins/SkinContext';

function Card({ card }: { card: CardType }) {
  const { skin } = useSkin();
  const factionTheme = skin.factions[card.faction];
  const imagePath = skin.imagePath(card.name);
  const displayName = skin.cardNames?.[card.name] ?? card.name;

  return (
    <div className={`${factionTheme.faceUpBg} ${factionTheme.border}`}>
      <img src={imagePath} alt={displayName} />
      <h3 style={{ fontFamily: skin.fonts.cardTitle }}>
        {displayName}
      </h3>
      <span>{factionTheme.emoji}</span>
    </div>
  );
}
```

### Settings UI Component

```typescript
// src/components/SkinSelector.tsx
import { useSkin } from '../skins/SkinContext';

export function SkinSelector() {
  const { skinId, setSkin, availableSkins } = useSkin();

  return (
    <div className="skin-selector">
      <label>Game Theme:</label>
      <div className="skin-options">
        {availableSkins.map(id => (
          <button
            key={id}
            onClick={() => setSkin(id)}
            className={skinId === id ? 'active' : ''}
          >
            {id === 'original' ? '🌑 Dark Fantasy' : '🌈 Cartoon'}
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## CSS Structure

### Root Skin Switching

```css
/* src/index.css */

/* ===== ORIGINAL SKIN (Default) ===== */
:root,
:root.skin-original {
  /* Cosmic color palette */
  --cosmic-void: #0a0a0f;
  --cosmic-deep: #121218;
  --cosmic-nebula: #1a1a2e;
  --cosmic-star: #eee8d5;

  /* Faction colors */
  --crimson: #8B0000;
  --crimson-light: #DC143C;
  /* ... rest of original palette ... */

  /* Typography */
  --font-display: 'Cinzel', serif;
  --font-card-title: 'Crimson Pro', serif;
  --font-body: 'Epilogue', sans-serif;

  /* Effects */
  --glow-intensity: 0.5;
  --border-style: solid;
}

/* ===== CARTOON SKIN ===== */
:root.skin-cartoon {
  /* Bright cheerful palette */
  --cosmic-void: #FFF5E6;
  --cosmic-deep: #FFE4CC;
  --cosmic-nebula: #E8F4FD;
  --cosmic-star: #2D3748;

  /* Faction colors - bright */
  --crimson: #FF6B9D;
  --crimson-light: #FF8FB3;
  /* ... rest of cartoon palette ... */

  /* Typography */
  --font-display: 'Fredoka', sans-serif;
  --font-card-title: 'Nunito', sans-serif;
  --font-body: 'Quicksand', sans-serif;

  /* Effects - softer, friendlier */
  --glow-intensity: 0.3;
  --border-style: solid;
  --border-radius-modifier: 1.5;  /* Rounder corners */
}

/* Skin-specific overrides */
.skin-cartoon .card {
  border-radius: calc(0.5rem * var(--border-radius-modifier, 1));
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);  /* Softer shadows */
}

.skin-cartoon .glass-panel {
  background: rgba(255, 255, 255, 0.8);
  border: 2px solid rgba(0, 0, 0, 0.1);
}
```

---

## Image Generation Script Updates

### Updated Script Structure

```typescript
// scripts/generate-images.ts

import { originalPrompts } from '../src/skins/original/prompts';
import { cartoonPrompts } from '../src/skins/cartoon/prompts';

type SkinType = 'original' | 'cartoon';

async function generateImages(skin: SkinType = 'original') {
  const prompts = skin === 'cartoon' ? cartoonPrompts : originalPrompts;
  const outputDir = skin === 'cartoon' ? 'public/images-cartoon' : 'public/images';

  // ... existing generation logic with prompts.stylePrefix and prompts.factionThemes
}

// CLI usage: npx tsx scripts/generate-images.ts --skin=cartoon
```

---

## Feature Flag / Environment Variable

For development and gradual rollout:

```typescript
// src/config.ts
export const CONFIG = {
  ENABLE_CARTOON_SKIN: import.meta.env.VITE_ENABLE_CARTOON_SKIN === 'true',
  DEFAULT_SKIN: (import.meta.env.VITE_DEFAULT_SKIN || 'original') as SkinId,
};
```

```bash
# .env
VITE_ENABLE_CARTOON_SKIN=true
VITE_DEFAULT_SKIN=original
```

---

## Migration Checklist

### Phase 1: Infrastructure
- [ ] Create `src/skins/` directory structure
- [ ] Define skin types in `src/skins/types.ts`
- [ ] Create SkinContext and useSkin hook
- [ ] Extract current styles into `src/skins/original/`

### Phase 2: Refactor Existing Code
- [ ] Update `Card.tsx` to use skin context
- [ ] Update `CardModal.tsx` to use skin context
- [ ] Update `CardBrowser.tsx` to use skin context
- [ ] Update `BidModal.tsx` to use skin context
- [ ] Update emoji constants to be skin-aware
- [ ] Add CSS custom properties for all skin-variable values

### Phase 3: Cartoon Skin Definition
- [ ] Create `src/skins/cartoon/factions.ts`
- [ ] Create `src/skins/cartoon/colors.ts`
- [ ] Create `src/skins/cartoon/prompts.ts`
- [ ] Create `src/skins/cartoon/cardNames.ts` (all 66 mappings)
- [ ] Add cartoon fonts to index.html

### Phase 4: Cartoon Assets
- [ ] Update image generation script for skin support
- [ ] Generate all 66 cartoon card images
- [ ] Create `public/images-cartoon/` directory
- [ ] Verify all images render correctly

### Phase 5: UI & Polish
- [ ] Create SkinSelector component
- [ ] Add skin toggle to settings/menu
- [ ] Test skin switching in all game states
- [ ] Add skin preference persistence
- [ ] Add transition animations for skin switching

### Phase 6: Testing
- [ ] Unit tests for skin context
- [ ] Visual regression tests for both skins
- [ ] Test all game flows in cartoon mode
- [ ] Accessibility testing for color contrast
- [ ] Mobile responsive testing

---

## Appendix A: Complete Cartoon Card Names

```typescript
// src/skins/cartoon/cardNames.ts

export const CARTOON_CARD_NAMES: Record<string, string> = {
  // Crimson Covenant → Strawberry Squad
  'Bloodthorn Seedling': 'Berry Sprout',
  'Soul Harvest': 'Berry Picking Time',
  'Crimson Ritualist': 'Jam Maker',
  'Plague Blossom': 'Flower Crown',
  'Blood Sculptor': 'Play-Doh Artist',
  'Covenant Elder': 'Grandma Strawberry',
  'Marrow Drain': 'Juice Box',
  'Thornweave Assassin': 'Berry Ninja',
  'Genesis Engine': 'Smoothie Blender',

  // Iron Tide → Robot Rangers
  'Forge Apprentice': 'Repair Bot Jr.',
  'Siege Breaker': 'Builder Buddy',
  'Plague Engine': 'Helper Machine',
  'Iron Vanguard': 'Robot Guard',
  'Scrap Reclaimer': 'Recycling Robot',
  'Manufactory Node': 'Toy Factory',
  'Cannon Golem': 'Bubble Blaster Bot',
  'Assembly Line': 'Building Station',
  'War Foundry': 'Fun Factory',

  // Void Legion → Sparkle Sprites
  'Reality Fracture': 'Rainbow Burst',
  'Mind Shatter': 'Glitter Shower',
  'Void Touched': 'Sparkle Friend',
  'Dimensional Rift': 'Magic Portal',
  'Entropy Weaver': 'Glitter Fairy',
  'Legion Commander': 'Sparkle Captain',
  'Null Field': 'Bubble Shield',
  'Cosmic Horror': 'Space Unicorn',
  'Void Singularity': 'Wishing Star',

  // Silk Network → Treasure Troop
  'Shadow Broker': 'Gift Giver',
  'Information War': 'Sharing Time',
  'Gold Hoarding': 'Piggy Bank',
  'Merchant Prince': 'Toy Shop Owner',
  'Spy Network': 'Secret Friends',
  'Silk Weaver': 'Ribbon Crafter',
  'Trade Embargo': 'Trading Cards',
  'Market Crash': 'Toy Swap',
  'Silk Matriarch': 'Party Planner',

  // Dream Garden → Flower Friends
  'Thornweave Guardian': 'Sunflower Guard',
  'Spore Cloud': 'Pollen Puff',
  'Living Grove': 'Happy Garden',
  'Dream Walker': 'Garden Explorer',
  'Bloom Tender': 'Flower Helper',
  'Verdant Awakening': 'Spring Morning',
  'Root Network': 'Underground Friends',
  'Garden Sentinel': 'Scarecrow Buddy',
  'World Tree': 'Friendship Tree',

  // Ghost Protocol → Cloud Crew
  'Phantom Strike': 'Cloud Dash',
  'Memory Wipe': 'Naptime',
  'Ghost Agent': 'Cloud Buddy',
  'Shadow Walk': 'Hide and Seek',
  'Protocol Override': 'Rule Change',
  'Digital Ghost': 'Invisible Friend',
  'Null Cipher': 'Secret Code',
  'Phantom Network': 'Cloud Castle',
  'Ghost Director': 'Pillow Fort King',

  // General → Supply Stars
  'Supply Cache': 'Treasure Chest',
  'Neutral Ground': 'Playground',
  'War Profiteer': 'Toy Collector',
  'Mercenary Band': 'Adventure Team',
  'Battlefield Salvage': 'Found Treasures',
  'Diplomatic Envoy': 'Friendly Messenger',
  'Resource Surge': 'Snack Time',
  'Tactical Retreat': 'Time Out',
  'Wild Magic': 'Surprise Magic',
  'Chaos Storm': 'Confetti Cannon',
  'Primordial Soup': 'Rainbow Puddle',
  'Universal Constant': 'Best Friend Forever',
};
```

---

## Appendix B: Accessibility Considerations

### Color Contrast Requirements

All cartoon colors should maintain WCAG AA compliance (4.5:1 for normal text, 3:1 for large text):

| Element | Foreground | Background | Ratio |
|---------|------------|------------|-------|
| Card text | #2D3748 | #FFF5E6 | 9.5:1 ✓ |
| Faction labels | #2D3748 | Various faction BGs | Min 4.5:1 ✓ |
| Buttons | #2D3748 | #FFD93D | 7.2:1 ✓ |

### Motion Considerations

- Respect `prefers-reduced-motion` for skin transition animations
- Keep cartoon animations subtle and non-distracting
- Avoid flashing or rapid color changes

---

## Appendix C: Future Considerations

### Additional Skin Ideas

1. **Retro Pixel** - 8-bit/16-bit aesthetic
2. **Noir** - Black and white with accent colors
3. **Neon Cyberpunk** - Bright neons on dark backgrounds
4. **Seasonal** - Holiday-themed variations

### User-Created Skins

Future architecture could support user-uploaded skin packages:
- JSON configuration for colors and names
- Custom image folders
- Skin marketplace/sharing

### Accessibility Skins

- High contrast mode
- Colorblind-friendly palettes
- Simplified visual mode
