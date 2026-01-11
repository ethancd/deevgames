# UX Affordances Skill

Translates game rules and actions into concrete UI/UX affordances. Use this skill when designing or reviewing game specifications to ensure every game action has a corresponding player interaction pattern.

## The Affordance Gap

Game specs often describe **what can happen** without describing **how the player makes it happen**. This creates an "affordance gap" - rules exist but players have no way to invoke them.

### Example: The Queue Phase Gap

**Spec said:** "During queue phase, player can spend crystals to add units to build queue"

**Spec didn't say:**
- What UI element shows available units?
- How does the player see costs?
- How do they see tech requirements (locked/unlocked)?
- What's the click/tap flow to queue a unit?
- What feedback confirms the action?

## The Affordance Checklist

For every game action, answer these questions:

### 1. Discoverability
- **Where** does the player look to find this action?
- Is it always visible or contextually shown?
- How does the player know this action exists?

### 2. Availability
- **When** can this action be taken?
- Visual indicator for available vs unavailable?
- What disables it? (wrong phase, insufficient resources, etc.)

### 3. Selection
- **What** does the player click/tap first?
- Is there a multi-step selection? (select unit → select target)
- Can they cancel/deselect mid-flow?

### 4. Targeting
- **Where** can this action be applied?
- How are valid targets highlighted?
- How are invalid targets shown?

### 5. Confirmation
- **How** does the player confirm the action?
- Is it click-to-confirm or drag-to-apply?
- What prevents accidental actions?

### 6. Feedback
- **What** tells the player the action succeeded?
- Visual/audio feedback?
- State change visible immediately?

## Action-to-Affordance Template

Use this template when speccing game actions:

```
ACTION: [Name]
PHASE: [When available]
PRECONDITIONS: [What must be true]

AFFORDANCE:
  Location: [Where in UI]
  Trigger: [What starts the flow]
  Selection: [Multi-step? What order?]
  Valid targets: [How highlighted]
  Invalid feedback: [What happens on bad input]
  Confirmation: [How finalized]
  Result feedback: [What player sees after]
```

## Common Patterns

### Pattern: Shop/Purchase
```
Location: Sidebar panel, shown during relevant phase
Trigger: Click item in grid
Selection: Click item → see details → click "Buy" button
Valid: Items player can afford, highlighted
Invalid: Grayed out with lock icon or cost shown in red
Confirmation: Explicit "Buy" button with cost
Feedback: Item appears in queue, resources decrement
```

### Pattern: Select-Then-Target
```
Location: Game board
Trigger: Click owned unit
Selection: Unit highlights, valid targets highlight
Valid targets: Different color highlight (green=move, red=attack, cyan=spawn)
Invalid: Click elsewhere deselects
Confirmation: Click on valid target executes
Feedback: Animation, state change, deselect
```

### Pattern: Drag-and-Drop
```
Location: Source area (hand, inventory)
Trigger: Mouse down / touch start
Selection: Item follows cursor, valid drops highlight
Valid targets: Drop zones glow or expand
Invalid: Item snaps back on invalid drop
Confirmation: Mouse up / touch end on valid target
Feedback: Item animates to destination
```

### Pattern: Toggle/Mode
```
Location: Mode buttons or toolbar
Trigger: Click button
Selection: Button shows active state
Valid targets: Contextual to mode
Invalid: Mode auto-exits on invalid action
Confirmation: Immediate on click
Feedback: UI state changes, cursor may change
```

## Phase-Based Visibility

Games with phases should show/hide affordances based on current phase:

| Phase | Visible Affordances |
|-------|---------------------|
| Queue | Unit shop, queue list, end turn button |
| Place | Ready units (selectable), spawn zones (on select), end placement |
| Action | Unit selection, move/attack highlights, action buttons |

## Spec Review Checklist

When reviewing a game spec, ask:

1. **List all actions** the player can take
2. For each action, fill in the affordance template
3. **Identify gaps** where the spec says "player can X" but doesn't say how
4. **Check phase transitions** - how does player know current phase? How do they advance?
5. **Check edge cases** - what if action is unavailable? What feedback?

## Anti-Patterns

### Hidden Actions
"The player can promote units" but no UI element suggests this is possible.
**Fix:** Add visual indicator on promotable units.

### Invisible Prerequisites
"Requires T2 fire unit" but player doesn't know why action is disabled.
**Fix:** Show requirement text on disabled items.

### Ambiguous Selection
Player clicks but doesn't know what got selected.
**Fix:** Clear visual selection state (ring, glow, scale).

### Missing Deselect
Player selected wrong thing, no way to cancel.
**Fix:** Click elsewhere deselects, or explicit cancel button.

### Delayed Feedback
Action succeeds but UI doesn't update until next frame/turn.
**Fix:** Immediate visual feedback, even if temporary.

## Integration with Game Specs

When writing a game spec, include a "Player Interactions" section that maps each game action to its affordance:

```markdown
## Player Interactions

### Queue Phase
- **View available units**: UnitShop panel in sidebar
- **Queue a unit**: Click unit tile → view stats → click Build button
- **End phase**: Click "End Turn" button

### Place Phase
- **Select ready unit**: Click unit in "Ready to Place" section of BuildQueue
- **View spawn zones**: Cyan highlights appear on valid cells when unit selected
- **Place unit**: Click highlighted cell
- **Skip placement**: Click "End Placement" button

### Action Phase
- **Select unit**: Click owned unit on board
- **Move**: Click green-highlighted cell
- **Attack**: Click red-highlighted enemy
- **Mine**: Click "Mine" button in UnitInfo panel (when on resource)
- **End actions**: Click "End Actions" button
```

This ensures every rule has a corresponding interaction.
