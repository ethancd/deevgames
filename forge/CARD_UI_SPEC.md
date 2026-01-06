# FORGE Card UI Specification

## Overview
Complete redesign of the card UI system to use square cards, side-panel modals, and emoji-based iconography.

---

## 1. Card Grid Layout

### Card Dimensions
- **All cards must be perfect squares** (not rectangles)
- Consistent size regardless of content
- Should fit comfortably in viewport with scrolling

### Card Display States

#### Face-Down Cards
- Show only: **faction emoji** (centered)
- Dark faction-colored background (as currently implemented)
- Light text/emoji color

#### Face-Up Cards
- Show:
  - **Card name** (top)
  - **Cost** (symbols, using ☀ for "any")
  - **Faction emoji** (small, somewhere visible)
  - **VP** (format: "2 ★" not "★ 2 VP")
  - **Conditional VP** (short emojified phrase like "★ x 🦾" or "2★ if +1 🐍")
- Faint faction-colored background (as currently implemented)
- Dark text

### Grid Behavior
- **Scrollable both vertically and horizontally**
- Grid should maintain square card layout

### Hover Behavior
- Cards **do NOT change size** on hover
- Cards **change opacity** to become more vibrant when hovered
- Only applies to available cards

---

## 2. Card Modal (Detail View)

### Trigger
- Clicking on an **available card** opens the card modal

### Responsive Behavior

#### Wide Screens (>768px)
- Modal appears as **side panel on the right**
- Does not overlay the grid
- Grid remains visible and interactive

#### Small Screens (≤768px)
- Modal appears as **true modal** (centered overlay)
- Backdrop dims the grid
- Must close modal to interact with grid

### Modal Content
- **Card artwork space** (prominent)
- **Card name**
- **Faction name** (full text, e.g., "Crimson Covenant")
- **Faction emoji**
- **Cost** (using ☀ for "any")
- **VP** (format: "2 ★")
- **Conditional VP** (emojified phrase)
- **Game 3 effect** (full text)
- **Action buttons**: "Bid" and "Burn"

### Burn Button Behavior
1. **Initial state**: Shows "Burn"
2. **First click**:
   - Text changes to "Confirm?"
   - Button starts glowing
   - Button **maintains same size and shape**
3. **Second click**: Executes burn action
4. **Click outside or wait**: Returns to "Burn" state (cancel)

### Bid Button Behavior
1. **First click**: Opens bidding confirmation modal
2. **Bidding confirmation modal**:
   - If cost has **no "any" symbols**: Pre-select those exact symbols from player's pool
   - If cost has **"any" (☀) symbols**: Allow player to choose which symbols to use
   - **"Confirm?" button** appears in the **same position** as the "Bid" button (minimize mouse movement)
   - Show selected symbols clearly
   - Allow deselection/reselection if needed

---

## 3. Emoji System

### Faction Emojis
Assign one emoji to represent each faction:
- **Crimson Covenant** (♂♀): TBD
- **Iron Tide** (♂☿): TBD
- **Void Legion** (♂☽): TBD
- **Silk Network** (♀☿): TBD
- **Dream Garden** (♀☽): TBD
- **Ghost Protocol** (☿☽): TBD
- **General**: TBD

### Symbol Emojis
- **"Any" symbol**: ☀ (sun) or ☉
- **VP**: ★ (already in use)
- **Conditional VP concepts**: TBD based on card effects

### Conditional VP Format
Replace sentence-based conditional VP with short emojified phrases:
- Example: "★ per Iron Tide card" → "★ x 🦾"
- Example: "2★ if you have Void Legion" → "2★ if +1 🐍"
- Format: `{VP value} [condition emoji]`

---

## 4. Visual Fixes

### Issue 1: Gradient Background Classes
- **Problem**: `-tw-gradient-stops is not defined` error
- **Fix**: Resolve Tailwind CSS configuration for gradient backgrounds

### Issue 2: Glass Panel Centering
- **Target**: Direct child of `class="glass-panel p-6 rounded-xl overflow-auto max-h-[700px] shadow-2xl"`
- **Fix**: Center the `inline-block` element within this container

---

## 5. Testing Strategy

### Dimensional Testing
Create tests that measure **actual rendered DOM elements**:
- ✅ Cards are perfect squares (width === height)
- ✅ All cards have identical dimensions
- ✅ Cards maintain size across different content lengths

### Visual Rendering Testing
- ✅ Background colors render correctly (check computed styles)
- ✅ Face-up vs face-down styling differences
- ✅ Hover opacity changes apply correctly

### Interaction Testing
Test actual DOM changes from user interactions:
- ✅ Clicking available card → card modal appears
- ✅ Modal appears in correct location (side panel vs overlay) based on screen size
- ✅ Clicking "Burn" → button text changes to "Confirm?" and glows
- ✅ Clicking "Burn" again → burn action executes, modal closes
- ✅ Clicking "Bid" → bidding confirmation modal appears
- ✅ Symbols pre-selected correctly when no "any" in cost
- ✅ "Confirm?" button in same position as "Bid" button

### Accessibility Testing
- ✅ Modal can be closed with Escape key
- ✅ Focus management when modal opens/closes
- ✅ Keyboard navigation through buttons

---

## 6. Implementation Priority

1. **Phase 1**: Square cards + scrollable grid
2. **Phase 2**: Card modal (side panel on desktop, overlay on mobile)
3. **Phase 3**: Burn button two-click confirmation
4. **Phase 4**: Bid flow with symbol pre-selection
5. **Phase 5**: Emoji system implementation
6. **Phase 6**: Testing suite implementation
