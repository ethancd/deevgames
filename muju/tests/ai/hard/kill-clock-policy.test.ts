// @vitest-environment node
/**
 * `SearchFix.killClockPolicy: 'ledger'` (STRATEGOS W1.2, plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, B.2 step W1.2 — "the
 * leak fix"; B.1b's code fact).
 *
 * `killClockRootClock` (`eval/evaluate.ts`) is a MODULE-LEVEL slot, set only
 * by `engine.ts`'s wall-clock pack and `calibrate`, never saved or restored,
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
 *      the search throws — and `engine.ts` never writes the legacy slot for
 *      a `'ledger'` profile, so not even a WALL-CLOCK strategos search can
 *      hand its root clock to a later desktop search.
 *
 * Every equality below is paired with a control that shows the observable is
 * SENSITIVE to the slot (W1.2 review): on `leadAtClock(8)` desktop's
 * fixed-work score is terminal-scale when the slot holds its default and
 * soft (`KILL_CLOCK_SOFT_CC`) when a clock-4 root has leaked into it, so an
 * "identical result" assertion there can actually fail. The quiet clock-4
 * position alone cannot: its searched score is a decided NON-clock loss
 * (−998000 at this work), which no kill-clock scale moves.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INACTIVITY_LIMIT } from '../../../src/game/inactivity';
import type { GameState } from '../../../src/game/types';
import { DESKTOP, strategosPatch, type HardConfig } from '../../../src/ai/hard/config';
import { HardEngine } from '../../../src/ai/hard/engine';
import type { RootResult } from '../../../src/ai/hard/search/root';
import { WIN_CC } from '../../../src/ai/hard/types';
import {
  KILL_CLOCK_FORCED_HANDOFFS,
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

/**
 * A scale verdict below reads `scoreCc` against half a win: a terminal-scale
 * clock-out scores `WIN_CC − ply · MATE_PLY_CC` and a soft one
 * `KILL_CLOCK_SOFT_CC` (`eval/evaluate.ts decidedCc`), and nothing else these
 * two-unit, zero-reserve positions can score comes near half a win.
 */
const TERMINAL_SCALE = WIN_CC / 2; // DERIVED (eval/evaluate.ts decidedCc: WIN_CC − ply·MATE_PLY_CC vs KILL_CLOCK_SOFT_CC)

/** CHOICE (fixed work large enough to reach the clock-out on `leadAtClock(7|8)`
 * at depth ≥ 4 in well under a second; falsifier: a search that never reaches
 * the clock terminal, which the terminal-scale control assertions catch). */
const WORK = 100_000;

/** CHOICE (any nonzero mined lead; falsifier: a tie scores `DRAW_CC` at both
 * scales and makes every scale assertion vacuous). */
const WHITE_LEAD = 5;

/**
 * `quietPhasingWithClock`'s board with White ahead on MINED TOTAL by
 * `WHITE_LEAD` crystals and the clock at `inactivityPlies`, White to move. The
 * lead is booked on an empty cell's INITIAL reserve so the reserve-conservation
 * invariant (`Σ reserve + gained === Σ initialReserve`) still holds. At clock
 * 7 or 8 neither piece can reach the other or a home corner before the clock
 * runs out, so the searched score is the clock-out (the controls below assert
 * its scale): a White win whose hand-off distance from the root is
 * `INACTIVITY_LIMIT − inactivityPlies` — 2 at clock 8 (forced, terminal
 * scale), 3 at clock 7 (beyond `KILL_CLOCK_FORCED_HANDOFFS`, soft) — IF the
 * search reads the root's real clock.
 */
function leadAtClock(inactivityPlies: number): GameState {
  const state = quietPhasingWithClock(inactivityPlies);
  // Every cell of the quiet board starts and stays empty; E5 is where White's
  // mined crystals came from.
  const initialResourceLayers = new Array<number>(100).fill(0);
  initialResourceLayers[44] = WHITE_LEAD;
  return {
    ...state,
    board: { ...state.board, initialResourceLayers },
    players: { ...state.players, white: { ...state.players.white, resourcesGained: WHITE_LEAD } },
  };
}

/** The fields of a `RootResult` a leak could move. */
function summary(r: RootResult): Record<string, unknown> {
  return {
    scoreCc: r.scoreCc,
    depth: r.depth,
    work: r.work,
    endKey: r.endKey,
    source: r.source,
    fallback: r.fallback,
    nodes: r.stats.nodes,
    actions: JSON.stringify(r.actions),
  };
}

/** Exactly W1.2's flag and nothing else, so the paired scale test below pins
 * the policy PLUMBING and not whatever W1.6 (`EvalFix.clockLedger`) later
 * does to strategos's clock scoring. */
const POLICY_ONLY: Partial<HardConfig> = { searchFix: { killClockPolicy: 'ledger' } };

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
  it('control: desktop fixed work on leadAtClock(8) is terminal-scale by default and soft once a clock-4 root leaks in', async () => {
    const target = leadAtClock(8);
    const clean = await new HardEngine().searchTurn(target, { work: WORK });
    expect(clean.fallback).toBeUndefined();
    expect(clean.scoreCc).toBeGreaterThan(TERMINAL_SCALE);

    // Exactly what a strategos search that FORGOT its `finally` would leave
    // behind for its clock-4 root.
    setKillClockPolicy({ rootClock: 4, reading: null });
    const leaked = await new HardEngine().searchTurn(target, { work: WORK });
    expect(leaked.scoreCc).toBeGreaterThan(0);
    expect(leaked.scoreCc).toBeLessThan(TERMINAL_SCALE);
  });

  it('returns an identical result for a fixed-work search with vs without a FIXED-WORK strategos search first', async () => {
    const target = leadAtClock(8);
    const before = await new HardEngine().searchTurn(target, { work: WORK });

    // A whole strategos search on a DIFFERENT clock (4, so a leaked policy
    // would read 6 hand-offs and soften `target`'s clock-out; see the control
    // above) runs in between.
    await new HardEngine(strategosPatch()).searchTurn(quietPhasingWithClock(4), { work: WORK });
    expect(getKillClockPolicy()).toBeNull();
    expect(killClockHandoffsFromRoot()).toBe(1); // the legacy default, untouched

    const after = await new HardEngine().searchTurn(target, { work: WORK });
    expect(summary(after)).toEqual(summary(before));
    expect(after.scoreCc).toBeGreaterThan(TERMINAL_SCALE);
  });

  it('returns an identical result for a fixed-work search with vs without a WALL-CLOCK strategos search first', async () => {
    const target = leadAtClock(8);
    const before = await new HardEngine().searchTurn(target, { work: WORK });

    // `engine.ts`'s wall path packs the root and, for desktop, writes the
    // legacy slot; for a `'ledger'` profile it must not (W1.2 review: before
    // the gate this search turned `after` below into a soft 200).
    // CHOICE: a 50 ms turn is the cheapest real wall-clock search; its own
    // result is not asserted, only what it leaves behind.
    const wall = await new HardEngine(strategosPatch()).searchTurn(quietPhasingWithClock(4), { targetMs: 50, deadlineMs: 50 });
    expect(wall.fallback).toBeUndefined();
    expect(getKillClockPolicy()).toBeNull();
    expect(killClockHandoffsFromRoot()).toBe(1);

    const after = await new HardEngine().searchTurn(target, { work: WORK });
    expect(summary(after)).toEqual(summary(before));
  });

  it('DOCUMENTS the pinned leak: a wall-clock DESKTOP search still hands its root clock to a later fixed-work desktop search — by design, not a bug this step may fix', async () => {
    const target = leadAtClock(8);
    const before = await new HardEngine().searchTurn(target, { work: WORK });
    expect(before.scoreCc).toBeGreaterThan(TERMINAL_SCALE);

    // `SearchFix.killClockPolicy` is absent from DESKTOP (`hardConfigFor`),
    // so neither search below takes the new save/set/restore branch and the
    // wall path writes the legacy slot exactly as before W1.2.
    expect(DESKTOP.searchFix?.killClockPolicy).toBeUndefined();
    await new HardEngine().searchTurn(quietPhasingWithClock(4), { targetMs: 50, deadlineMs: 50 });
    expect(killClockHandoffsFromRoot()).toBe(INACTIVITY_LIMIT - 4);

    // Still leaked, and observably so: the fixed-work search reads the
    // wall-clock root's 6 hand-offs and softens its own 2-hand-off clock-out.
    const after = await new HardEngine().searchTurn(target, { work: WORK });
    expect(after.scoreCc).toBeGreaterThan(0);
    expect(after.scoreCc).toBeLessThan(TERMINAL_SCALE);
    expect(killClockHandoffsFromRoot()).toBe(INACTIVITY_LIMIT - 4);
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

  it('reaches terminalScore: one fact (the root clock, 7 vs 8) flips the clock-out between soft and terminal scale', async () => {
    // Desktop on fixed work reads the legacy default (1 hand-off) and scores
    // BOTH clock-outs as forced (plan B.1b); the policy reads each root's own
    // clock, exactly as desktop's wall path would.
    expect(INACTIVITY_LIMIT - 8).toBeLessThanOrEqual(KILL_CLOCK_FORCED_HANDOFFS);
    expect(INACTIVITY_LIMIT - 7).toBeGreaterThan(KILL_CLOCK_FORCED_HANDOFFS);

    const desktop7 = await new HardEngine().searchTurn(leadAtClock(7), { work: WORK });
    const desktop8 = await new HardEngine().searchTurn(leadAtClock(8), { work: WORK });
    expect(desktop7.scoreCc).toBeGreaterThan(TERMINAL_SCALE);
    expect(desktop8.scoreCc).toBeGreaterThan(TERMINAL_SCALE);

    const policy7 = await new HardEngine(POLICY_ONLY).searchTurn(leadAtClock(7), { work: WORK });
    const policy8 = await new HardEngine(POLICY_ONLY).searchTurn(leadAtClock(8), { work: WORK });
    expect(policy7.fallback).toBeUndefined();
    expect(policy7.scoreCc).toBeGreaterThan(0);
    expect(policy7.scoreCc).toBeLessThan(TERMINAL_SCALE);
    expect(policy8.scoreCc).toBeGreaterThan(TERMINAL_SCALE);
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
