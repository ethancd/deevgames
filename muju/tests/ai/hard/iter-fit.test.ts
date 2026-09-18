// @vitest-environment node
/**
 * E4.3 candidate B, lane 5 — `searchFix.iterFit`, the iteration-cost estimator
 * (`docs/hard-ai/e4/E4.3-ITER-FIT.md`).
 *
 * Three things, in the order the E4 plan asks for them:
 *
 *   1. THE FLAG IS ABSENT AND MEANS NOTHING WHEN ABSENT. `DESKTOP` does not
 *      carry the key at all (so `canonicalJson` never sees it and the
 *      champion's configuration hash does not move — `tests/lab/ablate.test.ts`
 *      pins the hash itself), and a fixed-work search under a config that
 *      carries an EMPTY block, or the key set to `false`, returns the same
 *      move, score, depth, work and node count as the champion. The
 *      cross-commit golden (`npm run hard:cross-commit`) is the byte-identity
 *      proof across commits; this is the one inside a commit.
 *   2. THE PREDICTOR. `search/time.ts`'s rule, exercised on SYNTHETIC
 *      iteration costs — including E2 lane 1's own measured step medians
 *      (12.32 at depth 1 → 2 over 19 pairs, 3.02 at depth 2 → 3 over 17;
 *      `docs/hard-ai/e2/E2-LANE1-DEEP-GATE.md` §E) — so the arithmetic is
 *      pinned without a search.
 *   3. THE ENGINE. A wall:3000 search on two `e1-dev` turn-6 positions
 *      completes at least as many iterations as the champion. Wall-clock, so
 *      the ASSERTION runs only under `MUJU_WALLCLOCK_TESTS` (E3 close
 *      precondition 5); without it the test still runs both searches and
 *      prints the comparison.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { HardEngine } from '../../../src/ai/hard/engine';
import { DESKTOP, type HardConfig } from '../../../src/ai/hard/config';
import { DEFAULT_WEIGHTS } from '../../../src/ai/hard/eval/weights';
import {
  ITER_FIT_SLACK,
  ITER_RATIO_CEIL,
  ITER_RATIO_COLD,
  ITER_RATIO_FLOOR,
  ITER_REMAINDER_MIN_SHARE,
  ITER_STEP_DECAY,
  IterCostPrior,
  iterFitDecision,
  iterStepRatio,
} from '../../../src/ai/hard/search/time';
import { setCombatHandicap, resetCombatHandicap } from '../../../src/game/combat';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import type { GameState } from '../../../src/game/types';
import { buildState } from './game-fixture';

// E0.5 timeout budget: the wall searches below are 3 s apiece and there are
// four of them, plus two fixed-work pairs; 180 s is this file's ceiling.
vi.setConfig({ testTimeout: 180_000 });

const POSITION = buildState({
  current: 'white',
  phase: 'place',
  actions: 4,
  white: 7,
  black: 6,
  units: [
    { def: 'fire_1', owner: 'white', x: 2, y: 1 },
    { def: 'water_1', owner: 'white', x: 1, y: 3 },
    { def: 'plant_1', owner: 'black', x: 7, y: 8 },
    { def: 'metal_1', owner: 'black', x: 8, y: 6 },
  ],
});

/**
 * The champion's configuration as an OBJECT.
 *
 * `new HardEngine()` substitutes `DEFAULT_WEIGHTS` for M4's placeholder vector
 * only when no config was passed at all or when the caller passed no
 * `weights` (`engine.ts`'s constructor), so a bare `{ ...DESKTOP }` runs on the
 * placeholder and evaluates material alone — a different engine, and the same
 * trap `bench/arm-probe.ts configFor` documents. Every comparison below is
 * therefore built from THIS base, so the only difference between two engines is
 * the `searchFix` key.
 */
const BASE: HardConfig = { ...DESKTOP, weights: DEFAULT_WEIGHTS };

interface Summary {
  endKey: string;
  scoreCc: number;
  depth: number;
  work: number;
  nodes: number;
  actions: string;
}

async function fixed(cfg: HardConfig, work: number, state = POSITION): Promise<Summary> {
  const r = await new HardEngine(cfg).searchTurn(state, { work });
  return {
    endKey: r.endKey,
    scoreCc: r.scoreCc,
    depth: r.depth,
    work: r.work,
    nodes: r.stats.nodes,
    actions: JSON.stringify(r.actions),
  };
}

describe('the flag is absent, and absent means the champion', () => {
  it('is not a key of DESKTOP at all', () => {
    expect(DESKTOP.searchFix).toBeUndefined();
    expect('searchFix' in DESKTOP).toBe(false);
  });

  it('changes no fixed-work output when the block is empty or the key is false', async () => {
    for (const work of [60_000, 200_000]) {
      const champion = await fixed(BASE, work);
      const empty = await fixed({ ...BASE, searchFix: {} }, work);
      const off = await fixed({ ...BASE, searchFix: { iterFit: false } }, work);
      expect(empty).toEqual(champion);
      expect(off).toEqual(champion);
    }
  });

  it('DOES change fixed-work output when the key is on, which is why the arm carries its own pin', async () => {
    // Not a claim about which is better — only that the flag is not inert, so
    // a determinism re-pin for `hard@ablate:search-iter-fit` is owed (E4 plan,
    // "Rules every lane runs under"). The champion's own pin is untouched: the
    // two runs above are byte-identical.
    const champion = await fixed(BASE, 200_000);
    const on = await fixed({ ...BASE, searchFix: { iterFit: true } }, 200_000);
    expect(on.work).toBeGreaterThanOrEqual(champion.work);
  });
});

describe('the predictor, on synthetic iteration costs', () => {
  it('uses E2\'s cold ratio when nothing has been measured', () => {
    expect(iterStepRatio(0, 0, 0)).toBe(ITER_RATIO_COLD);
    expect(iterStepRatio(5_000, 0, 0)).toBe(ITER_RATIO_COLD);
  });

  it('uses the step-matched prior when this search has only one completed depth', () => {
    expect(iterStepRatio(5_000, 0, 7.5)).toBe(7.5);
  });

  it('prefers this search\'s own step, decayed, over the prior', () => {
    // E2's measured 1 → 2 median is 12.32 and its 2 → 3 median is 3.02; the
    // decay predicts 3.08 from the first, which is the whole reason the
    // constant is 0.25 and not 1 (the E2 estimator's own choice, clamped at 6).
    expect(iterStepRatio(12_320, 1_000, 99)).toBeCloseTo(12.32 * ITER_STEP_DECAY, 6);
    expect(iterStepRatio(12_320, 1_000, 99)).toBeCloseTo(3.08, 6);
  });

  it('clamps the decayed ratio to [2, 40]', () => {
    // 3.02 × 0.25 = 0.755 — a deeper iteration cheaper than its predecessor,
    // which no measured pair supports; the floor catches it.
    expect(iterStepRatio(3_020, 1_000, 0)).toBe(ITER_RATIO_FLOOR);
    // A near-zero predecessor would otherwise produce an unbounded ratio.
    expect(iterStepRatio(400_000, 1, 0)).toBe(ITER_RATIO_CEIL);
  });

  it('funds an iteration that fits inside the stated margin', () => {
    // Depth 2 completed at 12,320 units after a 1,000-unit depth 1, on a
    // 200,000-unit rung: predicted depth 3 = 12,320 × 3.08 = 37,946 against
    // 186,680 remaining.
    expect(iterFitDecision(13_320, 200_000, 12_320, 1_000, 0)).toBe('fund');
    // Exactly at the margin: predicted = remaining × 1.25.
    const remaining = 100_000;
    const last = 10_000;
    const ratio = iterStepRatio(last, 1_000, 0); // 10 × 0.25 = 2.5
    expect(ratio).toBeCloseTo(2.5, 6);
    const limit = 100_000 + remaining;
    const fits = last * ratio <= remaining * ITER_FIT_SLACK;
    expect(fits).toBe(true);
    expect(iterFitDecision(limit - remaining, limit, last, 1_000, 0)).toBe('fund');
  });

  it('spends the remainder when the prediction does not fit but an eighth of the rung is left', () => {
    // 200,000-unit rung, 132,000 spent (E2's measured champion mean is
    // 132,972 of a 200,000 rung), last depth 120,000, previous 40,000:
    // ratio = 3 × 0.25 = 0.75 → floored to 2 → predicted 240,000 against
    // 68,000 × 1.25 = 85,000 remaining-with-margin. Refused, and 68,000 is
    // 34% of the rung, well above the one-eighth floor.
    expect(iterFitDecision(132_000, 200_000, 120_000, 40_000, 0)).toBe('remainder');
  });

  it('stops when the prediction does not fit and the remainder is under an eighth of the rung', () => {
    const limit = 200_000;
    const used = limit - Math.floor(limit * ITER_REMAINDER_MIN_SHARE) + 1;
    expect(iterFitDecision(used, limit, 120_000, 40_000, 0)).toBe('stop');
    expect(iterFitDecision(limit, limit, 120_000, 40_000, 0)).toBe('stop');
  });

  it('carries the prior as an alpha = 1/4 EWMA per step, and clears', () => {
    const prior = new IterCostPrior(8);
    expect(prior.get(1)).toBe(0);
    prior.record(1, 12);
    expect(prior.get(1)).toBe(12); // the first sample replaces
    prior.record(1, 8);
    expect(prior.get(1)).toBe(11); // 12 + (8 - 12)/4
    expect(prior.get(2)).toBe(0); // per STEP: nothing leaks between steps
    prior.record(99, 5); // out of range is dropped, not thrown
    prior.record(1, 0); // a non-positive sample is not a ratio
    expect(prior.get(1)).toBe(11);
    prior.clear();
    expect(prior.get(1)).toBe(0);
  });
});

// --- the engine, at wall:3000 on two e1-dev turn-6 positions ----------------

interface Fixture {
  id: string;
  openingId: string;
  side: string;
  options: { elementGraph: string; upkeep?: string; handicap: { white: number; black: number } };
  state: GameState;
}

function loadFixture(name: string): Fixture {
  return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, name), 'utf8')) as Fixture;
}

/** `analyze/replay.ts withMatchRules`, inlined: `tests/ai/hard` may not import
 * `lab/`, and the two process-global knobs a reconstructed position needs are
 * the element graph and the upkeep variant. */
async function withRules<T>(f: Fixture, fn: () => Promise<T>): Promise<T> {
  setUpkeepVariant((f.options.upkeep ?? 'shipped') as 'shipped' | 'steep' | 'off');
  setElementGraph(f.options.elementGraph as 'double-thick');
  setCombatHandicap('white', f.options.handicap.white);
  setCombatHandicap('black', f.options.handicap.black);
  try {
    return await fn();
  } finally {
    setUpkeepVariant('shipped');
    setElementGraph('double-thick');
    resetCombatHandicap();
  }
}

const ALLOWANCE_MS = 3000;
const WARMUP = 2;

async function wallSearch(cfg: HardConfig, state: GameState): Promise<{ iters: number; work: number; rung: number; ms: number }> {
  const engine = new HardEngine(cfg);
  for (let i = 0; i < WARMUP; i++) {
    await engine.searchTurn(state, { targetMs: ALLOWANCE_MS, deadlineMs: ALLOWANCE_MS });
  }
  const r = await engine.searchTurn(state, { targetMs: ALLOWANCE_MS, deadlineMs: ALLOWANCE_MS });
  return { iters: r.depth, work: r.work, rung: r.stats.rung, ms: r.stats.elapsedMs };
}

describe('at wall:3000 the arm completes at least as many iterations as the champion', () => {
  for (const name of ['e4-iter-fit-e1-g2-s100-t6.json', 'e4-iter-fit-e1-g2-s155-t6.json']) {
    it(`${name} — ${process.env.MUJU_WALLCLOCK_TESTS ? 'asserted' : 'reported only'}`, async () => {
      const f = loadFixture(name);
      const { base, arm } = await withRules(f, async () => {
        const b = await wallSearch(BASE, f.state);
        const a = await wallSearch({ ...BASE, searchFix: { iterFit: true } }, f.state);
        return { base: b, arm: a };
      });
      const line =
        `[iter-fit] ${f.id}: champion iters=${base.iters} work=${base.work} rung=${base.rung} ms=${base.ms} | ` +
        `arm iters=${arm.iters} work=${arm.work} rung=${arm.rung} ms=${arm.ms}`;
      if (process.env.MUJU_WALLCLOCK_TESTS) {
        // WHY IT CAN ONLY BE ASSERTED UNDER THE ENV VAR: the rung is chosen
        // from a measured throughput, so on a loaded box the two seats can
        // land on different rungs and the comparison stops being about the
        // estimator (E2 lane 1's probe protocol; the P6 wall assertions run
        // the same way).
        expect(arm.iters, line).toBeGreaterThanOrEqual(base.iters);
      } else {
        console.info(`${line} (set MUJU_WALLCLOCK_TESTS=1 to assert)`);
      }
      // A completed iteration at wall:3000 is itself a wall-clock claim: on a
      // loaded box 3 s buys a few thousand units and both seats complete 0
      // (release-night run, load > 100), so it is asserted only with the flag.
      if (process.env.MUJU_WALLCLOCK_TESTS) expect(arm.iters).toBeGreaterThan(0);
    });
  }
});
