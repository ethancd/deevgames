import { describe, expect, it } from 'vitest';
import { UndoStack } from '../src/undo.ts';
import { consumeOnce, resetLifecycle } from '../src/idempotency.ts';
import { createChoiceCursor } from '../src/replay.ts';
import { mulberry32 } from '../src/rng.ts';
import { coinRace } from './fixtures/coin-race.ts';

describe('UndoStack', () => {
  it('pops ordinary actions but refuses across commit points', () => {
    const stack = new UndoStack(coinRace);
    const rng = mulberry32(1);
    const s0 = coinRace.init({}, rng);
    stack.push(s0, rng.getState(), 'step', 'a');
    const s1 = coinRace.apply(s0, 'step', rng);
    stack.push(s1, rng.getState(), 'reveal', 'b'); // commit point

    expect(stack.canUndo()).toBe(false); // top is a commit boundary
    expect(stack.undo()).toBeNull();
    expect(stack.undo({ force: true })).not.toBeNull(); // forced pop allowed
    expect(stack.canUndo()).toBe(true); // 'step' is undoable
    const popped = stack.undo();
    expect(popped?.state).toEqual(s0);
  });
});

describe('consumeOnce', () => {
  it('is keyed on identity, not ordinals — the Lution Round 7 regression', () => {
    const consumed = new Set<string>();
    // Round 2's resolution consumes design ids d1+d2.
    expect(consumeOnce(consumed, 'resolve:d1+d2')).toBe(true);
    // A reload re-fires the same resolution: same identity → rejected,
    // even though a naive ordinal guard (round=2, then round=3) would pass.
    expect(consumeOnce(consumed, 'resolve:d1+d2')).toBe(false);
    // Round 3 consuming DIFFERENT designs is fine.
    expect(consumeOnce(consumed, 'resolve:d3+d4')).toBe(true);
  });
});

describe('resetLifecycle', () => {
  it('clears pending sub-state without mutating the original', () => {
    const match = { round: 3, pendingDesigns: ['x'], pendingPick: 'y', decks: [1] };
    const cleared = resetLifecycle(match, ['pendingDesigns', 'pendingPick']);
    expect(cleared.pendingDesigns).toBeNull();
    expect(cleared.pendingPick).toBeNull();
    expect(cleared.decks).toEqual([1]);
    expect(match.pendingDesigns).toEqual(['x']);
  });
});

describe('createChoiceCursor', () => {
  it('replays recorded choices then goes live', () => {
    const cursor = createChoiceCursor({
      turnKey: 't1',
      choices: [
        { choicePointId: 'target', optionId: 'goblin' },
        { choicePointId: 'mode', optionId: 'fierce' },
      ],
    });
    expect(cursor.resolve('target', ['goblin', 'orc'])).toBe('goblin');
    expect(cursor.resolve('mode', ['calm', 'fierce'])).toBe('fierce');
    expect(cursor.resolve('bonus', ['yes', 'no'])).toBeNull(); // recording exhausted → live
  });

  it('truncates wholesale on mismatch — corrupted recordings are never partially trusted', () => {
    const pending = {
      turnKey: 't1',
      choices: [
        { choicePointId: 'target', optionId: 'goblin' },
        { choicePointId: 'mode', optionId: 'fierce' },
      ],
    };
    const cursor = createChoiceCursor(pending);
    // First choice point doesn't match the recording (different id).
    expect(cursor.resolve('weapon', ['axe', 'bow'])).toBeNull();
    expect(pending.choices).toHaveLength(0); // remainder discarded
    // Later resolves stay live even if ids would have matched.
    expect(cursor.resolve('mode', ['calm', 'fierce'])).toBeNull();
  });

  it('rejects a recorded option that is no longer offered', () => {
    const cursor = createChoiceCursor({
      turnKey: 't1',
      choices: [{ choicePointId: 'target', optionId: 'goblin' }],
    });
    expect(cursor.resolve('target', ['orc', 'rat'])).toBeNull();
  });

  it('record() appends live decisions', () => {
    const pending = { turnKey: 't1', choices: [] as { choicePointId: string; optionId: string }[] };
    const cursor = createChoiceCursor(pending);
    cursor.record('target', 'orc');
    expect(pending.choices).toEqual([{ choicePointId: 'target', optionId: 'orc' }]);
  });
});
