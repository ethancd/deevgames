// @vitest-environment node
/**
 * P8 / E4.3 candidate A: the forced rescue injection must be BOUNDED
 * (`docs/hard-ai/e3/P8-SLOW-TURNS.md` §6, `docs/hard-ai/e4/E4.3-RESCUE-CAP.md`).
 *
 * The diagnosis. DESIGN §5.6 injection 4 runs the home-checkmate prover's
 * rescue witness (`tactics/prover.ts homeWitness`, installed structurally by
 * `search/root.ts installRescueWitness`) once per generation, with no budget
 * and no price: `search/pvs.ts countProver` bills the full-prover calls
 * `Replica.make` runs during generation, and the witness does not go through
 * `Replica`. In a mutual home race the generations are thousands. Instrumented
 * on P8's champion-seat turn 23 at fixed:100,000 — 92 witness calls, 62.8 s of
 * an 82.2 s search, EVERY one of them stopping at the prover's `PROOF_NODES`
 * cutoff without proving a rescue.
 *
 * The fix, pinned here: `HardConfig.searchFix.rescueCap` caps the witness at N
 * calls per `searchTurn` (`gen/generate.ts RescueCap`, installed by
 * `engine.ts`), charges each allowed call `WorkClass.PROVER` at DESIGN §8's
 * rate, and records a refusal on `GenStats.rescueCapped` so `generateAt` sets
 * `SearchContext.truncated` and the capped node cannot publish to the
 * transposition table — the P6 lane-9 shape, applied to the phase that fix
 * left unpollable.
 *
 *   (a) with the flag ON a fixed-work search of both P8 positions returns a
 *       real, legally replayable plan (not a phase end, not a fallback);
 *   (b) with the flag ABSENT the fixed-work output is byte-identical to the
 *       champion's pinned values — `searchFix` is absent on every profile, so
 *       `injectRescue` pays one null test and nothing else moves. The
 *       constants are the champion's at this lane's head, and the SAME search
 *       is pinned by `hard:cross-commit` (48/48 rows identical against
 *       `lab/results/hard-ai-e3/correct/cross-commit/rows-head-c73204dd.json`);
 *   (c) the arm's OWN fixed-work output is re-pinned, because a candidate that
 *       changes fixed-work output when ON owes a determinism re-pin for its
 *       arm (E4-PLAN, "Rules every lane runs under"). It never touches the
 *       champion's pin.
 *
 * THE FIXTURES are the two P8 positions, reconstructed once with
 * `lab/results/hard-ai-e4/rescue-cap/dump-position.ts` from game seed
 * 2399710895 of `lab/results/hard-ai-e3/ablate/eval-correct-v1/fixed100k`
 * (`e1-g2-s40_3_3-A-white`) and saved as plain `GameState` JSON, so this file
 * needs neither the run artifacts nor the lab. That game ran at the DEFAULT
 * match rules (`elementGraph` `double-thick`, no combat handicap, `shipped`
 * upkeep, `blackCrystalHandicap` 3 in the OPENING only), which is the process
 * default, so no rule has to be installed to replay them.
 *
 * COST. The fixed:100,000 cases are the pathology itself and cannot be
 * shortened without changing what is pinned; the identity pins run at a small
 * rung. 600 s is this file's explicit ceiling.
 */
import { describe, expect, it, vi } from 'vitest';
import { HardEngine } from '../../../src/ai/hard/engine';
import { WorkClass } from '../../../src/ai/hard/search/time';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import type { GameState } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import blackJson from './p8-black-t23.json';
import whiteJson from './p8-white-t25.json';

vi.setConfig({ testTimeout: 600_000 });

/** `e1-g2-s40_3_3-A-white` seed 2399710895, black's seat turn 23 (game turn
 * 23) — recorded at 83,023 ms in the run, 79,299 ms from a fresh
 * `hard@desktop` on an idle box (P8 §2). */
const P8_BLACK_T23 = blackJson as unknown as GameState;
/** The same game, white's seat turn 25 (game turn 25) — the worst turn of the
 * run at 2,641,138 ms, and the §4 position: 32 bodies, 27 of them `fire_1`,
 * both homes under a live race. */
const P8_WHITE_T25 = whiteJson as unknown as GameState;

/** The arm's cap, `lab/hard-ai/ablate/arms.ts` `search-rescue-cap`. */
const CAP = 8;

/** `hard@desktop`: `DESKTOP` with the trained weights, which is what
 * `HardEngine`'s constructor resolves from no patch at all. */
function championEngine(): HardEngine {
  return new HardEngine();
}

/** `hard@ablate:search-rescue-cap`: the champion under the one flag. The arm's
 * patch is exactly this object (`arms.ts searchFixPatch`), and `tests/lab/
 * ablate.test.ts` holds it to one moved factor and its own config hash. */
function cappedEngine(): HardEngine {
  return new HardEngine({ searchFix: { rescueCap: CAP } });
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

function outputOf(r: Awaited<ReturnType<HardEngine['searchTurn']>>): Record<string, unknown> {
  return {
    endKey: r.endKey,
    source: r.source,
    depth: r.depth,
    work: r.work,
    actions: JSON.stringify(r.actions),
  };
}


/**
 * The rung the identity pins run at, and why it is not 100,000.
 *
 * Injection 4 fires only where an enemy stands on the mover's home corner, and
 * on `P8_BLACK_T23` that happens BELOW the root: at rung 10,000 the search
 * never reaches such a node and runs no witness at all, at 25,000 it runs
 * seven, at 50,000 more than the cap, at 100,000 ninety-two. 25,000 is the
 * smallest rung on this position that exercises the capped path in both
 * directions — a call taken and charged, and (at 50,000 and 100,000) a call
 * refused — at 21 s a search instead of 44 s and 44 min.
 */
const PIN_WORK = 25_000;
/** A rung below the first witness call, where the flag can change nothing. */
const INERT_WORK = 10_000;
/** The P8 rung, and the one the row's fixed-work games run at. */
const P8_WORK = 100_000;

/**
 * `hard@desktop` on `P8_BLACK_T23` at `PIN_WORK`, measured at this lane's head.
 * The champion is byte-for-byte untouched by this lane — `searchFix` is absent
 * on every profile — and the same claim is made at 24 other positions and two
 * rungs by `npm run hard:cross-commit` (48 of 48 rows identical on `scoreCc`,
 * `depth`, `work`, `nodes`, `endKey` and `source` against
 * `lab/results/hard-ai-e3/correct/cross-commit/rows-head-c73204dd.json`).
 */
const CHAMPION_PIN = {
  endKey: '01b5db093c57c2e6',
  source: 'search',
  depth: 1,
  work: 25342,
  actions: JSON.stringify([
    { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 9, y: 3 } },
    { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 8, y: 4 } },
    { type: 'END_PLACE_PHASE' },
    { type: 'MOVE', unitId: 'unit-black-19-0', to: { x: 2, y: 7 } },
    { type: 'MOVE', unitId: 'unit-black-8-0', to: { x: 5, y: 4 } },
    { type: 'MOVE', unitId: 'unit-black-22-1', to: { x: 8, y: 1 } },
    { type: 'END_ACTION_PHASE' },
  ]),
};

/**
 * `hard@ablate:search-rescue-cap` on the same position and rung: THE ARM'S OWN
 * determinism pin (E4-PLAN: "a candidate that changes fixed-work output when ON
 * records a determinism re-pin for its arm ... it never touches the champion's
 * pin"). Same turn, same end position, 62 units less work — the seven witness
 * calls this rung takes are charged 40 units each (DESIGN §8's `PROVER` rate),
 * and the meter that runs 280 units richer stops one within-turn node earlier.
 */
const ARM_PIN = {
  endKey: '01b5db093c57c2e6',
  source: 'search',
  depth: 1,
  work: 25280,
  actions: CHAMPION_PIN.actions,
};

describe('P8: the rescue injection is capped, metered and truncating', () => {
  it('returns a real, legally replayable plan at the P8 rung with the flag ON', async () => {
    const startedAt = Date.now();
    const r = await cappedEngine().searchTurn(P8_BLACK_T23, { work: P8_WORK });
    const elapsed = Date.now() - startedAt;

    expect(r.stats.stopReason).toBe('work');
    expect(r.source).not.toBe('fallback');
    expect(r.fallback).toBeUndefined();
    expect(r.actions.length).toBeGreaterThan(1);
    expect(replaysLegally(P8_BLACK_T23, r.actions)).toBe(true);

    // The cap bit: exactly `CAP` witness calls were taken, and every one of
    // them was charged. `stats.proverCalls` counts the full-prover calls
    // `Replica.make` runs (`search/pvs.ts countProver`/`chargeProver`), the
    // witness does not go through `Replica`, so the difference IS the number of
    // witness calls the budget allowed. The champion runs 92 here.
    expect(r.stats.byClass[WorkClass.PROVER] - r.stats.proverCalls).toBe(CAP);

    // The arm's fixed-work re-pin at the P8 rung (see the doc's §5).
    expect({ work: r.work, depth: r.depth, nodes: r.stats.nodes }).toEqual({
      work: 100_160,
      depth: 2,
      nodes: 550,
    });

    // 82.2 s to 105.0 s from `hard@desktop` on this box across three runs,
    // 79,299 ms on the idle box P8 measured; 44.2 s from the arm. Wall-clock,
    // so asserted only under `MUJU_WALLCLOCK_TESTS` (E3-CLOSE-CRITIQUE N9).
    if (process.env.MUJU_WALLCLOCK_TESTS) {
      expect(elapsed).toBeLessThan(75_000);
    } else {
      console.info(`[p8] capped fixed:${P8_WORK} on the black t23 home race: ${elapsed} ms`);
    }
  });

  it('returns a real, legally replayable plan on the 32-body position under a wall', async () => {
    // `P8_WHITE_T25` is NOT run at fixed work here: its cost is the OTHER
    // unmetered prover path (`Replica.make -> provesHomeCheckmate`, 4,432 calls
    // at the P8 rung), which this lane does not touch, so even rung 2,000 costs
    // 630 s there. The doc's §3 carries the 44-minute fixed-work pair; what a
    // test can afford is the wall case, where the answer must still be a turn.
    const r = await cappedEngine().searchTurn(P8_WHITE_T25, { targetMs: 3000, deadlineMs: 3000 });
    expect(r.stats.stopReason).toBe('abort');
    expect(r.source).not.toBe('fallback');
    expect(r.actions.length).toBeGreaterThan(1);
    expect(replaysLegally(P8_WHITE_T25, r.actions)).toBe(true);
  });

  it('changes nothing at a rung below the first witness call', async () => {
    const champion = await championEngine().searchTurn(P8_BLACK_T23, { work: INERT_WORK });
    const capped = await cappedEngine().searchTurn(P8_BLACK_T23, { work: INERT_WORK });
    expect(champion.stats.byClass[WorkClass.PROVER] - champion.stats.proverCalls).toBe(0);
    expect(capped.stats.byClass[WorkClass.PROVER] - capped.stats.proverCalls).toBe(0);
    expect(outputOf(capped)).toEqual(outputOf(champion));
  });
});

describe('P8: fixed work is byte-identical with the flag ABSENT', () => {
  it('returns the champion’s pinned turn, depth and work on the P8 home race', async () => {
    const r = await championEngine().searchTurn(P8_BLACK_T23, { work: PIN_WORK });
    expect(outputOf(r)).toEqual(CHAMPION_PIN);
    expect(replaysLegally(P8_BLACK_T23, r.actions)).toBe(true);
    // Nothing charged: with `searchFix` absent the witness is neither capped
    // nor priced, exactly as DESIGN §5.6 has it.
    expect(r.stats.byClass[WorkClass.PROVER] - r.stats.proverCalls).toBe(0);
  });

  it('re-pins the ARM’s own fixed-work output at the same rung', async () => {
    const r = await cappedEngine().searchTurn(P8_BLACK_T23, { work: PIN_WORK });
    expect(outputOf(r)).toEqual(ARM_PIN);
    expect(replaysLegally(P8_BLACK_T23, r.actions)).toBe(true);
    // Seven calls, all taken: this rung is below the cap, so what moved the
    // work is the PRICE and not a refusal.
    expect(r.stats.byClass[WorkClass.PROVER] - r.stats.proverCalls).toBe(7);
    expect(r.work).toBe(CHAMPION_PIN.work - 62);
  });
});
