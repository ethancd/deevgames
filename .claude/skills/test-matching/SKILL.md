---
name: test-matching
description: Ensures tests accurately reflect implementation behavior. Use when writing tests for new features, fixing test failures, or reviewing test-implementation alignment.
---

# Test-Matching: Ensuring Tests Reflect Reality

## Core Problem

Tests can diverge from implementation in subtle ways:
- Assuming initialization values that don't exist
- Testing function behavior based on name, not actual logic
- Expecting side effects that don't occur
- Propagating early assumptions through multiple tests

This leads to tests that pass/fail for the wrong reasons, making them unreliable quality gates.

---

## The Test-Matching Protocol

### Before Writing Tests

1. **Read the implementation first**
   ```
   DO:  Read createEmptyBoard() → see INITIAL_RESOURCE_LAYERS = 5
   DON'T: Assume "empty" means 0 resources
   ```

2. **Trace the full call path**
   ```
   DO:  Follow generateQueueActions → generateAllActions → dispatch
   DON'T: Test generateQueueActions in isolation without understanding hierarchy
   ```

3. **Check default values explicitly**
   ```typescript
   // Read the source to verify defaults
   const BOARD_SIZE = 10;
   const INITIAL_RESOURCE_LAYERS = 5;
   const MAX_ACTIONS_PER_TURN = 4;
   ```

### While Writing Tests

4. **Test actual behavior, not expected behavior**
   ```typescript
   // BAD: Testing what you think it should do
   it('does not generate queue actions in action phase', () => {
     expect(generateQueueActions(state, 'ai').length).toBe(0);
   });

   // GOOD: Testing what it actually does
   it('generates queue actions based on resources (phase-agnostic)', () => {
     // Note: phase check happens in generateAllActions, not here
     expect(generateQueueActions(state, 'ai').length).toBeGreaterThan(0);
   });
   ```

5. **Verify test setup matches production state**
   ```typescript
   // BAD: Assuming cells are empty
   const board = createEmptyBoard();
   expect(mineActions.length).toBe(0); // WRONG - cells have resources!

   // GOOD: Explicitly setting up the state you need
   const board = createEmptyBoard();
   board.cells[5][5].resourceLayers = 0; // Deplete explicitly
   expect(mineActions.length).toBe(0); // Correct
   ```

6. **Document implementation coupling in test comments**
   ```typescript
   it('prioritizes moves over mining for alpha-beta efficiency', () => {
     // Implementation detail: MOVE priority=1, MINE priority=2
     // Lower number = higher priority in getSortedActions
     expect(sorted[0].type).toBe('MOVE');
   });
   ```

### After Tests Fail

7. **Compare with spec, not intuition**
   - Was the behavior defined in the spec?
   - If not, is the implementation's choice reasonable?
   - Should the test or implementation change?

8. **Check for assumption chains**
   ```
   Test A assumes X → Test B assumes A → Test C assumes B
   If X is wrong, A, B, C all fail for wrong reasons
   ```

---

## Common Divergence Patterns

### Pattern 1: Initialization Mismatch
```typescript
// Implementation
function createEmptyBoard(): BoardState {
  // Creates cells with INITIAL_RESOURCE_LAYERS = 5
}

// Test (WRONG)
it('mining returns nothing on empty cell', () => {
  const board = createEmptyBoard(); // Has 5 resources per cell!
  const unit = placeUnit(...);
  expect(canMine(unit, board)).toBe(false); // FAILS
});

// Test (CORRECT)
it('mining returns nothing on depleted cell', () => {
  const board = createEmptyBoard();
  board.cells[5][5].resourceLayers = 0; // Explicitly deplete
  const unit = placeUnit(...);
  expect(canMine(unit, board)).toBe(false); // PASSES
});
```

### Pattern 2: Function Responsibility Confusion
```typescript
// Implementation has two functions:
// - generateQueueActions: returns all affordable units (helper)
// - generateQueuePhaseActions: adds phase check + END_TURN

// Test (WRONG)
it('generateQueueActions checks phase', () => {
  state.turn.phase = 'action';
  expect(generateQueueActions(state, 'ai').length).toBe(0);
});

// Test (CORRECT)
it('generateAllActions respects phase, generateQueueActions is phase-agnostic', () => {
  state.turn.phase = 'action';
  expect(generateAllActions(state, 'ai').some(a => a.type === 'QUEUE_UNIT')).toBe(false);
  // But the helper itself doesn't check phase
});
```

### Pattern 3: Priority/Ordering Assumptions
```typescript
// Implementation sorts by: ATTACK (0) > MOVE (1) > MINE (2)

// Test (WRONG)
it('prioritizes valuable actions', () => {
  // Assuming "valuable" means mining
  expect(sorted[0].type).toBe('MINE');
});

// Test (CORRECT)
it('sorts by action type priority (attack > move > mine)', () => {
  expect(sorted[0].type).toBe('ATTACK');
  expect(sorted[1].type).toBe('MOVE');
  expect(sorted[2].type).toBe('MINE');
});
```

### Pattern 4: Value vs Count Confusion
```typescript
// Implementation uses unit COST (T1=2, T2=4, T3=7...)

// Test (WRONG)
it('returns positive when AI has more units', () => {
  // 2 T1 units (cost 4) vs 2 T1 units (cost 4) = 0, not positive
  addUnits(board, 2, 'ai');
  addUnits(board, 2, 'player');
  expect(score).toBeGreaterThan(0); // FAILS - score is 0
});

// Test (CORRECT)
it('returns positive when AI has higher total unit value', () => {
  addUnit(board, 'fire_3', 'ai');    // cost 7
  addUnit(board, 'water_1', 'player'); // cost 2
  expect(score).toBeGreaterThan(0); // 7-2 = 5, PASSES
});
```

---

## Test-Matching Checklist

Before committing tests, verify:

- [ ] Read implementation source code for all tested functions
- [ ] Verified initialization/default values match expectations
- [ ] Test comments explain non-obvious implementation details
- [ ] No assumptions about behavior not in spec
- [ ] Test setup explicitly creates required state (no implicit assumptions)
- [ ] Function responsibility boundaries are understood
- [ ] Priority/ordering is based on actual implementation
- [ ] Value calculations use correct metrics (count vs cost vs score)

---

## When Tests and Implementation Disagree

1. **Check the spec** - What was actually required?
2. **Implementation wins** if spec is silent and behavior is reasonable
3. **Document the decision** in test comments
4. **Update both** if implementation has a bug

```typescript
// When fixing: document the resolution
it('sorts moves before mining for alpha-beta pruning efficiency', () => {
  // Postmortem note: Original test assumed MINE > MOVE priority.
  // Implementation uses MOVE=1, MINE=2 for better pruning.
  // Spec was silent on ordering; implementation choice is valid.
  expect(sorted[0].type).toBe('MOVE');
});
```
