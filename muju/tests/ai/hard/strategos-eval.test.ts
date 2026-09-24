// @vitest-environment node
/**
 * STRATEGOS W1.6 (plan `~/.claude/plans/can-you-respond-to-piped-book.md`,
 * B.2 step W1.6): `eval/features.ts`'s `DrawPressure` and `eval/
 * invariants.ts`'s invariant 16, both under `config.ts EvalFix.clockLedger`.
 * `terminalScore`/`decidedCc`'s own share of W1.6 is pinned in
 * `tests/ai/hard/kill-clock-terminal-score.test.ts`.
 *
 * What these tests challenge, rather than restate:
 *
 *   - EXACT antisymmetry of the new `DrawPressure` under a colour flip,
 *     including at a constructed HALF-INTEGER margin — a native `Math.round`
 *     would special-case that tie to `-0` on one side only and silently break
 *     the symmetry the plan requires;
 *   - the clock-2 vs clock-8 paired BEHAVIOUR, read off the actual SCORE
 *     CONTRIBUTION (`weight * feature`, not the feature's raw sign) for both
 *     the leader and the trailer — proving the polarity, not reading it off
 *     the code, because this exact feature's polarity was inverted once
 *     already (2026-09-22 kill-clock postmortem, the napkin);
 *   - invariant 16 is NEVER set under the flag, on a fixture that DOES set it
 *     with the flag off (so the assertion is not vacuous);
 *   - with the flag absent, `DrawPressure` reproduces the legacy formula
 *     EXACTLY (independently re-derived here, not by calling the code under
 *     test) over the P4 determinism corpus — the byte-identical guarantee for
 *     every shipped profile, none of which sets the flag.
 */
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../../src/ai/runtime';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING, Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8 } from '../../../src/ai/hard/tables/context';
import { F, FEATURE_COUNT } from '../../../src/ai/hard/eval/features';
import { DEFAULT_WEIGHTS } from '../../../src/ai/hard/eval/weights';
import { Evaluator } from '../../../src/ai/hard/eval/evaluate';
import type { EvalFix } from '../../../src/ai/hard/config';
import type { PackedState, Side } from '../../../src/ai/hard/types';
import type { GameState } from '../../../src/game/types';
import { readPositions } from '../../../lab/hard-ai/positions/corpus';
import { buildState, randomState, type StateSpec, type UnitSpec } from './game-fixture';

const rep = new Replica();
const SC = new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);
const WHITE: Side = 0;
const BLACK: Side = 1;

function features(fix: EvalFix | null, state: GameState, side: Side): Int32Array {
  const ev = new Evaluator(rep, DEFAULT_WEIGHTS, fix);
  const out = new Int32Array(FEATURE_COUNT);
  ev.full(rep.pack(state), side, SC, 0, out);
  return out;
}

const CLOCK_LEDGER: EvalFix = { clockLedger: true };

// ---------------------------------------------------------------------------
// antisymmetry, including the half-integer rounding tie
// ---------------------------------------------------------------------------

describe('DrawPressure antisymmetry under EvalFix.clockLedger', () => {
  const marginSpec = (whiteGained: number, blackGained: number, clock: number): StateSpec => ({
    units: [
      { def: 'plant_1', owner: 'white', x: 2, y: 2 },
      { def: 'plant_1', owner: 'black', x: 7, y: 7 },
    ],
    reserves: (() => {
      const r = Array(100).fill(0);
      r[22] = 16;
      r[77] = 16;
      return r;
    })(),
    whiteGained,
    blackGained,
    inactivityPlies: clock,
    current: 'white',
    phase: 'place',
  });

  it('f(white) === -f(black) over a spread of margins and clocks', () => {
    const rng = seededRandom(2026092401);
    for (let i = 0; i < 200; i++) {
      const whiteGained = Math.floor(rng() * 200);
      const blackGained = Math.floor(rng() * 200);
      const clock = Math.floor(rng() * (INACTIVITY_LIMIT + 1));
      const state = buildState(marginSpec(whiteGained, blackGained, clock));
      const w = features(CLOCK_LEDGER, state, WHITE)[F.DrawPressure];
      const b = features(CLOCK_LEDGER, state, BLACK)[F.DrawPressure];
      // `w + b === 0`, not `b === -w`: at `w === 0` a native `-0` is numerically
      // (not `Object.is`-) equal to `0`, and this test is about the numeric
      // antisymmetry, not floating-point sign-bit trivia.
      expect(w + b).toBe(0);
    }
  });

  it('holds EXACTLY at a constructed half-integer margin (margin * clock^2 / 100 = 0.5)', () => {
    // Two far-apart, zero-reserve plant_1s (`ledger.ts`'s L = U = `now`
    // exactly): a mined-total margin of 2 at clock 5 gives
    // `2 * 5 * 5 / 100 = 0.5`, the exact tie a native `Math.round` gets wrong
    // on one side (`Math.round(-0.5) === -0`, not `-1`).
    const zero = Array(100).fill(0);
    const plus = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'black', x: 7, y: 7 },
      ],
      reserves: zero,
      whiteGained: 2,
      blackGained: 0,
      inactivityPlies: 5,
    });
    const minus = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'black', x: 7, y: 7 },
      ],
      reserves: zero,
      whiteGained: 0,
      blackGained: 2,
      inactivityPlies: 5,
    });
    const plusOut = features(CLOCK_LEDGER, plus, WHITE)[F.DrawPressure];
    const minusOut = features(CLOCK_LEDGER, minus, WHITE)[F.DrawPressure];
    expect(plusOut).toBe(-1);
    expect(minusOut).toBe(1);
    expect(minusOut).toBe(-plusOut); // the exact tie the native rounding breaks
  });
});

// ---------------------------------------------------------------------------
// clock-2 vs clock-8, read off the SCORE CONTRIBUTION, for leader and trailer
// ---------------------------------------------------------------------------

describe('DrawPressure polarity: proven by behaviour, not by reading the code', () => {
  /** A living mined-total lead for White that stays constant across the two
   * clock values compared below (reserves are generous enough that neither
   * side's projection saturates differently at clock 2 vs clock 8). */
  const leaderSpec = (clock: number): StateSpec => ({
    units: [
      { def: 'plant_1', owner: 'white', x: 2, y: 2 },
      { def: 'plant_1', owner: 'black', x: 7, y: 7 },
    ],
    reserves: (() => {
      const r = Array(100).fill(0);
      r[22] = 16;
      r[77] = 16;
      return r;
    })(),
    whiteGained: 60,
    blackGained: 0,
    inactivityPlies: clock,
    current: 'white',
    phase: 'place',
  });

  it('the LEADER\'s score contribution (w * f) is more favourable at clock 8 than at clock 2', () => {
    const w = DEFAULT_WEIGHTS.w[F.DrawPressure];
    expect(w).toBeLessThan(0); // the frozen weight, restated so the test fails loudly if it ever moves
    const at2 = w * features(CLOCK_LEDGER, buildState(leaderSpec(2)), WHITE)[F.DrawPressure];
    const at8 = w * features(CLOCK_LEDGER, buildState(leaderSpec(8)), WHITE)[F.DrawPressure];
    expect(at2).toBeGreaterThan(0); // already rewarded for being ahead
    expect(at8).toBeGreaterThan(at2); // and MORE rewarded as the clock advances
  });

  it('the TRAILER\'s score contribution (w * f), read from Black, is more UNfavourable at clock 8 than at clock 2', () => {
    const w = DEFAULT_WEIGHTS.w[F.DrawPressure];
    const at2 = w * features(CLOCK_LEDGER, buildState(leaderSpec(2)), BLACK)[F.DrawPressure];
    const at8 = w * features(CLOCK_LEDGER, buildState(leaderSpec(8)), BLACK)[F.DrawPressure];
    expect(at2).toBeLessThan(0); // already penalised for trailing
    expect(at8).toBeLessThan(at2); // and MORE penalised as the clock advances
  });

  it('the clamp holds: at most +-100 on the feature, so at most 800 cc from this weight', () => {
    const huge = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'black', x: 7, y: 7 },
      ],
      reserves: Array(100).fill(16),
      whiteGained: 100_000,
      blackGained: 0,
      inactivityPlies: INACTIVITY_LIMIT,
    });
    const f = features(CLOCK_LEDGER, huge, WHITE)[F.DrawPressure];
    expect(Math.abs(f)).toBeLessThanOrEqual(100);
    expect(Math.abs(DEFAULT_WEIGHTS.w[F.DrawPressure] * f)).toBeLessThanOrEqual(800);
  });
});

// ---------------------------------------------------------------------------
// invariant 16, gated off
// ---------------------------------------------------------------------------

describe('invariant 16 (sitting on a lead) is gated OFF under EvalFix.clockLedger', () => {
  const BLACK_QUIET: UnitSpec[] = [
    { def: 'shadow_1', owner: 'black', x: 8, y: 8 },
    { def: 'plant_1', owner: 'black', x: 7, y: 8 },
  ];
  const aheadSpec: StateSpec = {
    units: [
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
      { def: 'metal_1', owner: 'white', x: 1, y: 3 },
      { def: 'plant_1', owner: 'white', x: 1, y: 4 },
      ...BLACK_QUIET,
    ],
    white: 8,
    black: 2,
    current: 'black',
    phase: 'place',
    inactivityPlies: INACTIVITY_WARNING,
  };

  it('fires with the flag off (not vacuous) and never fires with it on', () => {
    const state = buildState(aheadSpec);
    expect(features(null, state, WHITE)[F.Inv16ClockDiscipline]).toBe(1);
    expect(features(CLOCK_LEDGER, state, WHITE)[F.Inv16ClockDiscipline]).toBe(0);
  });

  it('never fires under the flag over 200 random late-clock positions, even where it would fire without it', () => {
    const rng = seededRandom(2026092402);
    let firedWithoutFlag = 0;
    let firedWithFlag = 0;
    for (let i = 0; i < 200; i++) {
      const state = randomState(rng, 4 + Math.floor(rng() * 10), {
        current: 'black',
        phase: 'place',
        inactivityPlies: INACTIVITY_WARNING + (rng() < 0.5 ? 0 : 1),
      });
      let p: PackedState;
      try {
        p = rep.pack(state);
      } catch {
        continue;
      }
      const off = features(null, state, WHITE)[F.Inv16ClockDiscipline];
      const on = features(CLOCK_LEDGER, state, WHITE)[F.Inv16ClockDiscipline];
      if (off === 1) firedWithoutFlag++;
      if (on !== 0) firedWithFlag++;
      void p;
    }
    expect(firedWithoutFlag).toBeGreaterThan(0); // the sample really does exercise the bit
    expect(firedWithFlag).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// flag absent -> byte-identical to the legacy formula, over the corpus
// ---------------------------------------------------------------------------

describe('flag absent: DrawPressure is byte-identical to the pre-Strategos formula', () => {
  /** The formula as it reads on `a54e9885` (before this change), re-derived
   * independently here rather than imported, so a drift in the untouched
   * branch is caught even if that branch's own source were accidentally
   * edited. */
  function legacyDrawPressure(p: PackedState, me: Side, them: Side): number {
    const clock = p.drawRuleOn === 1 ? p.clock : 0;
    const lead = p.gained[me] - p.gained[them];
    const pressure = Math.trunc((clock * clock * 100) / (INACTIVITY_LIMIT * INACTIVITY_LIMIT));
    const v = -(lead > 0 ? 1 : lead < 0 ? -1 : 0) * pressure;
    return v === 0 ? 0 : v; // normalise a `-0` (this is a numeric-equality check, not a sign-bit one)
  }

  it('over the P4 determinism corpus, fix null (every shipped profile)', () => {
    const rows = readPositions('lab/hard-ai/positions/p4-determinism.jsonl');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const p = rep.pack(row.state);
      const white = features(null, row.state, WHITE)[F.DrawPressure];
      const black = features(null, row.state, BLACK)[F.DrawPressure];
      expect(white).toBe(legacyDrawPressure(p, WHITE, BLACK));
      expect(black).toBe(legacyDrawPressure(p, BLACK, WHITE));
    }
  });

  it('fix: {clockLedger: false} takes the same legacy branch as fix: null', () => {
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'black', x: 7, y: 7 },
      ],
      whiteGained: 40,
      blackGained: 5,
      inactivityPlies: 6,
    });
    const off: EvalFix = { clockLedger: false };
    expect(features(off, state, WHITE)[F.DrawPressure]).toBe(features(null, state, WHITE)[F.DrawPressure]);
    expect(features(off, state, WHITE)[F.Inv16ClockDiscipline]).toBe(features(null, state, WHITE)[F.Inv16ClockDiscipline]);
  });
});
