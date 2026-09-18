// @vitest-environment node
/**
 * The E3.2 correctness flags, `HardConfig.evalFix` B1–B5
 * (`docs/hard-ai/e3/E3.1-SYNTHESIS.md` §5, `docs/hard-ai/e3/E3.2-CORRECTNESS-ARM.md`).
 *
 * Three things are pinned here.
 *
 * 1. THE CHAMPION DOES NOT MOVE. Every flag is absent from every profile and
 *    `allocTables()` hands out `evalFix: null`, so an engine built with no patch
 *    evaluates exactly as it did before the block existed. The byte-identity
 *    PROOF is `npm run hard:cross-commit` between the E3 head and this branch
 *    (24 positions × {100k, 400k}); what is pinned here is the default state the
 *    proof rests on.
 * 2. EACH BUG REPRODUCES ON ITS CANONICAL CASE with the flag off, and is gone
 *    with it on. The cases are the ones E3.1 named — the three `Inv3` fuzz
 *    positions, the 10-vs-2 voided-anchor position `fuzz-5150-4-377`, a rot180
 *    mirror pair, and an upkeep promotion — plus one authored fixture PAIR built
 *    here for B4, because the invariants suite's own `inv3` pair does not
 *    satisfy DESIGN's predicate (`E3.1-JUDGMENT-CASES` L7-F5).
 * 3. NOTHING IS REPAIRED TO MAKE A FLAG LOOK GOOD. No fixture on disk is
 *    edited; the two B4 members are new states built by `buildState`, and every
 *    expected number below is either a canonical fact (a voided anchor, a
 *    retreat square, a crystal of upkeep) or reproduced from `weights.ts`'s own
 *    coefficients.
 */
import { describe, expect, it, vi } from 'vitest';
import { DESKTOP, LAB, MIDRANGE, PHONE, type EvalFix } from '../../../src/ai/hard/config';
import { HardEngine } from '../../../src/ai/hard/engine';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { Evaluator } from '../../../src/ai/hard/eval/evaluate';
import { DEFAULT_WEIGHTS } from '../../../src/ai/hard/eval/weights';
import { F, FEATURE_COUNT } from '../../../src/ai/hard/eval/features';
import { invariantBits } from '../../../src/ai/hard/eval/invariants';
import { allocTables, buildTables } from '../../../src/ai/hard/tables/context';
import { Approach } from '../../../src/ai/hard/tables/approach';
import { economyDP, economyStayInPlace, newEconResult } from '../../../src/ai/hard/tables/economy';
import { DEF_INDEX } from '../../../src/ai/hard/core/catalog';
import type { GameState } from '../../../src/game/types';
import type { PackedState, Side } from '../../../src/ai/hard/types';
import { mirror180, readPositions, type StoredPosition } from '../../../lab/hard-ai/positions/corpus';
import { buildState } from './game-fixture';
import path from 'node:path';

// E0.5 timeout budget: the corpus scans below are the slow part (1,000 stored
// positions, ~2 s on an M2 Max); 30 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 30_000 });

const replica = new Replica();
const SC = new Scratch(4, 8, 8, 8);
/** `invariantBits` packs invariant `i` at bit `i - 1` (`invariants.ts bit()`). */
const INV3_BIT = 1 << 2;

const FUZZ = path.resolve(import.meta.dirname, '../../../lab/hard-ai/positions/fuzz-1000.jsonl');
let fuzzCache: StoredPosition[] | null = null;
function fuzz(): StoredPosition[] {
  if (fuzzCache === null) fuzzCache = readPositions(FUZZ);
  return fuzzCache;
}
function fuzzPosition(id: string): StoredPosition {
  const got = fuzz().find(p => p.id === id);
  if (got === undefined) throw new Error(`fuzz-1000.jsonl has no position ${id}`);
  return got;
}

function evaluator(fix: EvalFix | null): Evaluator {
  return new Evaluator(replica, DEFAULT_WEIGHTS, fix);
}

function features(e: Evaluator, state: GameState, side: Side): Int32Array {
  const out = new Int32Array(FEATURE_COUNT);
  e.full(replica.pack(state), side, SC, 0, out);
  return out;
}

function tablesFor(p: PackedState, fix: EvalFix | null) {
  const t = allocTables();
  t.evalFix = fix;
  return buildTables(p, SC, 0, 2, t);
}

function sq(x: number, y: number): number {
  return y * 10 + x;
}

function flatReserves(overrides: Record<number, number>): number[] {
  const out = new Array<number>(100).fill(0);
  for (const [s, r] of Object.entries(overrides)) out[Number(s)] = r;
  return out;
}

describe('evalFix: the block is absent everywhere and null by default', () => {
  it('no profile carries it, so `hard@desktop`\'s serialised configuration is unchanged', () => {
    for (const profile of [DESKTOP, LAB, MIDRANGE, PHONE]) {
      expect(profile.evalFix).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(profile, 'evalFix')).toBe(false);
    }
  });

  it('allocTables hands out `evalFix: null`, and a default engine keeps it null', () => {
    expect(allocTables().evalFix).toBeNull();
    const engine = new HardEngine();
    expect(engine.config.evalFix).toBeUndefined();
    expect(engine.ctx.eval.lastTables.evalFix).toBeNull();
    for (const t of engine.ctx.tables) expect(t.evalFix).toBeNull();
  });

  it('an engine built with the block gets it on the evaluator AND on every search table', () => {
    const fix: EvalFix = { rentOnce: true };
    const engine = new HardEngine({ evalFix: fix });
    expect(engine.ctx.eval.lastTables.evalFix).toBe(fix);
    for (const t of engine.ctx.tables) expect(t.evalFix).toBe(fix);
    // And the champion in the same process is untouched.
    expect(new HardEngine().ctx.eval.lastTables.evalFix).toBeNull();
  });

  it('every flag is read as `=== true`, so an absent or false flag is the champion', () => {
    const p = replica.pack(fuzzPosition('fuzz-5150-4-377').state);
    const base = new Int32Array(FEATURE_COUNT);
    evaluator(null).full(p, 0, SC, 0, base);
    for (const fix of [{}, { infiltrationPerAnchor: false }, { rentOnce: false }, { inv3RetreatConjunct: false }]) {
      const out = new Int32Array(FEATURE_COUNT);
      evaluator(fix as EvalFix).full(p, 0, SC, 0, out);
      expect([...out]).toEqual([...base]);
    }
  });
});

describe('B4 — Inv3RetreatSquare drops DESIGN §5.13 row 3\'s `retreats > 0` conjunct', () => {
  /**
   * The authored pair E3.1 asks for. Both members put a white `metal_1`
   * (catalogue cost 5, so `material >= 400`) at (4,4) under a black `fire_2` at
   * (6,4), and give White a second unit far away so the kill would not end the
   * game (`approach.ts`: a lethal hit on the defender's last unit is STRAND,
   * not RETREAT). They differ in ONE canonical fact: whether the attacker has
   * anywhere to go after it hits.
   *
   *   - RETREAT-AVAILABLE: the attacker's escape squares are open, so
   *     `t.retreats > 0` and DESIGN's predicate is SATISFIED. The bit must stay
   *     set with the flag on.
   *   - RETREAT-DENIED: three more white bodies put every escape square inside
   *     White's strike, so `t.retreats === 0` and DESIGN's predicate is NOT
   *     satisfied. The bit must clear with the flag on — this is the case that
   *     is 943 of the champion's 965 firings on the fuzz corpus.
   */
  const retreatAvailable = (): GameState =>
    buildState({
      units: [
        { def: 'metal_1', owner: 'white', x: 4, y: 4 },
        { def: 'metal_1', owner: 'white', x: 0, y: 9 },
        { def: 'fire_2', owner: 'black', x: 6, y: 4 },
      ],
      reserves: flatReserves({}),
    });

  const retreatDenied = (): GameState =>
    buildState({
      units: [
        { def: 'metal_1', owner: 'white', x: 4, y: 4 },
        { def: 'metal_1', owner: 'white', x: 0, y: 9 },
        { def: 'fire_2', owner: 'black', x: 6, y: 4 },
        { def: 'metal_1', owner: 'white', x: 6, y: 2 },
        { def: 'metal_1', owner: 'white', x: 6, y: 6 },
        { def: 'metal_1', owner: 'white', x: 8, y: 4 },
      ],
      reserves: flatReserves({}),
    });

  function inv3(state: GameState, side: Side, fix: EvalFix | null): number {
    const p = replica.pack(state);
    return (invariantBits(p, tablesFor(p, fix), side, SC, 0) & INV3_BIT) !== 0 ? 1 : 0;
  }

  it('the pair differs only in the attacker\'s retreat squares (judge 4)', () => {
    const victim = DEF_INDEX.get('metal_1') as number;
    expect(victim).toBeGreaterThanOrEqual(0);
    for (const [name, state, expected] of [
      ['retreat-available', retreatAvailable(), 1],
      ['retreat-denied', retreatDenied(), 0],
    ] as const) {
      const p = replica.pack(state);
      const t = tablesFor(p, null);
      const slot = p.pieceAt[sq(4, 4)];
      expect(t.approach[slot], `${name} class`).toBe(Approach.RETREAT);
      expect(t.retreats[slot] > 0 ? 1 : 0, `${name} retreats`).toBe(expected);
    }
  });

  it('the champion sets the bit on BOTH members; the flag keeps it only where DESIGN says', () => {
    expect(inv3(retreatAvailable(), 0, null)).toBe(1);
    expect(inv3(retreatDenied(), 0, null)).toBe(1);
    expect(inv3(retreatAvailable(), 0, { inv3RetreatConjunct: true })).toBe(1);
    expect(inv3(retreatDenied(), 0, { inv3RetreatConjunct: true })).toBe(0);
    // Black owns no unit that can be approached this way in either member.
    expect(inv3(retreatAvailable(), 1, { inv3RetreatConjunct: true })).toBe(0);
  });

  it('the me−them feature is non-zero on the retreat-available member with the flag on', () => {
    // `extract` writes `f(me) − f(them)` for the penalties too, so White
    // carrying the bit is +1 at a weight of −250: the penalty lands on White.
    const on = features(evaluator({ inv3RetreatConjunct: true }), retreatAvailable(), 0);
    expect(on[F.Inv3RetreatSquare]).toBe(1);
    expect(features(evaluator({ inv3RetreatConjunct: true }), retreatAvailable(), 1)[F.Inv3RetreatSquare]).toBe(-1);
    expect(DEFAULT_WEIGHTS.w[F.Inv3RetreatSquare]).toBe(-250);
    // Removed on the member DESIGN excludes, and worth exactly one weight.
    const deniedOff = features(evaluator(null), retreatDenied(), 0);
    const deniedOn = features(evaluator({ inv3RetreatConjunct: true }), retreatDenied(), 0);
    expect(deniedOff[F.Inv3RetreatSquare]).toBe(1);
    expect(deniedOn[F.Inv3RetreatSquare]).toBe(0);
  });

  it('reproduces on the three fuzz positions E3.1 named', () => {
    const on: EvalFix = { inv3RetreatConjunct: true };
    // Both sides carry the bit, so the DIFFERENCE hides it; the flag clears both.
    const a = fuzzPosition('fuzz-5150-1651-27').state;
    expect([inv3(a, 0, null), inv3(a, 1, null)]).toEqual([1, 1]);
    expect([inv3(a, 0, on), inv3(a, 1, on)]).toEqual([0, 0]);

    // One side only: the feature moves from −1 to 0 and the score by +250 cc.
    const b = fuzzPosition('fuzz-5150-531-27').state;
    expect([inv3(b, 0, null), inv3(b, 1, null)]).toEqual([0, 1]);
    expect([inv3(b, 0, on), inv3(b, 1, on)]).toEqual([0, 0]);
    expect(features(evaluator(null), b, 0)[F.Inv3RetreatSquare]).toBe(-1); // Black's penalty
    expect(features(evaluator(on), b, 0)[F.Inv3RetreatSquare]).toBe(0);

    // The attacker of White's unit HAS a retreat square, Black's does not, so
    // the flag turns a cancelled pair into a real +1 for White.
    const c = fuzzPosition('fuzz-5150-1044-37').state;
    expect([inv3(c, 0, null), inv3(c, 1, null)]).toEqual([1, 1]);
    expect([inv3(c, 0, on), inv3(c, 1, on)]).toEqual([1, 0]);
    expect(features(evaluator(null), c, 0)[F.Inv3RetreatSquare]).toBe(0);
    expect(features(evaluator(on), c, 0)[F.Inv3RetreatSquare]).toBe(1);
  });

  it('most firings are the case DESIGN excludes (fuzz-1000, first 200 positions)', () => {
    const on: EvalFix = { inv3RetreatConjunct: true };
    let firedOff = 0;
    let firedOn = 0;
    for (const item of fuzz().slice(0, 200)) {
      const p = replica.pack(item.state);
      const tOff = tablesFor(p, null);
      const tOn = tablesFor(p, on);
      for (const side of [0, 1] as Side[]) {
        if ((invariantBits(p, tOff, side, SC, 0) & INV3_BIT) !== 0) firedOff++;
        if ((invariantBits(p, tOn, side, SC, 0) & INV3_BIT) !== 0) firedOn++;
      }
    }
    // The full corpus is 965 -> 22 over 2,000 side-positions
    // (`lab/results/hard-ai-e3/correct/repro.json`); the direction is what a
    // test can pin cheaply.
    expect(firedOff).toBeGreaterThan(50);
    expect(firedOn * 10).toBeLessThan(firedOff);
  });
});

describe('B3 — Infiltration is identically zero as a difference', () => {
  const ON: EvalFix = { infiltrationPerAnchor: true };

  it('the champion scores 0 on every position of the corpus, by construction', () => {
    for (const item of fuzz().slice(0, 300)) {
      const p = replica.pack(item.state);
      const out = new Int32Array(FEATURE_COUNT);
      evaluator(null).full(p, 0, SC, 0, out);
      expect(out[F.Infiltration], item.id).toBe(0);
    }
  });

  it('on fuzz-5150-4-377 the flag reads 8 voided anchors, and the mirror agrees', () => {
    const state = fuzzPosition('fuzz-5150-4-377').state;
    expect(features(evaluator(null), state, 0)[F.Infiltration]).toBe(0);
    expect(features(evaluator(ON), state, 0)[F.Infiltration]).toBe(8);
    // Antisymmetric in the side, and invariant under rot180 + seat swap — the
    // test on the DIFFERENCE that `geometry.test.ts`'s per-side case cannot give.
    expect(features(evaluator(ON), state, 1)[F.Infiltration]).toBe(-8);
    expect(features(evaluator(ON), mirror180(state), 1)[F.Infiltration]).toBe(8);
    expect(features(evaluator(ON), mirror180(state), 0)[F.Infiltration]).toBe(-8);
    // 8 anchors × the DESIGN §5.12.1 weight.
    expect(DEFAULT_WEIGHTS.w[F.Infiltration]).toBe(90);
  });

  it('is a count of voided anchors, not of unit pairs', () => {
    // `RECT[black][a]` is the box from Black's corner (9,9) back to `a`, so a
    // white body at (8,8) sits inside the rectangle of every black anchor with
    // x ≤ 8 and y ≤ 8. Three black anchors, one white body: White voids THREE
    // of Black's anchors and Black voids ONE of White's (all three blacks lie
    // in the single white rectangle), so the difference is +2. The champion's
    // ordered-pair count is 3 on both sides and cancels to 0 — the whole bug.
    const state = buildState({
      units: [
        { def: 'metal_1', owner: 'white', x: 8, y: 8 },
        { def: 'metal_1', owner: 'black', x: 5, y: 5 },
        { def: 'metal_1', owner: 'black', x: 6, y: 6 },
        { def: 'metal_1', owner: 'black', x: 7, y: 7 },
      ],
      reserves: flatReserves({}),
    });
    expect(features(evaluator(null), state, 0)[F.Infiltration]).toBe(0);
    expect(features(evaluator(ON), state, 0)[F.Infiltration]).toBe(2);
    expect(features(evaluator(ON), state, 1)[F.Infiltration]).toBe(-2);
  });
});

describe('B2 — the relocation tie order is not rot180-invariant', () => {
  const ON: EvalFix = { rot180TieOrder: true };
  const ECONOMY_FEATURES = [F.EconDelta, F.DepletionWaste, F.RelocationDebt] as const;

  it('reproduces a violation from `eval-audit/fuzz-1000/violations.json` with the flag off', () => {
    const state = fuzzPosition('fuzz-5150-1097-11').state;
    const a = features(evaluator(null), state, 0);
    const b = features(evaluator(null), mirror180(state), 1);
    expect(a[F.RelocationDebt]).toBe(-1);
    expect(b[F.RelocationDebt]).toBe(0);
  });

  it('the mirror pair agrees on all three economy features with the flag on', () => {
    for (const id of ['fuzz-5150-1097-11', 'fuzz-5150-1651-27', 'fuzz-5150-1044-37']) {
      const state = fuzzPosition(id).state;
      const a = features(evaluator(ON), state, 0);
      const b = features(evaluator(ON), mirror180(state), 1);
      for (const i of ECONOMY_FEATURES) expect(b[i], `${id} feature ${i}`).toBe(a[i]);
    }
  });

  it('every feature of every mirror pair agrees with the flag on (fuzz-1000, first 150)', () => {
    const on = evaluator(ON);
    const off = evaluator(null);
    let violationsOff = 0;
    for (const item of fuzz().slice(0, 150)) {
      const p = replica.pack(item.state);
      const q = replica.pack(mirror180(item.state));
      const fa = new Int32Array(FEATURE_COUNT);
      on.full(p, 0, SC, 0, fa);
      const fb = new Int32Array(FEATURE_COUNT);
      on.full(q, 1, SC, 0, fb);
      expect([...fb], `${item.id} mirror`).toEqual([...fa]);

      const ga = new Int32Array(FEATURE_COUNT);
      off.full(p, 0, SC, 0, ga);
      const gb = new Int32Array(FEATURE_COUNT);
      off.full(q, 1, SC, 0, gb);
      if (ECONOMY_FEATURES.some(i => ga[i] !== gb[i])) violationsOff++;
    }
    // The champion disagrees with its own mirror on 585 of 1,000.
    expect(violationsOff).toBeGreaterThan(30);
  });
});

describe('B5 — rent is charged twice', () => {
  const ON: EvalFix = { rentOnce: true };

  /** A tier-3 body owes 2 crystals of rent per turn and mines nothing, so the
   * whole economy block is the rent. `economy.test.ts` pins the champion's
   * −762 stream for exactly this state. */
  const rentOnly = (): GameState =>
    buildState({ units: [{ def: 'lightning_3', owner: 'white', x: 0, y: 0 }], white: 100, reserves: flatReserves({}) });

  it('the upkeep leg leaves `stream` and nothing else does', () => {
    const p = replica.pack(rentOnly());
    const off = newEconResult();
    economyStayInPlace(p, 0, off);
    const on = newEconResult();
    economyStayInPlace(p, 0, on, ON);
    expect(off.stream).toBe(-762);
    expect(on.stream).toBe(0); // no income, and the rent is `Rent`'s job
    expect([...on.upkeep]).toEqual([...off.upkeep]); // the bill is still reported
    expect([...on.income]).toEqual([...off.income]);
    expect(on.waste).toBe(off.waste);
    expect(on.relocationDebt).toBe(off.relocationDebt);
  });

  it('leaves `turnsToInsolvency` alone: the running balance is cash flow, not score', () => {
    const broke = buildState({
      units: [{ def: 'lightning_3', owner: 'white', x: 0, y: 0 }],
      white: 0,
      reserves: flatReserves({}),
    });
    const p = replica.pack(broke);
    const off = newEconResult();
    economyStayInPlace(p, 0, off);
    const on = newEconResult();
    economyStayInPlace(p, 0, on, ON);
    expect(off.turnsToInsolvency).toBe(1);
    expect(on.turnsToInsolvency).toBe(1);
  });

  it('charges one crystal per turn of upkeep once, not 1.72 times', () => {
    // Two positions differing in one crystal per turn of rent at an unchanged
    // mining rate: `water_1` (upkeep 0) vs `water_2` (upkeep 1), both mine 2.
    const withUnit = (def: string): GameState =>
      buildState({
        units: [
          { def, owner: 'white', x: 5, y: 5 },
          { def: 'water_1', owner: 'black', x: 4, y: 4 },
        ],
        white: 20,
        black: 20,
        reserves: flatReserves({ [sq(5, 5)]: 16, [sq(4, 4)]: 16 }),
      });
    const cheap = withUnit('water_1');
    const dear = withUnit('water_2');

    const off = { a: features(evaluator(null), cheap, 0), b: features(evaluator(null), dear, 0) };
    const on = { a: features(evaluator(ON), cheap, 0), b: features(evaluator(ON), dear, 0) };

    // One crystal per turn of upkeep, in both readings.
    expect(off.b[F.Rent] - off.a[F.Rent]).toBe(1);
    expect(on.b[F.Rent] - on.a[F.Rent]).toBe(1);
    // The champion ALSO moves EconDelta; with the flag on it does not.
    expect(off.b[F.EconDelta] - off.a[F.EconDelta]).toBeLessThan(0);
    expect(on.b[F.EconDelta] - on.a[F.EconDelta]).toBe(0);

    const rentCc = DEFAULT_WEIGHTS.w[F.Rent];
    expect(rentCc).toBe(-422); // RENT_PV, the six-turn present value DESIGN states
    const offCharge =
      rentCc * (off.b[F.Rent] - off.a[F.Rent]) +
      DEFAULT_WEIGHTS.w[F.EconDelta] * (off.b[F.EconDelta] - off.a[F.EconDelta]);
    const onCharge =
      rentCc * (on.b[F.Rent] - on.a[F.Rent]) +
      DEFAULT_WEIGHTS.w[F.EconDelta] * (on.b[F.EconDelta] - on.a[F.EconDelta]);
    expect(onCharge).toBe(rentCc);
    expect(offCharge).toBeLessThan(rentCc);
    expect(offCharge / rentCc).toBeGreaterThan(1.5);
  });
});

describe('B1 — the relocation trigger is not monotone in reserve', () => {
  const ON: EvalFix = { relocationCompare: true };

  /**
   * The mechanism, minimal: a `water_1` (mine 2, speed 1) on a cell with 3
   * crystals, one step from a full one. The champion waits for the cell to go
   * completely dry before it moves; the flag moves as soon as the target beats
   * what is left.
   */
  const state = (reserveUnderMiner: number): GameState =>
    buildState({
      units: [{ def: 'water_1', owner: 'white', x: 5, y: 5 }],
      reserves: flatReserves({ [sq(5, 5)]: reserveUnderMiner, [sq(6, 5)]: 16 }),
    });

  function stream(reserveUnderMiner: number, fix: EvalFix | null): number {
    const p = replica.pack(state(reserveUnderMiner));
    const t = allocTables();
    t.evalFix = fix;
    const out = newEconResult();
    economyDP(p, t, 0, SC, 0, out);
    return out.stream;
  }

  it('the champion projects LESS from a board with one more crystal (judge 4)', () => {
    // Both boards are identical but for one crystal under the miner.
    expect(stream(3, null)).toBeLessThan(stream(2, null));
  });

  it('with the flag on, the extra crystal does not lower the projection', () => {
    expect(stream(3, ON)).toBeGreaterThanOrEqual(stream(2, ON));
  });

  it('on an ALREADY dry cell the flagged rule is DESIGN\'s rule: the floor is `PST_MINE[def][0]` = 0', () => {
    // Reserve 0 under the miner: `take === 0` on turn 1, the floor is 0, and
    // both readings relocate on the same turn for the same reason.
    expect(stream(0, ON)).toBe(stream(0, null));
  });

  it('relocates a turn EARLIER than the champion when the cell empties', () => {
    // Reserve 2, mine 2: the cell is empty at the END of turn 1. The champion
    // needs a turn of `take === 0` to notice, and spends turn 2 mining nothing;
    // the comparison sees an empty cell the moment it is empty.
    expect(stream(2, ON)).toBeGreaterThan(stream(2, null));
  });

  it('never projects more than the board holds, and never less than staying put', () => {
    for (const r of [0, 1, 2, 3, 4, 8, 16]) {
      const p = replica.pack(state(r));
      const t = allocTables();
      t.evalFix = ON;
      const dp = newEconResult();
      economyDP(p, t, 0, SC, 0, dp);
      const stay = newEconResult();
      economyStayInPlace(p, 0, stay, ON);
      expect(dp.stream, `reserve ${r}`).toBeGreaterThanOrEqual(stay.stream);
      let total = 0;
      for (let s = 0; s < 100; s++) total += p.reserve[s];
      expect(dp.stream).toBeLessThanOrEqual(total * 100);
    }
  });
});

/**
 * B6 (lane 14, `docs/hard-ai/e3/E3.2-CORRECTNESS-B6.md`) — the residue §6 of
 * `E3.2-CORRECTNESS-ARM.md` records as a known caveat of the bundle.
 *
 * `tables/approach.ts classifyFrom` breaks a tie between two equally cheap
 * attack squares of the same class by scan order, which rot180 reverses, so
 * `retreats` — read by `Inv3RetreatSquare` once B4 is on — can differ between a
 * position and its own mirror. The five ids below are every such position on
 * `fuzz-1000` (`approach-tie.test.ts` holds the mechanism and the tie-free
 * invariance; this block holds the feature the arm is priced on).
 */
describe('B6 — the approach tie order is not rot180-invariant', () => {
  const B4: EvalFix = { inv3RetreatConjunct: true };
  const B4_B6: EvalFix = { inv3RetreatConjunct: true, approachTieOrder: true };
  /** id -> [position side 0, mirror side 1] with B4 on and B6 off. */
  const VIOLATORS: Record<string, [number, number]> = {
    'fuzz-5150-4-132': [0, 1],
    'fuzz-5150-1525-94': [0, 1],
    'fuzz-5150-1103-127': [-1, 0],
    'fuzz-5150-263-483': [1, 0],
    'fuzz-5150-263-488': [1, 0],
  };

  it('all five disagree with their own mirror on Inv3RetreatSquare with B4 on and B6 off', () => {
    for (const [id, [pos, mir]] of Object.entries(VIOLATORS)) {
      const state = fuzzPosition(id).state;
      expect(features(evaluator(B4), state, 0)[F.Inv3RetreatSquare], `${id} position`).toBe(pos);
      expect(features(evaluator(B4), mirror180(state), 1)[F.Inv3RetreatSquare], `${id} mirror`).toBe(mir);
      expect(pos).not.toBe(mir);
      // One weight, and the weight is −250, so each is a 250 cc disagreement.
      expect(DEFAULT_WEIGHTS.w[F.Inv3RetreatSquare]).toBe(-250);
    }
  });

  it('with B6 on, all five agree with their mirror on Inv3RetreatSquare', () => {
    const e = evaluator(B4_B6);
    for (const id of Object.keys(VIOLATORS)) {
      const state = fuzzPosition(id).state;
      const a = features(e, state, 0);
      const b = features(e, mirror180(state), 1);
      expect(b[F.Inv3RetreatSquare], `${id} mirror`).toBe(a[F.Inv3RetreatSquare]);
    }
  });

  it('with all six flags on, all five agree with their mirror on all 58 features', () => {
    // B4+B6 alone still leaves B2's 585 economy disagreements (§2 B2), so the
    // whole-vector claim needs `rot180TieOrder` beside it: with B1-B6 on, the
    // fuzz corpus has 0 of 1,000 mirror violations in any feature.
    const e = evaluator({
      relocationCompare: true,
      rot180TieOrder: true,
      infiltrationPerAnchor: true,
      inv3RetreatConjunct: true,
      rentOnce: true,
      approachTieOrder: true,
    });
    for (const id of Object.keys(VIOLATORS)) {
      const state = fuzzPosition(id).state;
      const a = features(e, state, 0);
      const b = features(e, mirror180(state), 1);
      expect([...b], `${id} mirror`).toEqual([...a]);
    }
  });

  it('B6 alone changes no feature: `retreats` is read only under B4', () => {
    // `t.retreats[slot]` has exactly one reader in the evaluator
    // (`eval/invariants.ts:294`), and that reader is itself gated on
    // `inv3RetreatConjunct`. So `eval-fix-b6` as a SINGLE flag is the champion's
    // evaluation with a different configuration hash — which is why the doc
    // reports its exam as identical and why the flag is only useful beside B4.
    const off = evaluator(null);
    const on = evaluator({ approachTieOrder: true });
    for (const id of [...Object.keys(VIOLATORS), 'fuzz-5150-4-377', 'fuzz-5150-1651-27']) {
      const p = replica.pack(fuzzPosition(id).state);
      for (const side of [0, 1] as Side[]) {
        const a = new Int32Array(FEATURE_COUNT);
        off.full(p, side, SC, 0, a);
        const b = new Int32Array(FEATURE_COUNT);
        on.full(p, side, SC, 0, b);
        expect([...b], `${id} side ${side}`).toEqual([...a]);
      }
    }
  });
});
