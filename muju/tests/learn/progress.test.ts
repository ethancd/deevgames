import { afterEach, describe, expect, it } from 'vitest';
import { LEARN_PROGRESS_KEY, emptyProgress, loadProgress, markLast, markSolved, nextUnsolved, resetProgress, saveProgress, solvedCount } from '../../src/learn/progress';

afterEach(() => localStorage.clear());

describe('Learn to Play progress', () => {
  it('starts empty and round-trips through localStorage under muju:learn:v1', () => {
    expect(loadProgress()).toEqual({ version: 1, solved: {} });
    const next = markSolved(emptyProgress(), 'move-1', true, '2026-10-02T10:00:00.000Z');
    saveProgress(next);
    expect(JSON.parse(localStorage.getItem(LEARN_PROGRESS_KEY)!)).toEqual({ version: 1, last: 'move-1', solved: { 'move-1': { at: '2026-10-02T10:00:00.000Z', clean: true } } });
    expect(loadProgress()).toEqual(next);
  });

  it('never breaks on unreadable storage: garbage, wrong version, odd entries, throwing storage', () => {
    localStorage.setItem(LEARN_PROGRESS_KEY, '{not json');
    expect(loadProgress()).toEqual(emptyProgress());
    localStorage.setItem(LEARN_PROGRESS_KEY, JSON.stringify({ version: 2, solved: { 'move-1': { at: 'x', clean: true } } }));
    expect(loadProgress()).toEqual(emptyProgress());
    localStorage.setItem(LEARN_PROGRESS_KEY, JSON.stringify({ version: 1, solved: { ok: { at: 't' }, bad: 5, worse: { clean: true } }, last: 7 }));
    expect(loadProgress()).toEqual({ version: 1, solved: { ok: { at: 't', clean: true } } });
    const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    expect(loadProgress(throwing)).toEqual(emptyProgress());
    expect(() => saveProgress(emptyProgress(), throwing)).not.toThrow();
    expect(() => resetProgress(throwing)).not.toThrow();
    expect(loadProgress(null)).toEqual(emptyProgress());
  });

  it('a clean solve stays clean; a hinted solve never demotes it; the first solve time is kept', () => {
    let p = markSolved(emptyProgress(), 'a', false, 't1');
    expect(p.solved.a).toEqual({ at: 't1', clean: false });
    p = markSolved(p, 'a', true, 't2');
    expect(p.solved.a).toEqual({ at: 't1', clean: true });
    p = markSolved(p, 'a', false, 't3');
    expect(p.solved.a).toEqual({ at: 't1', clean: true });
    expect(p.last).toBe('a');
    expect(markLast(p, 'b').last).toBe('b');
  });

  it('counts solved puzzles within a list and picks the first unsolved one to continue from', () => {
    const ids = ['a', 'b', 'c'];
    let p = emptyProgress();
    expect(solvedCount(p, ids)).toBe(0);
    expect(nextUnsolved(p, ids)).toBe('a');
    p = markSolved(markSolved(p, 'a', true), 'c', true);
    expect(solvedCount(p, ids)).toBe(2);
    expect(solvedCount(p)).toBe(2);
    expect(nextUnsolved(p, ids)).toBe('b');
    p = markSolved(p, 'b', true);
    // Everything solved: Continue reopens the first puzzle.
    expect(nextUnsolved(p, ids)).toBe('a');
    expect(nextUnsolved(p, [])).toBeUndefined();
  });

  it('reset removes the record', () => {
    saveProgress(markSolved(emptyProgress(), 'a', true));
    resetProgress();
    expect(localStorage.getItem(LEARN_PROGRESS_KEY)).toBeNull();
    expect(loadProgress()).toEqual(emptyProgress());
  });
});
