# FORGE Card UI Specification

## 0. ASCII Layout Mockups

### Desktop Layout (>768px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ⚔ FORGE ⚔                                            Player: P1   VP: 12    │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────┐ ┌───────────────────────────────────┐
│  Card Grid (scrollable v+h)         │ │  Card Modal (fixed side panel)    │
│                                     │ │                                   │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐    │ │  ┌─────────────────────────────┐  │
│  │ ⚙ │ │   │ │ 👻│ │   │ │ 🩸│    │ │  │                             │  │
│  │   │ │Foo│ │   │ │Bar│ │   │    │ │  │      [Artwork Space]        │  │
│  │   │ │⚙  │ │   │ │🩸 │ │   │    │ │  │                             │  │
│  │   │ │2 ★│ │   │ │3 ★│ │   │    │ │  └─────────────────────────────┘  │
│  └───┘ └───┘ └───┘ └───┘ └───┘    │ │                                   │
│                                     │ │  Iron Agent                       │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐    │ │  Iron Tide  ⚙                    │
│  │   │ │RUN│ │   │ │   │ │   │    │ │                                   │
│  │Baz│ │   │ │🐍 │ │   │ │   │    │ │  Cost: ♂☀                        │
│  │👻 │ │   │ │   │ │   │ │   │    │ │  2 ★                             │
│  │1 ★│ │   │ │   │ │   │ │   │    │ │                                   │
│  └───┘ └───┘ └───┘ └───┘ └───┘    │ │  Speed: moves 2 spaces            │
│                                     │ │                                   │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐          │ │  ┌──────────┐  ┌──────────┐      │
│  │   │ │   │ │   │ │   │          │ │  │   Bid    │  │   Burn   │      │
│  │   │ │   │ │   │ │   │          │ │  └──────────┘  └──────────┘      │
│  │   │ │   │ │   │ │   │          │ │                                   │
│  └───┘ └───┘ └───┘ └───┘          │ └───────────────────────────────────┘
│                                     │
└─────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  Your Pool:  ♂ ♂ ♀ ☿ ☽                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mobile Layout (≤768px)

```
┌─────────────────────────┐
│  ⚔ FORGE ⚔              │
│  Player: P1   VP: 12    │
└─────────────────────────┘

┌─────────────────────────┐
│ Grid (scroll v+h)       │
│                         │
│ ┌───┐ ┌───┐ ┌───┐      │
│ │ ⚙ │ │   │ │ 👻│      │
│ │   │ │Foo│ │   │      │
│ │   │ │⚙  │ │   │      │
│ │   │ │2 ★│ │   │      │
│ └───┘ └───┘ └───┘      │
│                         │
│ ┌───┐ ┌───┐ ┌───┐      │
│ │   │ │RUN│ │   │      │
│ │Baz│ │   │ │🐍 │      │
│ │👻 │ │   │ │   │      │
│ │1 ★│ │   │ │   │      │
│ └───┘ └───┘ └───┘      │
└─────────────────────────┘

┌─────────────────────────┐
│ Your Pool:  ♂ ♀ ☿ ☽    │
└─────────────────────────┘

[When card clicked, modal overlays entire screen]

┌─────────────────────────┐
│ ╔═══════════════════╗   │
│ ║  [Artwork Space]  ║   │
│ ║                   ║   │
│ ║                   ║   │
│ ╚═══════════════════╝   │
│                         │
│ Iron Agent              │
│ Iron Tide  ⚙           │
│                         │
│ Cost: ♂☀               │
│ 2 ★                    │
│                         │
│ Speed: moves 2 spaces   │
│                         │
│ ┌─────────┐ ┌─────────┐│
│ │   Bid   │ │  Burn   ││
│ └─────────┘ └─────────┘│
│                         │
│      [X Close]          │
└─────────────────────────┘
```

### Card States

```
Face-Down Card:          Face-Up Card:
┌──────────┐            ┌──────────┐
│          │            │  Foo Bar │
│          │            │  ⚙       │
│    ⚙     │            │  ♂☀      │
│          │            │          │
│          │            │  2 ★     │
└──────────┘            └──────────┘
(dark bg)               (faint bg)
```

### Bidding Flow

```
1. Click "Bid" button in Card Modal
   ↓
2. Bidding Confirmation Modal overlays (covering artwork area)

   ┌─────────────────────────────────┐
   │ ╔═══════════════════════════╗   │
   │ ║                           ║   │
   │ ║  Select symbols to bid:   ║   │
   │ ║                           ║   │
   │ ║  Cost: ♂☀                ║   │
   │ ║                           ║   │
   │ ║  Your pool: ♂ ♂ ♀ ☿ ☽    ║   │
   │ ║  Selected:  ♂ ☿ (auto)   ║   │
   │ ║                           ║   │
   │ ║  ┌─────────────────────┐  ║   │
   │ ║  │      Confirm?       │  ║   │
   │ ║  └─────────────────────┘  ║   │
   │ ║                           ║   │
   │ ╚═══════════════════════════╝   │
   │                                 │
   │ [Rest of card modal visible]    │
   └─────────────────────────────────┘
```

---

## 1. Card Grid Layout

### Card Dimensions
- **All cards must be perfect squares: 6rem × 6rem (96px)**
- Consistent size regardless of content
- Should fit comfortably in viewport with scrolling

### Card Display States

#### Face-Down Cards
- Show only: **faction emoji** (centered, large)
- Dark faction-colored background gradient
- Light emoji color

#### Face-Up Cards
- Show (square layout):
  - **Card name** (top, truncated if needed)
  - **Faction emoji** (top-right corner, small)
  - **Cost** (symbols, using ☀ for "any")
  - **Conditional VP** (emojified phrase like "★ x ⚙" or "2★ if +1 🐍")
  - **VP** (format: "2 ★" not "★ 2 VP", bottom)
- Faint faction-colored background (20% opacity)
- Dark text

### Grid Behavior
- **Only the card grid scrolls** (not the entire page)
- **Scrollable both vertically and horizontally**
- Player pools and controls remain fixed
- Grid should maintain square card layout with consistent gaps

### Hover Behavior
- Cards **do NOT change size** on hover
- Cards **change opacity** to become more vibrant when hovered (e.g., 0.8 → 1.0)
- Only applies to available cards
- Cursor: pointer for available cards

---

## 2. Card Modal (Detail View)

### Trigger
- Clicking on an **available card** opens the card modal

### Responsive Behavior

#### Wide Screens (>768px)
- Modal appears as **side panel on the right**
- Takes ~400px width, fixed position
- Does not overlay the grid
- Grid remains visible and interactive
- Can scroll grid while modal is open

#### Small Screens (≤768px)
- Modal appears as **true modal** (centered overlay)
- Semi-transparent backdrop dims the grid
- Must close modal to interact with grid
- Includes close button (X)

### Modal Content Layout
1. **Card artwork space** (prominent, top, 200px height placeholder)
2. **Card name** (large, bold)
3. **Faction name + emoji** (e.g., "Iron Tide ⚙")
4. **Cost** (using ☀ for "any", larger symbols)
5. **VP display** (format: "2 ★", larger)
6. **Conditional VP** (emojified phrase if present)
7. **Game 3 effect** (full text, smaller font)
8. **Action buttons** (bottom):
   - "Bid" button (primary)
   - "Burn" button (destructive)

### Burn Button Behavior
1. **Initial state**: Shows "Burn" in red/destructive color
2. **First click**:
   - Text changes to "Confirm?"
   - Button starts glowing (pulse animation)
   - Button **maintains same size and shape** (no layout shift)
3. **Second click**: Executes burn action, closes modal
4. **Click elsewhere**: Resets back to "Burn" immediately (cancel)

### Bid Button Behavior
1. **First click**: Opens bidding confirmation modal

2. **Bidding confirmation modal**:
   - **Overlays on top of the card modal**
   - **Covers exactly the artwork area** (keeps rest of modal visible)
   - Shows:
     - Cost requirement (with ☀ for "any")
     - Player's available symbol pool
     - Selected symbols (highlighted)
     - Options to: select different symbols, counterbid, pass
   - If cost has **no "any" (☀) symbols**: Pre-select those exact symbols from player's pool
   - If cost has **"any" symbols**: Require player to choose which symbols to use
   - **"Confirm?" button** appears in the **same position** as original "Bid" button (minimize mouse movement)
   - Allow deselection/reselection of symbols
   - Can overbid by selecting more symbols than required

3. **Confirmation**: Executes bid, closes both modals

---

## 3. Emoji System

### Faction Emojis

```typescript
const FACTION_EMOJIS = {
  'Crimson Covenant': '🩸',  // blood drop
  'Iron Tide': '⚙',          // gear
  'Void Legion': '👻',        // ghost
  'Silk Network': '🪙',       // coin
  'Dream Garden': '🌸',       // blossom
  'Ghost Protocol': '💀',     // skull
  'General': '⭐'            // star
} as const;
```

### Symbol Emojis

```typescript
const SYMBOL_EMOJIS = {
  'any': '☀',      // sun (replaces "any" in costs)
  'mars': '♂',     // existing
  'venus': '♀',    // existing
  'mercury': '☿',  // existing
  'moon': '☽'      // existing
} as const;
```

### Conditional VP Entity Emojis

Based on analysis of all conditional VPs in cards.json:

```typescript
const VP_CONDITION_EMOJIS = {
  // Core concepts
  'card': '🃏',
  'faction': '🏴',
  'symbol': '✦',

  // Faction references (use faction emojis)
  'Crimson Covenant': '🩸',
  'Iron Tide': '⚙',
  'Void Legion': '👻',
  'Silk Network': '🪙',
  'Dream Garden': '🌸',
  'Ghost Protocol': '💀',

  // Game mechanics
  'counter-bid': '⚔️',
  'burn': '🔥',
  'ruins': '🏚️',
  'grid': '⊞',
  'opponent': '👤',
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
```

### Conditional VP Format Examples

Replace sentence-based conditional VP with short emojified phrases:

```typescript
// Examples from actual cards:
"+1 per Crimson Covenant card"        → "★ x 🩸"
"+2 per card you won by counter-bidding" → "2★ x ⚔️"
"+1 per ruins space in grid"          → "★ x 🏚️"
"+3 if you won a card by counter-bidding" → "3★ if ⚔️"
"+3 if you have ≤4 cards total"       → "3★ if ≤4 🃏"
"+2 per card fewer than opponent"     → "2★ x ↓👤"
"+4 if you have 1 of each symbol unspent" → "4★ if 1ea💎"
"+8 if you have 2 of each symbol unspent" → "8★ if 2ea💎"
"+3 if this is your 5th+ card"        → "3★ if 5+⏰"
"+1 per card you have (including this)" → "★ x 🃏"
"+3 if you have burned 3+ cards"      → "3★ if 3+🔥"
"+1 per card you burned this game"    → "★ x 🔥"
"+2 if cards from 3+ factions"        → "2★ if 3+🌈"
"+1 per faction represented"          → "★ x 🌈"
"+2 per faction with 2+ cards"        → "2★ x 🌈"
"+4 if cards from 4+ factions"        → "4★ if 4+🌈"
"+2 if you have another card of this faction" → "2★ if +1🏴"
"+3 if ≤12 cards remain face up in grid" → "3★ if ≤12⊞"
```

---

## 4. Visual Fixes

### Issue 1: Gradient Background Classes
- **Problem**: `-tw-gradient-stops is not defined` error
- **Root Cause**: Tailwind CSS v4 uses different CSS variable naming
- **Fix**:
  - Check tailwind.config for proper gradient configuration
  - May need to use explicit gradient colors instead of relying on CSS variables
  - Example: `bg-gradient-to-br from-red-950 to-red-900` instead of custom variables

### Issue 2: Glass Panel Centering
- **Target**: Direct `inline-block` child of `class="glass-panel p-6 rounded-xl overflow-auto max-h-[700px] shadow-2xl"`
- **Fix**: Add `flex justify-center` to parent or `mx-auto` to child

---

## 5. Testing Strategy

### Overview
Use **actual DOM measurement and rendering verification** rather than just checking for class presence. This ensures styles actually apply and elements render correctly.

### Testing Packages & APIs

**Already Available (no new packages needed):**
- `@testing-library/react` - Component rendering and querying
- `vitest` - Test runner with mocking
- Browser APIs:
  - `getBoundingClientRect()` - Get actual rendered dimensions
  - `getComputedStyle()` - Get computed CSS properties
  - `window.getComputedStyle()` - Get final applied styles

**No new packages required!** All APIs are native browser or already in testing library.

### Test Suite Structure

Create `tests/integration/CardUI.test.tsx` with comprehensive UI verification:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { Card } from '../../src/components/Card';
import { Grid } from '../../src/components/Grid';
import { App } from '../../src/App';

describe('Card Dimensional Testing', () => {
  it('should render all cards as perfect squares', () => {
    // Render multiple cards with different content
    const cards = [shortCard, longCard, emptyCard];

    cards.forEach(card => {
      const { container } = render(<Card card={card} faceUp={true} />);
      const cardElement = container.firstChild as HTMLElement;

      // Get actual rendered dimensions
      const rect = cardElement.getBoundingClientRect();

      // Assert perfect square (width === height)
      expect(rect.width).toBe(rect.height);

      // Assert expected size (6rem = 96px)
      expect(rect.width).toBe(96);
    });
  });

  it('should maintain consistent card dimensions across content variations', () => {
    const { container: c1 } = render(<Card card={shortCard} faceUp={true} />);
    const { container: c2 } = render(<Card card={longCard} faceUp={true} />);
    const { container: c3 } = render(<Card card={emptyCard} faceUp={true} />);

    const rect1 = (c1.firstChild as HTMLElement).getBoundingClientRect();
    const rect2 = (c2.firstChild as HTMLElement).getBoundingClientRect();
    const rect3 = (c3.firstChild as HTMLElement).getBoundingClientRect();

    // All cards must have identical dimensions
    expect(rect1.width).toBe(rect2.width);
    expect(rect1.width).toBe(rect3.width);
    expect(rect1.height).toBe(rect2.height);
    expect(rect1.height).toBe(rect3.height);
  });
});

describe('Visual Rendering Testing', () => {
  it('should render face-up cards with faint faction background', () => {
    const card = { ...testCard, faction: 'Iron Tide' };
    const { container } = render(<Card card={card} faceUp={true} />);
    const cardElement = container.firstChild as HTMLElement;

    // Get computed background color
    const computedStyle = window.getComputedStyle(cardElement);
    const bgColor = computedStyle.backgroundColor;

    // Should have some background color (not transparent)
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');

    // Check for opacity/transparency (faint bg)
    // Parse rgba and check alpha < 0.5
    const alphaMatch = bgColor.match(/rgba?\([^)]+,\s*([\d.]+)\)/);
    if (alphaMatch) {
      const alpha = parseFloat(alphaMatch[1]);
      expect(alpha).toBeLessThan(0.5); // Faint = low opacity
    }
  });

  it('should render face-down cards with dark faction background', () => {
    const card = { ...testCard, faction: 'Void Legion' };
    const { container } = render(<Card card={card} faceUp={false} />);
    const cardElement = container.firstChild as HTMLElement;

    const computedStyle = window.getComputedStyle(cardElement);
    const bgColor = computedStyle.backgroundColor;

    // Should have background color
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');

    // For gradient, check background-image
    const bgImage = computedStyle.backgroundImage;
    expect(bgImage).toContain('gradient');
  });

  it('should display VP in "2 ★" format (not "★ 2 VP")', () => {
    const card = { ...testCard, baseVP: 3 };
    const { container } = render(<Card card={card} faceUp={true} />);

    const text = container.textContent;

    // Should contain "3 ★" format
    expect(text).toContain('3 ★');

    // Should NOT contain old format
    expect(text).not.toContain('★ 3 VP');
  });

  it('should use ☀ symbol for "any" in costs', () => {
    const card = { ...testCard, symbols: 'any' };
    const { container } = render(<Card card={card} faceUp={true} />);

    const text = container.textContent;
    expect(text).toContain('☀');
    expect(text).not.toContain('any');
  });
});

describe('Hover Behavior Testing', () => {
  it('should not change dimensions on hover', () => {
    const { container } = render(
      <Card card={testCard} faceUp={true} available={true} onClick={vi.fn()} />
    );
    const cardElement = container.firstChild as HTMLElement;

    const rectBefore = cardElement.getBoundingClientRect();

    // Trigger hover
    fireEvent.mouseEnter(cardElement);

    const rectAfter = cardElement.getBoundingClientRect();

    // Dimensions must not change
    expect(rectAfter.width).toBe(rectBefore.width);
    expect(rectAfter.height).toBe(rectBefore.height);
  });

  it('should change opacity on hover for available cards', () => {
    const { container } = render(
      <Card card={testCard} faceUp={true} available={true} onClick={vi.fn()} />
    );
    const cardElement = container.firstChild as HTMLElement;

    const styleBefore = window.getComputedStyle(cardElement);
    const opacityBefore = parseFloat(styleBefore.opacity);

    fireEvent.mouseEnter(cardElement);

    const styleAfter = window.getComputedStyle(cardElement);
    const opacityAfter = parseFloat(styleAfter.opacity);

    // Opacity should increase on hover
    expect(opacityAfter).toBeGreaterThan(opacityBefore);
  });
});

describe('Modal Interaction Testing', () => {
  it('should open card modal when clicking available card', async () => {
    const { container } = render(<App />);

    // Find an available card
    const availableCard = container.querySelector('.cursor-pointer');
    expect(availableCard).toBeTruthy();

    // Modal should not exist initially
    expect(screen.queryByText('Bid')).not.toBeInTheDocument();

    // Click card
    fireEvent.click(availableCard!);

    // Modal should appear with Bid and Burn buttons
    expect(screen.getByText('Bid')).toBeInTheDocument();
    expect(screen.getByText('Burn')).toBeInTheDocument();
  });

  it('should show card modal as side panel on desktop (>768px)', () => {
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 1024
    });

    const { container } = render(<App />);
    const availableCard = container.querySelector('.cursor-pointer');
    fireEvent.click(availableCard!);

    // Find modal element
    const modal = screen.getByText('Bid').closest('[class*="modal"]');

    // Should be positioned as side panel (not centered overlay)
    const computedStyle = window.getComputedStyle(modal!);
    expect(computedStyle.position).toBe('fixed');
    // Should be on right side
    expect(computedStyle.right).not.toBe('auto');
  });

  it('should show card modal as centered overlay on mobile (≤768px)', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 375
    });

    const { container } = render(<App />);
    const availableCard = container.querySelector('.cursor-pointer');
    fireEvent.click(availableCard!);

    const modal = screen.getByText('Bid').closest('[class*="modal"]');
    const computedStyle = window.getComputedStyle(modal!);

    // Should be centered overlay
    expect(computedStyle.position).toBe('fixed');
    // Should have backdrop
    const backdrop = container.querySelector('[class*="backdrop"]');
    expect(backdrop).toBeTruthy();
  });
});

describe('Burn Button Behavior', () => {
  it('should change text to "Confirm?" on first click', () => {
    const { container } = render(<App />);
    const availableCard = container.querySelector('.cursor-pointer');
    fireEvent.click(availableCard!);

    const burnButton = screen.getByText('Burn');
    const rectBefore = burnButton.getBoundingClientRect();

    fireEvent.click(burnButton);

    // Text should change
    expect(screen.getByText('Confirm?')).toBeInTheDocument();
    expect(screen.queryByText('Burn')).not.toBeInTheDocument();

    // Size should not change
    const rectAfter = screen.getByText('Confirm?').getBoundingClientRect();
    expect(rectAfter.width).toBe(rectBefore.width);
    expect(rectAfter.height).toBe(rectBefore.height);
  });

  it('should add glow effect when in confirm state', () => {
    const { container } = render(<App />);
    const availableCard = container.querySelector('.cursor-pointer');
    fireEvent.click(availableCard!);

    const burnButton = screen.getByText('Burn');
    fireEvent.click(burnButton);

    const confirmButton = screen.getByText('Confirm?');
    const computedStyle = window.getComputedStyle(confirmButton);

    // Should have animation or box-shadow for glow
    const hasGlow =
      computedStyle.animation.includes('pulse') ||
      computedStyle.boxShadow !== 'none';

    expect(hasGlow).toBe(true);
  });

  it('should reset to "Burn" when clicking elsewhere', () => {
    const { container } = render(<App />);
    const availableCard = container.querySelector('.cursor-pointer');
    fireEvent.click(availableCard!);

    const burnButton = screen.getByText('Burn');
    fireEvent.click(burnButton);

    expect(screen.getByText('Confirm?')).toBeInTheDocument();

    // Click elsewhere (modal background)
    const modal = screen.getByText('Confirm?').closest('[class*="modal"]');
    fireEvent.click(modal!);

    // Should reset
    expect(screen.getByText('Burn')).toBeInTheDocument();
    expect(screen.queryByText('Confirm?')).not.toBeInTheDocument();
  });

  it('should execute burn action on second click', () => {
    const { container } = render(<App />);
    const availableCard = container.querySelector('.cursor-pointer');
    fireEvent.click(availableCard!);

    const burnButton = screen.getByText('Burn');
    fireEvent.click(burnButton); // First click

    const confirmButton = screen.getByText('Confirm?');
    fireEvent.click(confirmButton); // Second click

    // Modal should close
    expect(screen.queryByText('Burn')).not.toBeInTheDocument();
    expect(screen.queryByText('Confirm?')).not.toBeInTheDocument();
  });
});

describe('Bid Flow Testing', () => {
  it('should open bidding confirmation modal on bid click', () => {
    const { container } = render(<App />);
    const availableCard = container.querySelector('.cursor-pointer');
    fireEvent.click(availableCard!);

    const bidButton = screen.getByText('Bid');
    fireEvent.click(bidButton);

    // Should show confirmation UI
    expect(screen.getByText(/Select symbols/i)).toBeInTheDocument();
    expect(screen.getByText('Confirm?')).toBeInTheDocument();
  });

  it('should pre-select symbols when no "any" in cost', () => {
    // Card with cost ♂☿ (no "any")
    const { container } = render(<App />);
    // ... navigate to card with specific cost

    const bidButton = screen.getByText('Bid');
    fireEvent.click(bidButton);

    // Should show pre-selected symbols
    const selected = screen.getByText(/Selected:/i);
    expect(selected.textContent).toContain('♂');
    expect(selected.textContent).toContain('☿');
  });

  it('should position Confirm? button in same location as Bid button', () => {
    const { container } = render(<App />);
    const availableCard = container.querySelector('.cursor-pointer');
    fireEvent.click(availableCard!);

    const bidButton = screen.getByText('Bid');
    const bidRect = bidButton.getBoundingClientRect();

    fireEvent.click(bidButton);

    const confirmButton = screen.getByText('Confirm?');
    const confirmRect = confirmButton.getBoundingClientRect();

    // Should be in approximately the same position
    expect(Math.abs(confirmRect.x - bidRect.x)).toBeLessThan(10);
    expect(Math.abs(confirmRect.y - bidRect.y)).toBeLessThan(10);
  });

  it('should overlay bidding modal exactly over artwork area', () => {
    const { container } = render(<App />);
    const availableCard = container.querySelector('.cursor-pointer');
    fireEvent.click(availableCard!);

    // Find artwork area
    const artworkArea = container.querySelector('[class*="artwork"]');
    const artworkRect = artworkArea!.getBoundingClientRect();

    const bidButton = screen.getByText('Bid');
    fireEvent.click(bidButton);

    // Find bidding modal
    const biddingModal = screen.getByText(/Select symbols/i).closest('[class*="bidding"]');
    const biddingRect = biddingModal!.getBoundingClientRect();

    // Should cover artwork area
    expect(biddingRect.top).toBeCloseTo(artworkRect.top, 0);
    expect(biddingRect.height).toBeCloseTo(artworkRect.height, 0);
  });
});

describe('Grid Scrolling Testing', () => {
  it('should allow vertical and horizontal scrolling in grid', () => {
    const { container } = render(<App />);

    // Find grid container
    const grid = container.querySelector('[class*="grid"]');
    const computedStyle = window.getComputedStyle(grid!);

    // Should be scrollable
    expect(computedStyle.overflowY).toBe('auto');
    expect(computedStyle.overflowX).toBe('auto');
  });

  it('should keep player pool fixed while grid scrolls', () => {
    const { container } = render(<App />);

    const playerPool = screen.getByText(/Your Pool:/i).closest('div');
    const computedStyle = window.getComputedStyle(playerPool!);

    // Should be fixed or sticky
    const isFixed =
      computedStyle.position === 'fixed' ||
      computedStyle.position === 'sticky';

    expect(isFixed).toBe(true);
  });
});
```

### Testing Approach Summary

1. **Dimensional Testing**
   - Use `getBoundingClientRect()` to measure actual rendered sizes
   - Verify width === height for squares
   - Check consistency across different content

2. **Visual Rendering Testing**
   - Use `window.getComputedStyle()` to check applied styles
   - Verify background colors, gradients, opacity
   - Check text content formatting

3. **Interaction Testing**
   - Use `fireEvent` to simulate clicks, hovers
   - Verify DOM changes after interactions
   - Check modal appearance/positioning
   - Verify button state changes

4. **Responsive Testing**
   - Mock `window.innerWidth` for different screen sizes
   - Verify different layouts for desktop/mobile
   - Check modal positioning changes

5. **Layout Testing**
   - Check scroll behavior with computed styles
   - Verify fixed/sticky positioning
   - Measure element positions relative to each other

### Running Tests

```bash
npm test                    # Run all tests
npm test -- CardUI.test     # Run specific test file
npm test -- --coverage      # With coverage
npm test -- --ui            # Interactive UI
```

---

## 6. Art Prompts for Image Generation

### General Theme & Style

Create card artwork for FORGE, a cosmic alchemical strategy card game where three primal forces (Mars ♂, Venus ♀, Mercury ☿) combine in conflict with the Moon ☽. The aesthetic should evoke:

**Visual Style**: Dark fantasy meets cosmic horror with alchemical symbolism. Think baroque sci-fi - ornate machinery fused with organic growth, ancient symbols glowing with unnatural light. Heavy shadows with dramatic rim lighting. Textures should be rich: tarnished metals, iridescent chitin, crystalline structures catching impossible light. Color palette emphasizes deep purges, blacks, and faction-specific accent colors that seem to emit their own luminescence.

**Composition**: Each card should work as both a standalone piece and as part of a unified aesthetic. Center focus on the primary subject (unit, structure, or phenomenon) with environmental storytelling at the edges. Leave negative space that emphasizes the subject's power or menace. Avoid busy backgrounds - use atmospheric gradients and suggested detail rather than fully-rendered environments.

**Mood**: Ominous grandeur. These are forces beyond human scale - even the smallest units should feel like they're part of something vast and terrible. The viewer should sense motion frozen in time, potential energy about to be unleashed.

### Faction-Specific Themes

**Crimson Covenant (♂♀ - Blood & Life)**
Biology as warfare. Chitinous armor plates, pulsing organic tissue, thorn-covered vines that writhe with intent. Units are bio-engineered predators: sleek, fast, covered in natural weapons. Think xenomorphic creatures crossed with carnivorous plants. Color scheme: deep burgundy, crimson, dark pink flesh tones against black chitin. Wounds don't bleed - they sprout new growth. Swarm units should cluster like wasps or move like schools of piranha. Leaders are elegant nightmares, more evolved than monstrous, wearing their predatory nature like royal regalia.

**Iron Tide (♂☿ - War & Metal)**
Brutal industrial warfare. Massive constructs of riveted steel, exhaust ports belching dark smoke, treads that crush everything beneath. Units are war machines - no pretense of humanity, just function and firepower. Think WW1 tanks meets steampunk walker meets brutalist architecture. Color scheme: gunmetal grey, dark steel blues, brass accents, rust. Surfaces are scarred from combat, each unit a veteran. Speed units should look like they're perpetually leaning forward, caught mid-charge. The base is a foundry, sparks and molten metal visible through architectural gaps.

**Void Legion (♂☽ - Chaos & Entropy)**
The breaking of order. Units are twisted versions of humanoid forms - too many limbs, geometries that don't quite connect right, faces hidden behind masks or hoods or nothing at all. Think cultist aesthetics meets cosmic horror: tattered robes revealing something that isn't quite flesh underneath, weapons that look ceremonial but drip with malice. Color scheme: Deep blacks with purple edges, sickly yellows, void-deep purples. Shadows don't behave correctly around these units. Swarm units are fanatics - you should see their fevered dedication even in silhouette. The leader "Entropy" should look like reality is fraying at their edges.

**Silk Network (♀☿ - Trade & Information)**
Wealth as power, information as currency. Units wear ornate armor that's clearly expensive - gold filigree, amber inlays, silk accents. But they're still warriors: diplomat-assassins with hidden blades, merchant-princes with bodyguards, envoys that move with deadly grace. Think Renaissance intrigue meets asian merchant guilds meets information age surveillance. Color scheme: Rich golds, deep ambers, bronze, cream silk, with data-stream blue highlights. Speed units should look like couriers or scouts - light armor, ready to move. The base "Exchange" should evoke a trading house but with fortified luxury.

**Dream Garden (♀☽ - Growth & Psychic)**
Nature is neither kind nor cruel - it simply is. Units are robed figures tending impossible flora, or guardians that are more plant than person, or the plants themselves given terrible purpose. Think sacred grove meets psychedelic nightmare: bioluminescent flowers with too many petals, trees with bark that looks like eyes, moss that grows in sacred geometric patterns. Color scheme: Soft teals, seafoam greens, moonlit silvers, lavender, with darker earth tones grounding the palette. Terrain effects should show sacred ground physically different - reality altered by belief made manifest. The leader "Oracle Syl" should look like the garden speaks through them.

**Ghost Protocol (☿☽ - Data & Shadow)**
Information warfare in physical form. Units are agents in tactical gear with digital camouflage patterns that glitch and shift, or they're shadows given form, or they're neither - data entities manifesting in meatspace. Think cyberpunk espionage meets digital ghost stories. Color scheme: Pale greys, silver-blues, null-space blacks, with scanline greens and error-message reds as accents. Infiltration units should look like they're half-phased out of reality. Terrain shows null zones as areas where colors desaturate and detail drops out. The base "Archive" should look like a server farm from a dark future.

**General (Multi-faction Neutral)**
The remnants and results of cosmic war. Caches are supply drops or abandoned materiel. Outposts are hastily-fortified positions. Mercenaries are battle-scarred professionals who've seen too much. Ruins show fragments of all factions, evidence of past conflicts. Color scheme: Utilitarian tans, military greens, weathered browns, neutral greys. These cards should feel like war's supporting cast - essential but not glorious. The "Grand Arsenal" should look like a weapon that borrows from every faction's technology, a dangerous synthesis.

### Unit-Specific Prompts

**Crimson Covenant Units:**
- **Bloodthorn Seedling**: A thorny seedling pod with organic tendrils, dripping with crimson sap, half-buried in dark soil. Barely emerged but already predatory.
- **Symbiote Spawn**: Small chitinous creatures clustering together, each one part-insect part-something-worse, moving as a coordinated swarm.
- **Crimson Agent**: A humanoid figure in bio-organic armor, crimson and black, with thorn-like protrusions. Face partially obscured by chitinous plates. Carries organic weapons that look grown, not forged.
- **Hostile Takeover**: A scene of one unit consuming or overgrowing another, aggressive biological warfare in action, thorny vines crushing steel.
- **Predator Pack**: Multiple sleek predatory forms hunting together, low to the ground, all teeth and claws and hungry intent.
- **Crimson Base: The Hivemind**: A massive organic structure, part hive, part fortress, pulsing with internal light. Entrances like mouths, walls like ribs.
- **Crimson Leader: Thorne**: A regal figure in elaborate bio-armor, more evolved than the agents. Crown of thorns, cape of living tissue. Eyes that evaluate, calculate, dominate.
- **Carrion Caller**: A robed figure with staff topped by a skull wreathed in vines. Summoning dead tissue back to terrible life.
- **Apex Predator**: The ultimate predator - massive, powerful, covered in scars from countless kills. Part trophy, part nightmare.

**Iron Tide Units:**
- **Raid Scout**: A light mechanized unit, all speed and reconnaissance gear. Think motorcycle-tank hybrid, stripped down to essentials.
- **Strike Runner**: Bipedal war machine, smaller scale, weapons at the ready. Built for hit-and-run, every line suggesting forward motion.
- **Iron Agent**: Standard war construct - humanoid frame in heavy armor plating, carrying oversized weapons. Functional, brutal, efficient.
- **Scorched Advance**: A battlefield scene showing burned ground, advancing machines leaving destruction in their wake.
- **Shock Trooper**: Heavy assault construct, extra armor plating, weapons integrated into arms. Built to take damage and keep advancing.
- **Iron Base: The Foundry**: Massive industrial complex belching smoke and flame. Assembly lines visible through openings, producing war machines endlessly.
- **Iron Leader: Commander Vex**: Command construct, taller and more heavily armed than standard units. Multiple sensor arrays, communication equipment. The brain of the war machine.
- **Blitz Squadron**: Three fast-attack units in formation, caught mid-charge, weapons firing, leaving trails of exhaust and destruction.
- **War Engine**: Absolutely massive construct, dwarfing everything around it. Multiple weapon systems, enough armor to be a mobile fortress. The thing armies have nightmares about.

**Void Legion Units:**
- **Null Shard**: A fragment of void-crystal, floating, geometric but wrong, casting shadows that defy light sources.
- **Fanatic Initiate**: Hooded cultist figures, faces hidden, clutching improvised weapons. Desperation and fervor in their posture.
- **Void Agent**: Armored figure with cult symbols, wielding chaotic-looking weapons. Shadows cling to them unnaturally.
- **Cult of Less**: A group of cultists burning their own possessions, icons, cards. Worship through destruction.
- **Chaos Warrior**: Heavily-armored cultist berserker, weapon raised, mid-scream. Barely-controlled violence incarnate.
- **Void Base: The Rift**: A tear in reality, edges purple and black, writhing. Architecture dissolving at the edges, becoming un-geometries.
- **Void Leader: Entropy**: A figure whose edges blur and fragment, holding reality barely together. Their presence makes the air itself uncertain.
- **Doom Herald**: A robed prophet figure, staff in hand, surrounded by swirling void energy. Bearer of ending.
- **Oblivion Gate**: A massive portal to nowhere, architecture of madness forming its frame. The destination is not a place you'd survive.

**Silk Network Units:**
- **Trade Contact**: A merchant's stall or caravan scene, goods displayed, but guards are clearly present and deadly.
- **Courier**: A lightly-armored runner mid-motion, carrying sealed documents, parkour-style movement through urban environment.
- **Silk Agent**: Diplomatic figure in fine robes with hidden weapons visible on close inspection. Charming smile, dangerous eyes.
- **Liquid Assets**: Vault scene showing organized wealth - gold bars, gems, currency from many factions. But it's mobile, ready to move.
- **Diplomat Envoy**: Pair of well-dressed negotiators flanked by subtle bodyguards. The appearance of peace backed by capability for violence.
- **Silk Base: The Exchange**: Trading house architecture - grand hall with vaulted ceilings, information boards, but also fortified positions and guard posts.
- **Silk Leader: The Broker**: A figure in magnificent robes, surrounded by floating holographic information displays, seeing all, knowing all. Power through knowledge.
- **Embassy Guard**: Two elite soldiers in ceremonial but functional armor, guarding embassy doors. Beauty and strength combined.
- **Golden Reserves**: Vast wealth in secure vaults, enough resources to fuel entire campaigns. The treasure that buys armies.

**Dream Garden Units:**
- **Seedling Shrine**: A small sacred space, tended plants glowing with lunar light, altar of natural stone. The beginning of belief manifest.
- **Moon Tender**: Robed figure kneeling, hands in soil, moonlight streaming down. Growing the sacred with patient care.
- **Dream Agent**: Mystic warrior with psychic energy visible as soft glows, wearing living plant armor, eyes that see beyond sight.
- **Late Bloom**: A flower opening for the first time, massive and beautiful, releasing spores or light. Late, but worth the wait.
- **Grove Keeper**: Guardian figure, half-plant half-person, staff in hand, protecting the sacred grove with absolute dedication.
- **Dream Base: The Grove**: Ancient tree circle, moonlight filtering through impossible canopy, sacred ground visibly different from mundane earth.
- **Dream Leader: Oracle Syl**: Seer figure with eyes glowing, surrounded by floating flowers and psychic energy. The garden speaks, they translate.
- **Moonrise Sanctum**: Temple structure grown from living trees, moonlight concentrating into visible beams, holiest of holy grounds.
- **World Tree**: Massive tree reaching from earth to sky, roots and branches supporting countless ecosystems, trunk carved with every history. The center of all growth.

**Ghost Protocol Units:**
- **Data Fragment**: Corrupted data visualization, glitch effects, partial information floating in void space.
- **Shadow Seed**: Planting device half-digital half-physical, creating zones where reality destabilizes.
- **Ghost Agent**: Figure in tactical gear with active camouflage glitching, half-visible, digital artifacts surrounding them.
- **Scorched Data**: Burning servers or files, information being destroyed, digital flames consuming data.
- **Void Marker**: Device creating dead zones, EMPs and signal nullification made visible, reality desaturating around it.
- **Ghost Base: The Archive**: Server room aesthetic, endless data banks, but also shadows that move wrong, information that manifests physically.
- **Ghost Leader: Specter**: Figure that's barely there, glitching between states, commanding information warfare with a gesture.
- **Deep Cover Cell**: Three agents in infiltration gear, faces obscured, blending into shadows and data streams, everywhere and nowhere.
- **Erasure Protocol**: Scene of massive data destruction, everything being deleted, wiped, made as if it never was. Information death at scale.

**General Units:**
- **Hidden Cache**: Crate or buried supplies, unmarked, utilitarian. Resources waiting to be claimed.
- **Supply Cache**: Military supply drop, parachute still attached, crates of equipment ready for use.
- **Forward Outpost**: Fortified position, sandbags and barriers, flag flying, tactical location secured.
- **Stolen Plans**: Document folder or data drive, faction symbols crossed out, being traded in shadows.
- **Scorched Earth**: Burned landscape, destroyed resources, denial warfare. Nothing left for the enemy.
- **Fortification**: Defensive structure, heavy walls, gun emplacements, built to withstand siege.
- **Mercenary Squad**: Professional soldiers in mismatched gear, well-equipped, battle-scarred. They fight for pay but they fight well.
- **Veteran Captain**: Single elite soldier, decorated armor, commanding presence. The professional who's seen it all.
- **Ancient Ruin**: Pre-war structure, fragments of all factions visible in architecture, mystery in its purpose.
- **Adaptable Doctrine**: Training manual or tactical display showing multiple faction strategies being synthesized.
- **Wild Tech**: Experimental device combining technologies from multiple factions, unstable but powerful.
- **Grand Arsenal**: Massive weapons cache, equipment from every faction, enough firepower to equip an army.

---

## 7. Implementation Priority

1. **Phase 1**: Square cards (6rem × 6rem) + scrollable grid
   - Update Card component dimensions
   - Update Grid component layout
   - Add dimensional tests
   - Fix overflow handling

2. **Phase 2**: Emoji system implementation
   - Create emoji constants file
   - Update Card component to use emojis
   - Replace "any" with ☀
   - Convert conditional VPs to emojified format
   - Update VP display to "N ★" format

3. **Phase 3**: Card modal (desktop side panel, mobile overlay)
   - Create CardModal component
   - Implement responsive layout
   - Add artwork placeholder
   - Wire up to card clicks
   - Add modal interaction tests

4. **Phase 4**: Burn button two-click confirmation
   - Add state management for burn confirm
   - Implement glow animation
   - Add click-outside handler
   - Test size stability

5. **Phase 5**: Bid flow with confirmation overlay
   - Create BiddingModal component
   - Overlay positioning over artwork area
   - Symbol pre-selection logic
   - Symbol selection UI
   - Position Confirm? button correctly
   - Add bid flow tests

6. **Phase 6**: Visual fixes
   - Fix gradient CSS variable issue
   - Fix glass panel centering
   - Hover opacity transitions
   - Polish animations

7. **Phase 7**: Comprehensive testing suite
   - Implement all tests from section 5
   - Verify all measurements
   - Check all interactions
   - Ensure responsive behavior

---

## Answers to Questions

**0. ASCII layouts** - ✅ Created above

**1. Faction emojis** - ✅ Suggested: 🩸⚙👻🪙🌸💀⭐

**2. Card size** - ✅ 6rem × 6rem (96px)

**3. Artwork** - ✅ Placeholder for now + art prompts created

**4. Bidding confirmation** - ✅ Overlay on top of card modal, covering artwork area

**5. VP emoji cataloging** - ✅ Complete emoji map created with all entities

**6. Scrolling** - ✅ Only card grid scrolls, pools/controls fixed

**7. Burn reset** - ✅ Reset to "Burn" immediately on click elsewhere

**Testing approach** - ✅ Detailed with browser APIs, no new packages needed
