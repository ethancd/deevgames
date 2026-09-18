// @vitest-environment node
/**
 * P6: the deadline must be able to interrupt ROOT CANDIDATE GENERATION
 * (`docs/hard-ai/e1/P6-TURN-TIME-EXPLOSION.md`, lane 9).
 *
 * The diagnosis. On two positions of the E1.3 `hard@ablate:k96` vs
 * `hard@desktop` row — both a mid-game turn 20 where one side has massed
 * fourteen `fire_1` bodies — a single seat-turn took 85 s to 180 s against a
 * 3,000 ms allowance. Root `TurnGenerator.generate` ran the full
 * home-checkmate prover through `Replica.make` a few hundred times at ~250-350
 * ms a call, the meter was billed nothing for any of them, and the generator
 * polled only `meter.exhausted()` — so neither the work rung (400,000 units
 * against 679 spent) nor the wall deadline could reach it. `iterativeDeepening`
 * then searched ZERO nodes and the seat played a bare `phaseEndAction`.
 *
 * The fix, pinned here:
 *   (a) a wall-funded search on the recorded position returns at its deadline
 *       with a real, legally replayable plan instead of at 85 s with a phase
 *       end (`search/pvs.ts generateAt`'s stop-aware `WorkSink`,
 *       `search/root.ts mustAnswer`'s `stop()` guard, and `searchRoot`'s
 *       `pickUnsearched` salvage);
 *   (b) with fixed `work` the same position produces the IDENTICAL turn it did
 *       before the fix — `stop()` is constantly false there, so `exhausted()`
 *       is the predicate it always was and nothing else moved `meter.used`.
 *       The constants below were measured against the unmodified tree at
 *       `6b6f625f` before a line of the fix existed;
 *   (c) a deadline that has ALREADY passed still yields a legal turn rather
 *       than an empty plan or a phase end;
 *   (d) generation's full-prover calls are now COUNTED in
 *       `stats.byClass[PROVER]` — and deliberately not PRICED, which is what
 *       (b) rests on (`search/time.ts WorkMeter.count`).
 *
 * THE FIXTURES are the two recorded positions, reconstructed once with
 * `lab/hard-ai/analyze/replay.ts` (`loadReplay` + `reconstruct`, the rebuild
 * `docs/hard-ai/e1/ANALYZE.md` describes) from
 * `<e1-run>/lab/results/hard-ai-e1/ablate/k96/ladder/replays/` and saved as
 * plain `GameState` JSON so this file needs neither the run artifacts nor the
 * lab. Both games ran at the DEFAULT match rules (`elementGraph`
 * `double-thick`, no combat handicap, `shipped` upkeep), which is the process
 * default, so no rule has to be installed to replay them.
 *
 * COST. The fixed-`work` case is ~90 s: EVERY search of this position pays the
 * 60 s root generation, which is the pathology itself and cannot be shortened
 * without changing what is being pinned. 300 s is this file's explicit ceiling.
 */
import { describe, expect, it, vi } from 'vitest';
import { HardEngine } from '../../../src/ai/hard/engine';
import { WORK_COST, WorkClass } from '../../../src/ai/hard/search/time';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import type { GameState } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { buildState } from './game-fixture';
import g2Json from './p6-g2-black-t20.json';
import g5Json from './p6-g5-white-t19.json';

// E0.5 timeout budget: slowest case ~90 s on an idle box (the fixed-work pin;
// see the header), and this file runs next to a two-slot heavy queue. 300 s is
// this file's explicit ceiling.
vi.setConfig({ testTimeout: 300_000 });

/** `e1-g2-s540:0:30`, black's turn 20 — recorded at 170,814 ms in the run. */
const G2_BLACK_T20 = g2Json as unknown as GameState;
/** `e1-g5-s615:3:23`, white's turn 20 — recorded at 179,066 ms. */
const G5_WHITE_T19 = g5Json as unknown as GameState;

/** The allowance the row actually funded, and A11's deadline for it. */
const ALLOWANCE_MS = 3000;
/**
 * What a search of these positions still costs AFTER its deadline, and why
 * this is not `ALLOWANCE_MS + 1000`.
 *
 * Two residues, measured on `e1-g2-s540:0:30` on an idle M2 Max:
 *
 *   - ~250-500 ms of OVERSHOOT. The generator's interruption points are one
 *     within-turn node apart and a node that pays a full-prover call costs
 *     250-350 ms here (P6's profile). That is the granularity the fix has, and
 *     it is the number the diagnosis predicted.
 *   - ~4,300-5,700 ms of CANONICAL VERIFICATION. `verify/replay.ts verifyTurn`
 *     replays the chosen turn through `src/ai/simulate.ts applyAction`, and on
 *     this position the winning line steps a body onto the enemy corner —
 *     after which EVERY canonical `applyAction` re-adjudicates the home gate
 *     against sixteen enemy bodies, at ~1,400 ms a call. That cost is the
 *     CANONICAL ENGINE's, it lives outside `src/ai/hard/`, it is paid on every
 *     path that returns a real turn (the searched one included), and it is not
 *     something a deadline inside the search can reach. See P6's "Fix (lane
 *     9)" section, "what remains".
 *
 * So the bound below is generous on purpose. What it pins is the ORDER: 85 s
 * and 133 s before the fix on these two positions, seconds after it.
 */
const SLACK_MS = 12_000;

/** `hard@desktop`: `DESKTOP` with the trained weights, which is what
 * `HardEngine`'s constructor resolves from no patch at all. */
function desktopEngine(): HardEngine {
  return new HardEngine();
}

/** The canonical replay every caller does: each action legal at the moment it
 * is dispatched (`useAI.ts`, `lab/hard-ai/bots/hard.ts`). */
function replaysLegally(state: GameState, actions: readonly AIAction[]): boolean {
  let current = state;
  for (const action of actions) {
    if (!isLegalAction(current, action)) return false;
    current = applyAction(current, action);
  }
  return true;
}

/** What `meter.used` would be if every class were priced — PROVER included. */
function unitsIfEverythingWerePriced(byClass: Int32Array): number {
  let total = 0;
  for (let cls = 0; cls < byClass.length; cls++) total += byClass[cls] * WORK_COST[cls];
  return total;
}

/** E1-CLOSE-CRITIQUE C7 / E3-CLOSE-CRITIQUE N9: the wall-clock bound is a
 * load-sensitive gate (15.0–20.6 s against 15 s on a box running a ladder row;
 * 5 of 5 alone), so it is asserted only when `MUJU_WALLCLOCK_TESTS` is set.
 * The structural guarantees (abort, a real plan, legal replay) always run. */
function expectInsideAllowance(elapsed: number, label: string): void {
  if (process.env.MUJU_WALLCLOCK_TESTS) {
    expect(elapsed).toBeLessThan(ALLOWANCE_MS + SLACK_MS);
  } else {
    console.info(`[p6] ${label}: ${elapsed} ms (allowance ${ALLOWANCE_MS} + slack ${SLACK_MS}; set MUJU_WALLCLOCK_TESTS=1 to assert)`);
  }
}

describe('P6: a deadline interrupts root generation', () => {
  it('returns inside the allowance on `e1-g2-s540:0:30` black turn 20, with a real plan', async () => {
    const engine = desktopEngine();
    const startedAt = Date.now();
    const r = await engine.searchTurn(G2_BLACK_T20, { targetMs: ALLOWANCE_MS, deadlineMs: ALLOWANCE_MS });
    const elapsed = Date.now() - startedAt;

    // 170,814 ms in the recorded game; 80,288 ms from a fresh `hard@desktop`
    // on this state before the fix.
    expectInsideAllowance(elapsed, 'e1-g2-s540:0:30 black t20');
    expect(r.stats.stopReason).toBe('abort');
    // The whole point: not a bare phase end.
    expect(r.source).not.toBe('fallback');
    expect(r.fallback).toBeUndefined();
    expect(r.actions.length).toBeGreaterThan(1);
    expect(replaysLegally(G2_BLACK_T20, r.actions)).toBe(true);
  });

  it('returns inside the allowance on `e1-g5-s615:3:23` white turn 20, with a real plan', async () => {
    const engine = desktopEngine();
    const startedAt = Date.now();
    const r = await engine.searchTurn(G5_WHITE_T19, { targetMs: ALLOWANCE_MS, deadlineMs: ALLOWANCE_MS });
    const elapsed = Date.now() - startedAt;

    // 179,066 ms in the recorded game; 132,686 ms before the fix.
    expectInsideAllowance(elapsed, 'e1-g5-s615:3:23 white t20');
    expect(r.stats.stopReason).toBe('abort');
    expect(r.source).not.toBe('fallback');
    expect(r.actions.length).toBeGreaterThan(1);
    expect(replaysLegally(G5_WHITE_T19, r.actions)).toBe(true);
  });

  it('counts the generator’s full-prover calls without pricing them', async () => {
    const engine = desktopEngine();
    const r = await engine.searchTurn(G2_BLACK_T20, { targetMs: ALLOWANCE_MS, deadlineMs: ALLOWANCE_MS });
    const proverCalls = r.stats.byClass[WorkClass.PROVER];

    // Before the fix this read 0 for a generation that had run hundreds of
    // full-prover calls, because `generateAt` charged nothing.
    expect(proverCalls).toBeGreaterThan(0);
    expect(r.stats.proverCalls).toBe(proverCalls);

    // And they are COUNTED, not PRICED: `work` carries no `PROVER` term, which
    // is exactly why the fixed-work case below is unchanged. (The root's
    // must-answer scan does price its own calls — it never runs here, because
    // the deadline has passed by the time generation returns.)
    expect(r.work).toBe(unitsIfEverythingWerePriced(r.stats.byClass) - proverCalls * WORK_COST[WorkClass.PROVER]);
  });

  it('still yields a legal turn when the deadline has already passed', async () => {
    // A cheap position, so what is measured is the "stop is true at the first
    // poll" path and not the pathology.
    const position = buildState({
      current: 'white',
      phase: 'place',
      actions: 4,
      turnNumber: 6,
      white: 20,
      black: 18,
      units: [
        { def: 'fire_1', owner: 'white', x: 2, y: 2 },
        { def: 'water_1', owner: 'white', x: 4, y: 3 },
        { def: 'plant_1', owner: 'white', x: 5, y: 5 },
        { def: 'metal_1', owner: 'black', x: 7, y: 6 },
        { def: 'fire_1', owner: 'black', x: 6, y: 8 },
        { def: 'water_1', owner: 'black', x: 8, y: 7 },
      ],
    });
    const engine = desktopEngine();
    // 1 ms: the watchdog is past before the generator reaches its first poll.
    const startedAt = Date.now();
    const r = await engine.searchTurn(position, { targetMs: ALLOWANCE_MS, deadlineMs: 1 });
    const elapsed = Date.now() - startedAt;

    // No pathology here, so nothing but the canonical replay of one cheap turn.
    expect(elapsed).toBeLessThan(1000);
    expect(r.stats.nodes).toBe(0);
    expect(r.actions.length).toBeGreaterThan(0);
    expect(replaysLegally(position, r.actions)).toBe(true);
  });
});

describe('P6: fixed work is byte-identical across the fix', () => {
  /**
   * Measured on the UNMODIFIED tree (`6b6f625f`) with
   * `searchTurn(G2_BLACK_T20, { work: 2000 })`. Fixed-`work` mode arms no
   * watchdog, so `stop()` is constantly false, the stop-aware sink degenerates
   * to the bare meter, and `WorkMeter.count` leaves `used` alone — the search
   * has to land on the same turn, to the action.
   */
  const BEFORE = {
    endKey: '385c9f3fa38e47f1',
    source: 'search',
    depth: 0,
    work: 4440,
    actions: JSON.stringify([
      { type: 'END_PLACE_PHASE' },
      { type: 'ATTACK', unitId: 'unit-black-3-1', targetPosition: { x: 0, y: 0 } },
      { type: 'MOVE', unitId: 'unit-black-3-1', to: { x: 0, y: 0 } },
      { type: 'ATTACK', unitId: 'unit-black-3-1', targetPosition: { x: 0, y: 1 } },
      { type: 'MOVE', unitId: 'black_water_1_1789582001918_5gh40', to: { x: 8, y: 7 } },
      { type: 'END_ACTION_PHASE' },
    ]),
  };

  it('returns the pre-fix turn, score and work on the P6 position', async () => {
    const r = await desktopEngine().searchTurn(G2_BLACK_T20, { work: 2000 });
    expect({
      endKey: r.endKey,
      source: r.source,
      depth: r.depth,
      work: r.work,
      actions: JSON.stringify(r.actions),
    }).toEqual(BEFORE);
    expect(replaysLegally(G2_BLACK_T20, r.actions)).toBe(true);
  });
});
