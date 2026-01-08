# Visual Regression Testing for Layout Invariance

This document explains how we ensure UI elements maintain fixed sizes regardless of content.

## The Problem

UI layout shifts occur when content changes cause element dimensions to change:
- Enemy HP bars changing from "20/20" to "5/20" shouldn't resize the entire enemy card
- Turn indicator showing "YOUR TURN" vs "GOBLIN'S TURN ⏳" shouldn't change height
- Title changing from "⚔ Oracle of Delve ⚔" to "⚔ VICTORY! ⚔" shouldn't move other elements

## Our Solution

We use **modern CSS techniques** to prevent layout shifts:

### 1. Fixed Minimum Heights
```css
.enemy-display {
  min-h-[7.5rem]  /* 120px minimum height */
}
```

### 2. Flexbox with Vertical Centering
```css
.container {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
```

### 3. Fixed-Height Slots for Dynamic Content
```css
.status-text {
  min-h-[1.25rem]  /* Reserve space even when empty */
}
```

## Implementation Pattern

Every interactive element follows this structure:

```tsx
<button className="min-h-[7.5rem] flex flex-col justify-center">
  {/* Name - Fixed height */}
  <div className="min-h-[1.75rem] flex items-center justify-center">
    {dynamicContent}
  </div>

  {/* HP Bar - Fixed height */}
  <div className="h-6">
    {/* ... */}
  </div>

  {/* Status - Fixed height (even when empty) */}
  <div className="min-h-[1.25rem] flex items-center justify-center">
    {conditionalContent}
  </div>
</button>
```

## Testing Setup

We use **Vitest 4.0 Browser Mode** with Playwright for visual regression testing.

### Running Tests

```bash
# Run layout invariance tests
npm run test

# Run visual regression tests (browser mode)
npm run test:visual

# Watch mode
npm run test:watch
```

### Test Categories

1. **Layout Invariance Tests** (`layout-invariant.visual.test.tsx`)
   - Verifies fixed heights are applied
   - Compares dimensions across content states
   - Ensures Flexbox centering is used

## Key Techniques

### From Research Sources

Based on 2025 best practices:

1. **Prevent Content Reflow** ([OpenReplay Blog](https://blog.openreplay.com/preventing-layout-shift-modern-css/))
   - Declare dimensions before content arrives
   - Use `min-height` instead of `height` for flexibility
   - Animate only `transform` and `opacity`

2. **Visual Regression Testing** ([Vitest Documentation](https://vitest.dev/guide/browser/visual-regression-testing))
   - Vitest 4.0 stable Browser Mode
   - Playwright provider for consistent screenshots
   - `toMatchScreenshot` assertion for visual diffs

3. **WCAG Reflow Standards**
   - Support 320px minimum width
   - Vertical stacking without horizontal scroll
   - 400% zoom compatibility

## Examples

### Enemy Display
```tsx
// ✅ GOOD: Fixed height prevents layout shift
<button className="min-h-[7.5rem] flex flex-col justify-center">
  <div className="min-h-[1.75rem]">{enemy.name}</div>
  <div className="h-6">{/* HP bar */}</div>
  <div className="min-h-[1.25rem]">{isDead && '☠ DEFEATED ☠'}</div>
</button>

// ❌ BAD: Height changes with content
<button className="p-6">
  <div>{enemy.name}</div>
  <div>{/* HP bar */}</div>
  {isDead && <div>☠ DEFEATED ☠</div>}
</button>
```

### Turn Indicator
```tsx
// ✅ GOOD: Fixed height for player and enemy turns
<div className="min-h-[4rem] flex items-center justify-center">
  {isPlayerTurn ? 'YOUR TURN' : `${enemyName}'S TURN ⏳`}
</div>

// ❌ BAD: Hourglass emoji changes height
<div className="py-4">
  {isPlayerTurn ? 'YOUR TURN' : `${enemyName}'S TURN ⏳`}
</div>
```

## Verification Checklist

When adding new UI components, verify:

- [ ] All interactive elements have `min-h-[...]` classes
- [ ] Dynamic content areas use Flexbox centering
- [ ] Empty states reserve space with `min-height`
- [ ] Tests verify fixed dimensions across states
- [ ] No conditional rendering that changes container size

## Resources

- [Vitest 4.0 Visual Regression Testing](https://vitest.dev/guide/browser/visual-regression-testing)
- [Preventing Layout Shift with Modern CSS](https://blog.openreplay.com/preventing-layout-shift-modern-css/)
- [WCAG Reflow Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html)
- [Effective Visual Testing: Vitest vs Playwright](https://mayashavin.com/articles/visual-testing-vitest-playwright)

## Future Improvements

- Add Playwright Docker container for CI/CD consistency
- Integrate visual regression gates into pull requests
- Add screenshot comparison for multiple viewport sizes (320px, 768px, 1024px)
- Mask dynamic timestamps in screenshots
