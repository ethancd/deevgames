// @vitest-environment node
/**
 * STRATEGOS W1.8 (plan `~/.claude/plans/can-you-respond-to-piped-book.md`,
 * B.2 step W1.8; `EvalFix.promoteExhaustive`). `gen/promote.ts planPromotions`
 * only offers a promotion `bestMission` claims for one of FORTIFY/SURVIVE/
 * INCOME/REACH/ANCHOR — an ordinary tier-1 body sitting away from combat,
 * not on a threatened anchor, not gaining speed, gets no mission at all and
 * is silently skipped. Under `promoteExhaustive` it is offered anyway, at
 * `Mission.ANY`/benefit 0, and `gen/generate.ts buildCombos` pins one bare
 * promotion-only combo per candidate so the widened list survives buildCombos'
 * OWN 24-combo score prune (plan B.1b: emitting a promotion is not enough to
 * reach the root, which also cuts to `K` candidates — this file measures and
 * REPORTS that second cut's recall; it does not try to beat it).
 *
 * Four layers, one per `GenTrace` field, checked with ONE trace-armed
 * `TurnGenerator.generate()` call per candidate slot:
 *   promoRank  `gen/promote.ts planPromotions` offered the slot at all;
 *   comboRank  `gen/generate.ts buildCombos` kept its bare-promotion combo
 *              (FORTIFY candidates excepted: `expand()` runs their bare combo
 *              itself, FORCED, before `buildCombos`, and the W1.8 pin skips
 *              them — so for those the next layer is the evidence);
 *   offered    the bare promotion turn itself reached the candidate list;
 *   finalRank  that turn survived the root's own `K`-candidate cut.
 * This file asserts 100% recall on the first three and only REPORTS the last.
 *
 * Fixtures: three authored (`buildState`) — one where no tier-1 unit
 * qualifies for any mission (isolated from combat, no speed gain, not
 * fortifying); one with MORE promotable units than `GenConfig.maxPromotions`,
 * so the flag's beam widening (`max` -> `MAX_SLOTS`) is exercised, not only
 * its `Mission.ANY` substitution; and one where every unit already qualifies
 * for FORTIFY (a same-side unit occupies the enemy's home corner) — plus one
 * built from a REAL `lab/hard-ai/positions/p4-determinism.jsonl` row's unit
 * layout (`p4-det-007`, STRATEGOS W1.11's Phasing determinism corpus),
 * replayed into a fresh Prepare phase with the bank raised so its promotions
 * are legal (that row itself is an Act-phase root with a bank of 1-2
 * crystals, never enough to promote — the corpus is reused for its board
 * GEOMETRY, not its exact turn state).
 */
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildState, type UnitSpec } from './game-fixture';
import { AKind, newKeepSetTable, paMake, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { Evaluator } from '../../../src/ai/hard/eval/evaluate';
import { withinTurnScore } from '../../../src/ai/hard/eval/turnScore';
import { TurnPool, type Turn } from '../../../src/ai/hard/gen/turn';
import { UNLIMITED_WORK } from '../../../src/ai/hard/gen/actionsearch';
import { TurnGenerator, newGenStats, outCapacityFor, type GenStats } from '../../../src/ai/hard/gen/generate';
import { newGenTrace, resetGenTrace } from '../../../src/ai/hard/gen/trace';
import { DESKTOP, strategosPatch } from '../../../src/ai/hard/config';
import { HardEngine } from '../../../src/ai/hard/engine';
import { DEAD, MAX_SLOTS, Result, type Centi, type PackedState, type Side } from '../../../src/ai/hard/types';
import type { GameState } from '../../../src/game/types';
import { readPositions } from '../../../lab/hard-ai/positions/corpus';
import { Mission, newPromoCandidate, planPromotions } from '../../../src/ai/hard/gen/promote';

vi.setConfig({ testTimeout: 30_000 });

const rep = new Replica();
const sc = new Scratch(8, 8, 4, 4);
const tables: NodeTables = allocTables();
const evaluator = new Evaluator(rep);
const pool = new TurnPool(8192);
const keep: KeepSetTable = newKeepSetTable();
const out = new Array<Turn>(outCapacityFor(DESKTOP.gen));
const stats: GenStats = newGenStats();
const trace = newGenTrace();

let scoreMover: Side = 0;
/** The shipped within-turn score, exactly as `tests/ai/hard/gen-trace.test.ts`
 * builds it, so this file describes the generator that actually plays. */
function score(p: PackedState, s: Scratch, ply: number): Centi {
  return withinTurnScore(evaluator, p, scoreMover, s, ply);
}

function pack(state: GameState): PackedState {
  const p = rep.pack(state, allocState());
  expect(p.result).toBe(Result.ONGOING);
  p.proverMode = 2;
  return p;
}

/** Every slot `Replica.canPromote` (via `isLegal`) accepts for `p`'s mover. */
function legalPromoteSlots(p: PackedState): number[] {
  const slots: number[] = [];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== p.side) continue;
    if (rep.isLegal(p, paMake(AKind.PROMOTE, slot, 0, 0))) slots.push(slot);
  }
  return slots;
}

/** The packed end key `[hi, lo]` of PROMOTE(slot) followed by END_PLACE, from
 * `p`'s own current position — the exact end state `buildCombos`' bare
 * promotion-only combo for this slot reaches. Restores `p` before returning. */
function bareEndKey(p: PackedState, slot: number): [number, number] {
  const undo = newUndo();
  const top = undo.top;
  const promote = paMake(AKind.PROMOTE, slot, 0, 0);
  expect(rep.isLegal(p, promote)).toBe(true);
  rep.make(p, promote, undo);
  let endApplied = false;
  if (p.result === Result.ONGOING && p.phase === 0) {
    const end = paMake(AKind.END_PLACE, 0, 0, 0);
    if (rep.isLegal(p, end)) {
      rep.make(p, end, undo);
      endApplied = true;
    }
  }
  const key: [number, number] = [p.kposHi, p.kposLo];
  if (endApplied) rep.unmake(p, undo);
  rep.unmake(p, undo);
  undo.top = top;
  return key;
}

interface SlotRecall {
  slot: number;
  promoRank: number;
  comboRank: number;
  offered: number;
  finalRank: number;
}

/** One `generate()` call per slot, trace-armed on that slot's bare promotion
 * turn. `tables` is rebuilt (not cached) since consecutive calls run the SAME
 * generator against the SAME `p`, and `buildTables` is keyed on `Kturn`. */
function traceSlots(gen: TurnGenerator, p: PackedState, slots: readonly number[]): SlotRecall[] {
  const rows: SlotRecall[] = [];
  for (const slot of slots) {
    const [hi, lo] = bareEndKey(p, slot);
    const line = new Int32Array([paMake(AKind.PROMOTE, slot, 0, 0)]);
    resetGenTrace(trace, hi, lo, line, 1);
    gen.setTrace(trace);
    buildTables(p, sc, 0, 2, tables);
    pool.reset();
    scoreMover = p.side as Side;
    gen.generate(p, tables, score, UNLIMITED_WORK, 0, keep, out, stats);
    gen.setTrace(null);
    rows.push({ slot, promoRank: trace.promoRank, comboRank: trace.comboRank, offered: trace.offered, finalRank: trace.finalRank });
  }
  return rows;
}

/** Full untraced `generate()` output, reduced the way `gen-trace.test.ts` does,
 * for the byte-identity check ("flag absent -> identical combos"). */
function runFull(gen: TurnGenerator, p: PackedState): { count: number; placePlans: number; rows: string[] } {
  buildTables(p, sc, 0, 2, tables);
  pool.reset();
  scoreMover = p.side as Side;
  const n = gen.generate(p, tables, score, UNLIMITED_WORK, 0, keep, out, stats);
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = out[i];
    const actions = Array.from(t.actions.subarray(0, t.count)).join(',');
    rows.push(`${t.endHi}|${t.endLo}|${t.gainCc}|${t.flags}|${t.place}|${t.sig}|${t.count}|${actions}`);
  }
  // `placePlans` counts every combo the generator RAN, so a duplicate run the
  // candidate list dedupes away still shows up here.
  return { count: n, placePlans: stats.placePlans, rows };
}

/** `planPromotions`' mission per slot under the flag, for the same root the
 * generator sees (a Prepare root's `expand()` builds its tables from `p`). */
function missionsOf(p: PackedState): Map<number, number> {
  buildTables(p, sc, 0, 2, tables);
  const buf = Array.from({ length: MAX_SLOTS }, () => newPromoCandidate());
  const n = planPromotions(p, tables, DESKTOP.gen.maxPromotions, buf, true);
  return new Map(buf.slice(0, n).map(c => [c.slot, c.mission]));
}

// --- fixtures ----------------------------------------------------------------

/** CHOICE (enough for every tier-1 -> tier-2 `promoCost` in `units.ts`, so
 * `canPromote` is decided by the unit, never the bank; falsifier: a fixture
 * whose `legalPromoteSlots` comes back shorter than its white tier-1 unit
 * count). */
const BANK = 30;

/** Fixture A: three tier-1 units, isolated from combat and from either home
 * corner, none of them plants (no INCOME) and none gaining speed at tier 2
 * (`fire_1`/`water_1`/`shadow_1`: 2->2, 1->1, 2->2 — `units.ts`), so
 * `bestMission` claims NONE of them today (Mission -1, silently skipped). */
const isolatedNoMission: UnitSpec[] = [
  { def: 'fire_1', owner: 'white', x: 1, y: 1 },
  { def: 'water_1', owner: 'white', x: 2, y: 2 },
  { def: 'shadow_1', owner: 'white', x: 3, y: 1 },
  { def: 'fire_1', owner: 'black', x: 9, y: 9 },
];

/** Fixture W: ELEVEN no-mission tier-1 bodies (fixture A's elements, packed
 * into white's quarter, far from the lone black unit), more than
 * `DESKTOP.gen.maxPromotions` (8). Flag off, none is a candidate; flag on,
 * every one must be — which needs BOTH halves of the flag: `Mission.ANY`
 * and the beam widened past `max`. */
const wideNoMission: UnitSpec[] = [
  { def: 'fire_1', owner: 'white', x: 1, y: 0 },
  { def: 'water_1', owner: 'white', x: 2, y: 0 },
  { def: 'shadow_1', owner: 'white', x: 3, y: 0 },
  { def: 'fire_1', owner: 'white', x: 0, y: 1 },
  { def: 'water_1', owner: 'white', x: 1, y: 1 },
  { def: 'shadow_1', owner: 'white', x: 2, y: 1 },
  { def: 'fire_1', owner: 'white', x: 3, y: 1 },
  { def: 'water_1', owner: 'white', x: 0, y: 2 },
  { def: 'shadow_1', owner: 'white', x: 1, y: 2 },
  { def: 'fire_1', owner: 'white', x: 2, y: 2 },
  { def: 'water_1', owner: 'white', x: 0, y: 3 },
  { def: 'fire_1', owner: 'black', x: 9, y: 9 },
];

/** Fixture B: a white unit occupies black's home corner (99 = (9,9)), so
 * `bestMission`'s FORTIFY branch — checked first, before SURVIVE/INCOME/
 * REACH/ANCHOR — already claims EVERY white promotable slot. Recall should
 * already be 100% with the flag OFF; this is the regression fixture proving
 * `promoteExhaustive` changes nothing when nothing needs widening. */
const fortifyDominant: UnitSpec[] = [
  { def: 'fire_1', owner: 'white', x: 9, y: 9 },
  { def: 'water_1', owner: 'white', x: 1, y: 1 },
  { def: 'shadow_1', owner: 'white', x: 2, y: 2 },
  { def: 'fire_1', owner: 'black', x: 8, y: 6 },
];

/** Fixture C: `p4-det-007`'s own unit layout (`lab/hard-ai/positions/
 * p4-determinism.jsonl`, row index 7 — a real Phasing opening from STRATEGOS
 * W1.11's determinism corpus), replayed as a Prepare root with the bank raised to
 * `BANK` (that row's own bank, 1-2 crystals at an Act-phase root, is never
 * enough to promote anything — every other fact, including the board and
 * every unit's square, owner and element, is the corpus row's own). White's
 * two `lightning_1`s gain speed at tier 2 (3->4, REACH); its `fire_1`/
 * `water_1` gain none (no mission, same as fixture A); `plant_1`'s INCOME
 * depends on its cell's reserve, checked, not assumed, below. */
function loadCorpusFixture(): UnitSpec[] {
  const file = path.resolve(import.meta.dirname, '../../../lab/hard-ai/positions/p4-determinism.jsonl');
  const rows = readPositions(file);
  const row = rows.find(r => r.id === 'p4-det-007');
  if (row === undefined) throw new Error('p4-det-007 missing from p4-determinism.jsonl');
  return row.state.board.units.map(u => ({
    def: u.definitionId,
    owner: u.owner,
    x: u.position.x,
    y: u.position.y,
  }));
}

interface Fixture {
  id: string;
  units: UnitSpec[];
}

const fixtures: Fixture[] = [
  { id: 'isolated-no-mission', units: isolatedNoMission },
  { id: 'wide-no-mission', units: wideNoMission },
  { id: 'fortify-dominant', units: fortifyDominant },
  { id: 'corpus-p4-det-007', units: loadCorpusFixture() },
];

function stateFor(f: Fixture): GameState {
  return buildState({
    units: f.units,
    current: 'white',
    phase: 'place',
    upkeepPending: false,
    white: BANK,
    black: BANK,
  });
}

describe('gen/promote.ts + gen/generate.ts: STRATEGOS W1.8 promoteExhaustive recall', () => {
  it('has four fixtures, each with several promotable units', () => {
    for (const f of fixtures) {
      const p = pack(stateFor(f));
      expect(legalPromoteSlots(p).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('fixture A is genuinely the no-mission case the flag exists for', () => {
    // Direct-call sanity gate on `planPromotions` itself, independent of the
    // full generate()/trace machinery below: with the flag off, at least one
    // legal slot gets NO candidate at all.
    const p = pack(stateFor(fixtures[0]));
    const legal = legalPromoteSlots(p);
    buildTables(p, sc, 0, 2, tables);
    const outPromos = Array.from({ length: MAX_SLOTS }, () => newPromoCandidate());
    const n = planPromotions(p, tables, DESKTOP.gen.maxPromotions, outPromos, false);
    const seen = new Set(outPromos.slice(0, n).map(c => c.slot));
    expect(legal.some(slot => !seen.has(slot))).toBe(true);
  });

  it('fixture W has more promotable units than the ordinary beam holds', () => {
    const p = pack(stateFor(fixtures[1]));
    expect(legalPromoteSlots(p).length).toBeGreaterThan(DESKTOP.gen.maxPromotions);
  });

  const report: { fixture: string; flag: boolean; total: number; promo: number; combo: number; offered: number; final: number }[] = [];
  const tally = (f: Fixture, flag: boolean, rows: SlotRecall[]): void => {
    report.push({
      fixture: f.id,
      flag,
      total: rows.length,
      promo: rows.filter(r => r.promoRank >= 0).length,
      combo: rows.filter(r => r.comboRank >= 0).length,
      offered: rows.filter(r => r.offered === 1).length,
      final: rows.filter(r => r.finalRank >= 0).length,
    });
  };

  for (const f of fixtures) {
    it(`${f.id}: flag ON — every canPromote slot is a candidate, keeps a combo, and its bare turn is generated`, () => {
      const gen = new TurnGenerator(rep, DESKTOP.gen, pool, sc);
      gen.setPromoteExhaustive(true);
      const p = pack(stateFor(f));
      const legal = legalPromoteSlots(p);
      expect(legal.length).toBeGreaterThanOrEqual(2);
      const missions = missionsOf(p);

      const rows = traceSlots(gen, p, legal);
      for (const r of rows) {
        expect(r.promoRank, `slot ${r.slot} promoRank`).toBeGreaterThanOrEqual(0);
        // FORTIFY's bare combo is run by `expand()` itself, not `buildCombos`.
        if (missions.get(r.slot) !== Mission.FORTIFY) {
          expect(r.comboRank, `slot ${r.slot} comboRank`).toBeGreaterThanOrEqual(0);
        }
        expect(r.offered, `slot ${r.slot} offered`).toBe(1);
      }
      tally(f, true, rows);
      tally(f, false, traceSlots(new TurnGenerator(rep, DESKTOP.gen, pool, sc), p, legal));
    });

    it(`${f.id}: flag OFF — identical to a generator that never heard of the flag, and to itself after toggling on and back off`, () => {
      const untouched = new TurnGenerator(rep, DESKTOP.gen, pool, sc);
      const explicitOff = new TurnGenerator(rep, DESKTOP.gen, pool, sc);
      explicitOff.setPromoteExhaustive(false);
      const toggled = new TurnGenerator(rep, DESKTOP.gen, pool, sc);

      const p = pack(stateFor(f));
      const baseline = runFull(untouched, p);
      expect(runFull(explicitOff, p)).toEqual(baseline);

      // `toggled`: off (default) -> on -> off, on the SAME instance and the
      // SAME position, so a leftover mutable field (rather than a fresh
      // per-call read) would show up as a diff against `baseline` here.
      expect(runFull(toggled, p)).toEqual(baseline);
      toggled.setPromoteExhaustive(true);
      runFull(toggled, p);
      toggled.setPromoteExhaustive(false);
      expect(runFull(toggled, p)).toEqual(baseline);
    });
  }

  it('flag ON changes nothing where every candidate is already FORTIFY (fixture B)', () => {
    // FORTIFY's bare combos are emitted by `expand()` itself, so the W1.8 pin
    // has nothing to add here: same turns AND same combo count run — a pin
    // that re-ran them would be deduped out of the list but not out of
    // `placePlans` (or the meter).
    const f = fixtures.find(x => x.id === 'fortify-dominant') as Fixture;
    const p = pack(stateFor(f));
    expect([...missionsOf(p).values()].every(m => m === Mission.FORTIFY)).toBe(true);
    const off = runFull(new TurnGenerator(rep, DESKTOP.gen, pool, sc), p);
    const on = new TurnGenerator(rep, DESKTOP.gen, pool, sc);
    on.setPromoteExhaustive(true);
    expect(runFull(on, p)).toEqual(off);
  });

  it('reports recall per layer, flag ON and OFF, including after the root K cut (informational, not asserted)', () => {
    console.table(report);
    expect(report.length).toBe(fixtures.length * 2);
  });

  it('engine.ts wiring: hard@strategos arms the ROOT generator only, hard@desktop none', () => {
    // Behavioural, not a private-field read: on fixture A (no slot has a
    // mission) a generator sees a legal promotion as a candidate iff its flag
    // is on. Proves `config.evalFix.promoteExhaustive` reaches `gen` alone
    // through `strategosPatch()` and `HardEngine` — coordinator decision
    // (2026-09-24): `genInterior`/`genQuiesce` stay unarmed under
    // `hard@strategos` too (W1.8's proof obligation is ROOT recall; see
    // `engine.ts`'s wiring comment for the lane-review numbers that reversed
    // the original "wire all three" plan).
    const p = pack(stateFor(fixtures[0]));
    const legal = legalPromoteSlots(p);
    const strategos = new HardEngine(strategosPatch());
    const desktop = new HardEngine();
    for (const which of ['gen', 'genInterior', 'genQuiesce'] as const) {
      const on = traceSlots(strategos.ctx[which], p, legal);
      const off = traceSlots(desktop.ctx[which], p, legal);
      if (which === 'gen') {
        expect(on.every(r => r.promoRank >= 0), `strategos ${which}`).toBe(true);
      } else {
        expect(on.every(r => r.promoRank < 0), `strategos ${which}`).toBe(true);
      }
      expect(off.every(r => r.promoRank < 0), `desktop ${which}`).toBe(true);
    }
  });

  it('flag OFF is missing at least one legal slot that flag ON recovers, on some fixture', () => {
    let foundGap = false;
    for (const f of fixtures) {
      const genOff = new TurnGenerator(rep, DESKTOP.gen, pool, sc);
      const p = pack(stateFor(f));
      const legal = legalPromoteSlots(p);
      const rowsOff = traceSlots(genOff, p, legal);
      if (rowsOff.some(r => r.promoRank < 0)) foundGap = true;
    }
    expect(foundGap).toBe(true);
  });
});
