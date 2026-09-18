// @vitest-environment node
/**
 * `tables/economy.ts` (DESIGN §4.12, §5.8).
 *
 * `lab/hard-ai/oracles/economy.ts` is the differential gate (relocation off
 * vs a literal canonical simulation, relocation-on monotonicity, insolvency
 * vs literal `upkeepDue`, the PST_MINE check values). This file pins the
 * arithmetic the DESIGN §5.8 prose specifies by hand: every expected `income`/
 * `stream`/`waste`/`relocationDebt` value below is independently reproduced
 * from `GAMMA_Q16`/`PST_MINE` (`core/income.ts`, already pinned by
 * `income.test.ts`) rather than copied from this module's own output.
 */
import { describe, expect, it, vi } from 'vitest';
import { DEF_INDEX } from '../../../src/ai/hard/core/catalog';
import { GAMMA_Q16, PST_MINE, RESERVE_VALUES } from '../../../src/ai/hard/core/income';
import { Scratch, bbSet } from '../../../src/ai/hard/core/bits';
import { Replica } from '../../../src/ai/hard/core/state';
import { allocTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import {
  ACTION_VALUE_CC,
  ECON_HORIZON,
  RELOCATION_MAX_ACTIONS,
  economyDP,
  economyStayInPlace,
  newEconResult,
} from '../../../src/ai/hard/tables/economy';
import { seededRandom } from '../../../src/ai/runtime';
import { buildState, randomState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.1 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();
/** `economyDP` accepts `sc`/`ply` per the DESIGN §4.12 signature but does not
 * read them (see `economy.ts`'s module doc) — this instance exists only to
 * satisfy the type at call sites. */
const SC = new Scratch(1, 1, 1, 1);

function defId(id: string): number {
  return DEF_INDEX.get(id) as number;
}

function sq(x: number, y: number): number {
  return y * 10 + x;
}

function flatReserves(overrides: Record<number, number>): number[] {
  const out = new Array<number>(100).fill(0);
  for (const [s, r] of Object.entries(overrides)) out[Number(s)] = r;
  return out;
}

/** Independent reference implementation of DESIGN §5.8's `stream` formula. */
function referenceStream(income: readonly number[], upkeep: readonly number[]): number {
  let s = 0;
  for (let t = 1; t <= ECON_HORIZON; t++) {
    s += (GAMMA_Q16[t + 1] * (income[t - 1] - upkeep[t - 1]) * 100) >> 16;
  }
  return s;
}

/** A real `NodeTables` (DESIGN §4.8) with `strike[1 - side]` set to `bits`;
 * every other field is `allocTables`'s untouched zero state — `economyDP`
 * only reads `dist`/`strike` (see `economy.ts`'s module doc). */
function tablesWithEnemyStrike(side: 0 | 1, bits: readonly number[]): NodeTables {
  const t = allocTables();
  const enemy = t.strike[1 - side];
  for (const b of bits) bbSet(enemy, b);
  return t;
}

const NO_STRIKE = tablesWithEnemyStrike(0, []);

describe('tables/economy.ts', () => {
  it('exposes the DESIGN §4.12 constants', () => {
    expect(ECON_HORIZON).toBe(6);
    expect(ACTION_VALUE_CC).toBe(60);
    expect(RELOCATION_MAX_ACTIONS).toBe(8);
  });

  it('economyStayInPlace depletes a lone miner\'s reserve turn by turn (no relocation)', () => {
    // water_1: mine 2, speed 1, tier 1 (no rent). Reserve 5 empties over three
    // turns (2, 2, 1), then the miner sits dry for the rest of the horizon.
    const state = buildState({
      units: [{ def: 'water_1', owner: 'white', x: 5, y: 5 }],
      reserves: flatReserves({ [sq(5, 5)]: 5 }),
    });
    const p = replica.pack(state);
    const out = newEconResult();
    economyStayInPlace(p, 0, out);

    expect([...out.income]).toEqual([2, 2, 1, 0, 0, 0]);
    expect([...out.upkeep]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(out.waste).toBe(0 + 0 + 1 + 2 + 2 + 2);
    expect(out.relocationDebt).toBe(0);
    expect(out.turnsToInsolvency).toBe(ECON_HORIZON + 1); // never (upkeep 0)
    expect(out.stream).toBe(referenceStream([2, 2, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0]));
    expect(out.stream).toBe(371);
  });

  it('turnsToInsolvency finds the first turn the running crystal balance would go negative', () => {
    // lightning_3: mine 0, tier 3 (rent 2/turn) — no income ever, constant rent.
    const noBank = buildState({ units: [{ def: 'lightning_3', owner: 'white', x: 0, y: 0 }], white: 0 });
    const outBroke = newEconResult();
    economyStayInPlace(replica.pack(noBank), 0, outBroke);
    expect([...outBroke.income]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([...outBroke.upkeep]).toEqual([2, 2, 2, 2, 2, 2]);
    expect(outBroke.turnsToInsolvency).toBe(1);
    expect(outBroke.stream).toBe(referenceStream([0, 0, 0, 0, 0, 0], [2, 2, 2, 2, 2, 2]));
    expect(outBroke.stream).toBe(-762);

    const flush = buildState({ units: [{ def: 'lightning_3', owner: 'white', x: 0, y: 0 }], white: 100 });
    const outFlush = newEconResult();
    economyStayInPlace(replica.pack(flush), 0, outFlush);
    expect(outFlush.turnsToInsolvency).toBe(ECON_HORIZON + 1);
  });

  it('a miner with mine === 0 never mines and never relocates, but still owes rent', () => {
    // shadow_1: mine 0, tier 1 (no rent) at a reserve-rich cell — must stay at 0 income.
    const state = buildState({
      units: [{ def: 'shadow_1', owner: 'white', x: 5, y: 5 }],
      reserves: flatReserves({ [sq(5, 5)]: 16 }),
    });
    const p = replica.pack(state);
    const outStay = newEconResult();
    economyStayInPlace(p, 0, outStay);
    const outDp = newEconResult();
    economyDP(p, NO_STRIKE, 0, SC, 0, outDp);
    expect([...outStay.income]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([...outDp.income]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(outDp.relocationDebt).toBe(0);
    expect(outDp.waste).toBe(0);
  });

  it('economyDP relocates a dry miner one square away (actionCost 1, busy 0)', () => {
    // water_1 (mine 2, speed 1) at (5,5); reserve 2 there empties turn 1.
    // (6,5) is one step away with plenty of reserve.
    const state = buildState({
      units: [{ def: 'water_1', owner: 'white', x: 5, y: 5 }],
      reserves: flatReserves({ [sq(5, 5)]: 2, [sq(6, 5)]: 16 }),
    });
    const p = replica.pack(state);
    const out = newEconResult();
    economyDP(p, NO_STRIKE, 0, SC, 0, out);

    // Turn 1: mines the origin (2). Turn 2: dry, relocates (actionCost 1 -> busy
    // ceil(1/4)-1 = 0, so the new square is live again next turn). Turns 3-6:
    // mines from (6,5) at 16 reserve, never running dry within the horizon.
    expect([...out.income]).toEqual([2, 0, 2, 2, 2, 2]);
    expect(out.relocationDebt).toBe(1 * ACTION_VALUE_CC);
    expect(out.waste).toBe(2); // only turn 2's forgone mine-2/take-0
    expect(out.stream).toBe(referenceStream([2, 0, 2, 2, 2, 2], [0, 0, 0, 0, 0, 0]));
    expect(out.stream).toBe(611);

    const stayOut = newEconResult();
    economyStayInPlace(p, 0, stayOut);
    expect(stayOut.stream).toBe(161);
    expect(out.stream).toBeGreaterThan(stayOut.stream); // relocationMonotone, strict here
  });

  it('economyDP charges busy = ceil(actionCost / 4) turns of silence for a longer relocation', () => {
    // water_1 at (0,5); reserve 2 there empties turn 1. The only other
    // reserve on the board is 5 squares away (actionCost 5, speed 1) ->
    // busy = ceil(5/4) = 2 silent turns (the trigger turn plus one more)
    // before mining resumes.
    const state = buildState({
      units: [{ def: 'water_1', owner: 'white', x: 0, y: 5 }],
      reserves: flatReserves({ [sq(0, 5)]: 2, [sq(5, 5)]: 16 }),
    });
    const p = replica.pack(state);
    const out = newEconResult();
    economyDP(p, NO_STRIKE, 0, SC, 0, out);

    expect([...out.income]).toEqual([2, 0, 0, 2, 2, 2]);
    expect(out.relocationDebt).toBe(5 * ACTION_VALUE_CC);
    expect(out.waste).toBe(2); // only the triggering turn's forgone mine-2/take-0
    expect(out.stream).toBe(referenceStream([2, 0, 0, 2, 2, 2], [0, 0, 0, 0, 0, 0]));
    expect(out.stream).toBe(480);
  });

  it('the contested-square discount can flip which candidate a relocating miner picks', () => {
    // water_1 (mine 2, speed 1) at (5,5); reserve 2 empties turn 1.
    // (6,5): reserve 16, one step away, but inside the enemy's strike area ->
    //   PST_MINE[water_1][16] (1025) >> 0, then >> 1 for the contest = 512.
    // (4,5): reserve 7, one step away, uncontested ->
    //   PST_MINE[water_1][7] = 553 > 512, so this is the argmax despite the
    //   smaller reserve, and its shallower stock shows up in the trajectory
    //   (turn 6 takes only 1, not 2 — a signature only the (4,5) choice has).
    const w1 = defId('water_1');
    expect(PST_MINE[w1 * RESERVE_VALUES + 16] >> 1).toBe(512);
    expect(PST_MINE[w1 * RESERVE_VALUES + 7]).toBeGreaterThan(512);

    const state = buildState({
      units: [{ def: 'water_1', owner: 'white', x: 5, y: 5 }],
      reserves: flatReserves({ [sq(5, 5)]: 2, [sq(6, 5)]: 16, [sq(4, 5)]: 7 }),
    });
    const p = replica.pack(state);
    const t = tablesWithEnemyStrike(0, [sq(6, 5)]);
    const out = newEconResult();
    economyDP(p, t, 0, SC, 0, out);

    expect([...out.income]).toEqual([2, 0, 2, 2, 2, 1]);
    expect(out.waste).toBe(2 /* turn 2 dry */ + 1 /* turn 6: mine 2, take 1 */);
    expect(out.stream).toBe(referenceStream([2, 0, 2, 2, 2, 1], [0, 0, 0, 0, 0, 0]));
    expect(out.stream).toBe(563);
  });

  it('a dry miner with no reachable positive-value candidate does not relocate at all', () => {
    // Every square is reserve 0 except the origin's own (already-depleted) cell.
    const state = buildState({
      units: [{ def: 'water_1', owner: 'white', x: 5, y: 5 }],
      reserves: flatReserves({ [sq(5, 5)]: 2 }),
    });
    const p = replica.pack(state);
    const dp = newEconResult();
    economyDP(p, NO_STRIKE, 0, SC, 0, dp);
    const stay = newEconResult();
    economyStayInPlace(p, 0, stay);

    expect([...dp.income]).toEqual([2, 0, 0, 0, 0, 0]);
    expect(dp.relocationDebt).toBe(0);
    expect(dp.stream).toBe(stay.stream);
    expect(dp.stream).toBe(161);
  });

  it('relocationMonotone: economyDP.stream >= economyStayInPlace.stream on random positions', () => {
    const rng = seededRandom(0x4543_4f4e);
    let sawRelocation = 0;
    for (let i = 0; i < 300; i++) {
      const count = 1 + Math.floor(rng() * 14);
      const specOverride: { reserves?: number[] } = rng() < 0.5 ? {} : { reserves: randomReserves(rng) };
      const state = randomState(rng, count, specOverride);
      const p = replica.pack(state);
      // A handful of squares in the enemy's strike area, per run, so the
      // contested-discount path is exercised by the property test too.
      const strikeBits: number[] = [];
      for (let k = 0; k < 5; k++) strikeBits.push(Math.floor(rng() * 100));

      for (const side of [0, 1] as const) {
        const t = tablesWithEnemyStrike(side, strikeBits);
        const dp = newEconResult();
        economyDP(p, t, side, SC, 0, dp);
        const stay = newEconResult();
        economyStayInPlace(p, side, stay);
        expect(dp.stream).toBeGreaterThanOrEqual(stay.stream);
        expect(dp.relocationDebt).toBeGreaterThanOrEqual(0);
        if (dp.relocationDebt > 0) sawRelocation++;
      }
    }
    expect(sawRelocation).toBeGreaterThan(0);
  });
});


/**
 * E3.2 B1/B2/B5 (`config.ts EvalFix`, `docs/hard-ai/e3/E3.2-CORRECTNESS-ARM.md`).
 * Every case above is the champion's arithmetic and stays that way; this block
 * pins that the flags are INVISIBLE unless they are set, and the one identity
 * each of them changes. The reproductions on the named corpus positions live in
 * `tests/ai/hard/eval-correct.test.ts`.
 */
describe('tables/economy.ts — under EvalFix (E3.2 B1/B2/B5)', () => {
  const miner = (reserveHere: number, reserveNext: number) =>
    buildState({
      units: [{ def: 'water_1', owner: 'white', x: 5, y: 5 }],
      reserves: flatReserves({ [sq(5, 5)]: reserveHere, [sq(6, 5)]: reserveNext }),
    });

  function dp(state: ReturnType<typeof buildState>, fix: NodeTables['evalFix']) {
    const t = allocTables();
    t.evalFix = fix;
    const out = newEconResult();
    economyDP(replica.pack(state), t, 0, SC, 0, out);
    return out;
  }

  it('an absent block, an empty block and a false flag are all the champion', () => {
    const state = miner(3, 16);
    const base = dp(state, null);
    for (const fix of [{}, { relocationCompare: false }, { rentOnce: false }, { rot180TieOrder: false }]) {
      const got = dp(state, fix);
      expect(got.stream).toBe(base.stream);
      expect([...got.income]).toEqual([...base.income]);
      expect(got.relocationDebt).toBe(base.relocationDebt);
      expect(got.waste).toBe(base.waste);
    }
  });

  it('B5 removes the upkeep leg from `stream` and leaves every other field alone', () => {
    // lightning_3: mine 0, rent 2/turn — the whole stream is the rent.
    const state = buildState({
      units: [{ def: 'lightning_3', owner: 'white', x: 0, y: 0 }],
      white: 100,
      reserves: flatReserves({}),
    });
    const off = newEconResult();
    economyStayInPlace(replica.pack(state), 0, off);
    const on = newEconResult();
    economyStayInPlace(replica.pack(state), 0, on, { rentOnce: true });
    expect(off.stream).toBe(referenceStream([0, 0, 0, 0, 0, 0], [2, 2, 2, 2, 2, 2]));
    expect(on.stream).toBe(referenceStream([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]));
    expect([...on.upkeep]).toEqual([...off.upkeep]);
    expect(on.turnsToInsolvency).toBe(off.turnsToInsolvency);
  });

  it('B1 relocates the turn the cell empties, not the turn after', () => {
    // Reserve 2, mine 2: empty at the end of turn 1. The champion mines nothing
    // on turn 2 and starts the walk then; the comparison starts it on turn 1.
    const state = miner(2, 16);
    const off = dp(state, null);
    const on = dp(state, { relocationCompare: true });
    expect(off.income[1]).toBe(0);
    expect(on.stream).toBeGreaterThan(off.stream);
    // And with the cell ALREADY dry the two rules are the same rule.
    const dry = miner(0, 16);
    expect(dp(dry, { relocationCompare: true }).stream).toBe(dp(dry, null).stream);
  });

  it('B2 changes nothing when the argmax has no tie', () => {
    // One strictly best target: the tie-break frame cannot matter.
    const state = miner(0, 16);
    expect(dp(state, { rot180TieOrder: true }).stream).toBe(dp(state, null).stream);
    expect(dp(state, { rot180TieOrder: true }).relocationDebt).toBe(dp(state, null).relocationDebt);
  });
});

function randomReserves(rng: () => number): number[] {
  const out = new Array<number>(100);
  for (let s = 0; s < 100; s++) out[s] = Math.floor(rng() * 17);
  return out;
}
