// @vitest-environment node
/**
 * `SearchFix.killClockPolicy: 'ledger'` (STRATEGOS W1.2, plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, B.2 step W1.2 — "the
 * leak fix"; B.1b's code fact).
 *
 * `killClockRootClock` (`eval/evaluate.ts`) is a MODULE-LEVEL slot, set only
 * by `engine.ts`'s wall-clock pack (~520, ~814) and never saved or restored,
 * so a wall-clock search's root clock can leak into a later FIXED-WORK search
 * in the same process. `hard@desktop`'s bytes are pinned
 * (`tests/lab/ablate.test.ts DESKTOP_WALL3000_HASH`), so this file proves TWO
 * things, not one:
 *
 *   1. `hard@desktop` keeps the leak, unchanged, on purpose (a documentation
 *      test, not a regression) — desktop never sets `killClockPolicy`, so
 *      `killClockHandoffsFromRoot()` always falls back to the legacy slot.
 *   2. `hard@strategos` does not leak: `search/root.ts searchRootInner`
 *      saves the current policy, installs one scoped to ITS OWN packed root
 *      clock, and restores the saved value in a `finally` — including when
 *      the search throws.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INACTIVITY_LIMIT } from '../../../src/game/inactivity';
import type { GameState } from '../../../src/game/types';
import { DESKTOP, strategosPatch } from '../../../src/ai/hard/config';
import { HardEngine } from '../../../src/ai/hard/engine';
import {
  getKillClockPolicy,
  killClockHandoffsFromRoot,
  setKillClockPolicy,
  setKillClockRootClock,
} from '../../../src/ai/hard/eval/evaluate';
import type { KillClockPolicy } from '../../../src/ai/hard/strategy/types';
import { buildState } from './game-fixture';

// E0.5 budget: this file's positions are two-unit and fixed-work; generous
// ceiling anyway, matching sibling HardEngine test files' convention.
vi.setConfig({ testTimeout: 60_000 });

/** Fixture flags the `search/pvs` mock below reads and writes; `vi.hoisted`
 * so the mock factory (hoisted above this file's own top level) and every
 * test share the SAME object rather than racing a TDZ on a plain `let`. */
const hooks = vi.hoisted(() => ({
  /** When true, the mocked `iterativeDeepening` throws instead of running,
   * AFTER `search/root.ts` has already installed the strategos policy --
   * exercising the `finally` restore path without a real crash anywhere else. */
  throwOnIterate: false,
  /** When true, the mock stashes `killClockHandoffsFromRoot()` here before
   * delegating to the real search, so a test can read what the search itself
   * saw while it ran. */
  captureHandoffs: false,
  capturedHandoffs: null as number | null,
}));

vi.mock('../../../src/ai/hard/search/pvs', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/ai/hard/search/pvs')>();
  return {
    ...actual,
    iterativeDeepening: (...args: Parameters<typeof actual.iterativeDeepening>) => {
      // `killClockHandoffsFromRoot` is this file's own top-level import: the
      // closure below is not CALLED until a test's `searchTurn` reaches
      // iterative deepening, long after every module in the graph has
      // finished loading, so there is no import-order hazard in reading it
      // here even though `vi.mock` itself is hoisted above the import.
      if (hooks.captureHandoffs) hooks.capturedHandoffs = killClockHandoffsFromRoot();
      if (hooks.throwOnIterate) throw new Error('injected for kill-clock-policy.test.ts');
      return actual.iterativeDeepening(...args);
    },
  };
});

/**
 * A quiet Phasing position (two tier-1 units, far apart, zero reserves, same
 * shape `tests/ai/hard/cross-engine-draw-clock.test.ts`'s `quietGame` uses)
 * with an explicit nonzero inactivity clock, so `PackedState.clock` — and so
 * `killClockHandoffsFromRoot()` — is a known, nonzero number throughout the
 * search. Far enough apart, and few enough units, that the root's must-answer
 * scan (elimination/home) finds nothing and the search reaches
 * `iterativeDeepening` on every call this file makes.
 */
function quietPhasingWithClock(inactivityPlies: number): GameState {
  const reserves = new Array<number>(100).fill(0);
  return buildState({
    units: [
      { def: 'fire_1', owner: 'white', x: 2, y: 6, id: 'w0' },
      { def: 'fire_1', owner: 'black', x: 6, y: 2, id: 'b0' },
    ],
    current: 'white',
    phase: 'action',
    actions: 4,
    turnNumber: 4,
    inactivityPlies,
    reserves,
  });
}

const WORK = 100_000;

afterEach(() => {
  // Every test in this file either leaves the module slots exactly as it
  // found them or restores them itself; this is the backstop so a failed
  // assertion mid-test cannot leak into the next test OR the next file.
  setKillClockPolicy(null);
  setKillClockRootClock(INACTIVITY_LIMIT - 1);
  hooks.throwOnIterate = false;
  hooks.captureHandoffs = false;
  hooks.capturedHandoffs = null;
});

describe('hard@desktop: unaffected by a prior hard@strategos search (the leak, fixed for strategos)', () => {
  it('returns an identical result for a fixed-work search with vs without a strategos search first', async () => {
    const state = quietPhasingWithClock(4);

    const before = await new HardEngine().searchTurn(state, { work: WORK });

    // A whole strategos search runs in between — the exact scenario the leak
    // used to threaten: its own kill-clock policy must not survive it.
    await new HardEngine(strategosPatch()).searchTurn(state, { work: WORK });
    expect(getKillClockPolicy()).toBeNull();

    const after = await new HardEngine().searchTurn(state, { work: WORK });

    expect(after.scoreCc).toBe(before.scoreCc);
    expect(after.depth).toBe(before.depth);
    expect(after.work).toBe(before.work);
    expect(after.endKey).toBe(before.endKey);
    expect(after.source).toBe(before.source);
    expect(after.stats.nodes).toBe(before.stats.nodes);
    expect(JSON.stringify(after.actions)).toBe(JSON.stringify(before.actions));
  });

  it('DOCUMENTS the pinned leak: a fixed-work desktop search never resets, or even reads through, a leaked legacy clock — by design, not a bug this step may fix', async () => {
    const state = quietPhasingWithClock(4);
    // Stands in for "a prior WALL-CLOCK desktop search packed a root at clock
    // 3" — literally the call `engine.ts`'s wall path makes
    // (`setKillClockRootClock(packed.clock)`), reproduced directly so this
    // test costs nothing in real wall-clock time.
    setKillClockRootClock(3);
    expect(killClockHandoffsFromRoot()).toBe(INACTIVITY_LIMIT - 3);

    // `SearchFix.killClockPolicy` is absent from DESKTOP (`hardConfigFor`),
    // so this search takes NONE of the new save/set/restore branch.
    expect(DESKTOP.searchFix?.killClockPolicy).toBeUndefined();
    await new HardEngine().searchTurn(state, { work: WORK });

    // Still leaked, after a whole completed search: nothing on desktop's path
    // ever calls `setKillClockRootClock` in fixed-work mode, so the value a
    // wall-clock search left behind is exactly what this search's every
    // `killClockHandoffsFromRoot()` call read, and what the NEXT search will
    // still read.
    expect(killClockHandoffsFromRoot()).toBe(INACTIVITY_LIMIT - 3);
  });

  it('never installs the new per-search policy at all', async () => {
    const state = quietPhasingWithClock(4);
    expect(getKillClockPolicy()).toBeNull();
    await new HardEngine().searchTurn(state, { work: WORK });
    expect(getKillClockPolicy()).toBeNull();
  });
});

describe('hard@strategos: the per-search policy is saved, scoped, and restored', () => {
  it("scopes killClockHandoffsFromRoot() to the packed root's own clock while it runs", async () => {
    const state = quietPhasingWithClock(4);
    hooks.captureHandoffs = true;
    const result = await new HardEngine(strategosPatch()).searchTurn(state, { work: WORK });
    expect(result.fallback).toBeUndefined();
    expect(hooks.capturedHandoffs).toBe(INACTIVITY_LIMIT - 4);
    // And gone again once the search has returned.
    expect(getKillClockPolicy()).toBeNull();
  });

  it('restores the PREVIOUSLY-INSTALLED policy (not just null) after a normal search', async () => {
    const prior: KillClockPolicy = { rootClock: 7, reading: null };
    setKillClockPolicy(prior);
    const state = quietPhasingWithClock(4);

    const result = await new HardEngine(strategosPatch()).searchTurn(state, { work: WORK });

    expect(result.fallback).toBeUndefined(); // the ordinary, non-throwing path
    expect(getKillClockPolicy()).toEqual(prior);
  });

  it('restores the PREVIOUSLY-INSTALLED policy even when the search throws', async () => {
    const prior: KillClockPolicy = { rootClock: 7, reading: null };
    setKillClockPolicy(prior);
    hooks.throwOnIterate = true;
    const state = quietPhasingWithClock(4);

    const result = await new HardEngine(strategosPatch()).searchTurn(state, { work: WORK });

    // `engine.ts`'s OWN try/catch around `searchRoot` turns a thrown error
    // into a fallback `RootResult` rather than a rejected `searchTurn` promise
    // (`err instanceof PhasingEconomyProofCutoff` is the only re-throw, and
    // the injected error is a plain `Error`) — so the fallback marker below
    // IS the proof the injected throw actually fired, not that the mock was a
    // no-op.
    expect(result.fallback).toBe('engine-error');
    expect(result.source).toBe('fallback');
    // The `finally` in `search/root.ts searchRootInner` ran on the way out.
    expect(getKillClockPolicy()).toEqual(prior);
  });
});
