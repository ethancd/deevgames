# Layout Invariance Skill

**Purpose:** Build UIs where geometry stays stable across content changes. Layout shift is a bug, not a styling quirk.

## Core Principle

**Content adapts to containers, not the other way around.**

For any breakpoint, parent container dimensions should remain constant across normal state changes (text length, loading/error states, toggles). When content varies, handle overflow explicitly—don't let it push things around.

---

## Key Strategies

### 1. Declare Geometry First
- Use `min-height`, `grid-template-rows`, or fixed dimensions on containers
- Content fits inside these constraints, never expands them
- CSS Grid with explicit tracks beats flexible Flexbox for main layouts

### 2. Choose an Overflow Policy
Every dynamic text region needs one:
- **Truncate** - Single line with `text-overflow: ellipsis`
- **Clamp** - Fixed line count with `-webkit-line-clamp`
- **Scroll** - Internal `overflow-y: auto`
- **Overlay** - Popover/modal for expansion

No default = unhandled edge case waiting to break your layout.

### 3. Expect Hostile Inputs
- Unbroken UUIDs
- AI-generated rambling
- Localized text that's 2x longer
- Numbers with varying digit counts

Design for the worst case, not the happy path.

### 4. Expansion Goes Out-of-Flow
Variable content should appear in:
- Overlays/modals/popovers
- Scrollable subregions with fixed parent height
- Never by pushing siblings around

---

## Development Process: Test-Driven Stability

### Step 1: Write Tests That Will Fail
Before fixing layout, write tests that vary content and assert geometry stays constant:
```tsx
// Test enemy card with different HP values
const fullHP = render(<Enemy hp={20} />);
const lowHP = render(<Enemy hp={5} />);
// Assert: Both cards have same height
```

**These tests will fail initially. That's good.** Failures show where layout is content-dependent.

### Step 2: Fix Until Tests Pass
Use test failures to guide fixes:
- Add `min-height` where things shrink
- Add overflow policies where text wraps
- Switch to Grid where Flexbox is flexible
- Reserve space for conditional content

Keep iterating until all tests pass.

### Step 3: Test Coverage Checklist
- [ ] Shortest/longest plausible content
- [ ] Empty states
- [ ] Loading states
- [ ] Unbroken tokens (UUIDs)
- [ ] Conditional content present/absent

---

## Quick Fixes Reference

| Problem | Solution |
|---------|----------|
| Card height varies with text | Add `min-h-[...]` to parent |
| Button moves when text changes | Fixed-height container with flexbox centering |
| Content overflows | Choose: truncate, clamp, scroll, or modal |
| Emoji changes height | Reserve height even when absent: `min-h-[...]` |
| Numbers vary in width | Use monospace font or fixed-width container |

---

## Accessibility Note

Layout invariance applies **within** a breakpoint. Different breakpoints can have different layouts. Internal scrolling and truncation are fine. Absolute pixel-locking that breaks zoom is not.

---

## Mental Model

Think of containers as **rigid frames** and content as **fluid matter**:
- When content expands, it must be contained (scroll/truncate/overlay)
- Structural deformation (layout shift) is a failure mode
- Fix it with constraints, not coincidence

---

## Success Criteria

✅ Tests prove stability across content variations
✅ No unexpected layout shifts
✅ Overflow policies explicitly chosen
✅ Geometry declared before content

---

## Example Fix

**Before (unstable):**
```tsx
<button className="p-4">
  <div>{enemy.name}</div>
  {isDead && <div>☠ DEFEATED ☠</div>}
</button>
```

**After (stable):**
```tsx
<button className="p-4 min-h-[7.5rem] flex flex-col justify-center">
  <div className="min-h-[1.75rem]">{enemy.name}</div>
  <div className="min-h-[1.25rem]">{isDead && '☠ DEFEATED ☠'}</div>
</button>
```

Key changes:
- Fixed minimum height on button
- Reserved space for conditional content even when absent
- Flexbox centering for vertical alignment
