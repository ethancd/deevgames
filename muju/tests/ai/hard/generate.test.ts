// @vitest-environment node
/**
 * `src/ai/hard/gen/generate.ts` (DESIGN §5.6, §5.10, F7, F13, F25).
 *
 * The facade's contract is mostly about what CANNOT happen: the list is never
 * empty, never holds a turn the canonical engine would refuse, never holds the
 * same end position twice, and never drops a forced injection to make room for
 * a beam candidate. Every candidate emitted here is therefore replayed through
 * `Replica.isLegal`/`make` and its `Kpos` compared with what the turn claims —
 * the same check `verify/replay.ts` (M14) makes against `applyAction`.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../../../src/game/board';
import { buildState, type UnitSpec } from './game-fixture';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { AKind, newKeepSetTable, paA, paB, paKind, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { CORNER } from '../../../src/ai/hard/core/tables';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { Evaluator, terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { TurnFlag, TurnPool, keepForTurn, type Turn } from '../../../src/ai/hard/gen/turn';
import { UNLIMITED_WORK } from '../../../src/ai/hard/gen/actionsearch';
import {
  HOME_RACE_EMIT,
  TurnGenerator,
  newGenStats,
  outCapacityFor,
  referenceCapacity,
  type GenStats,
} from '../../../src/ai/hard/gen/generate';
import { DESKTOP } from '../../../src/ai/hard/config';
import type { GenConfig } from '../../../src/ai/hard/config';
import { Result, type Centi, type PackedState, type Side } from '../../../src/ai/hard/types';
import type { GameState } from '../../../src/game/types';

// E0.5 timeout budget: slowest test 7.7 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 30 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 30_000 });

const rep = new Replica();
const sc = new Scratch(4, 8, 4, 4);
const tables: NodeTables = allocTables();
const evaluator = new Evaluator(rep);
const pool = new TurnPool(8192);
const keep: KeepSetTable = newKeepSetTable();

let scoreMover: Side = 0;
/** DESIGN §5.4's within-turn score, with terminals handled (`p.side` has not
 * flipped on a mid-turn terminal, so the mover cannot be read off the state). */
function score(p: PackedState, s: Scratch, ply: number): Centi {
  const terminal = terminalScore(p, scoreMover, ply);
  if (terminal !== null) return terminal;
  return evaluator.stage0(p, scoreMover) + evaluator.stage1(p, scoreMover, s, ply);
}

function cfgWithK(k: number): GenConfig {
  return { ...DESKTOP.gen, K: k };
}

interface Generated {
  p: PackedState;
  turns: Turn[];
  stats: GenStats;
}

function generate(state: GameState, k = DESKTOP.gen.K): Generated {
  const cfg = cfgWithK(k);
  const p = rep.pack(state, allocState());
  p.proverMode = 2;
  buildTables(p, sc, 0, 2, tables);
  scoreMover = p.side as Side;
  pool.reset();
  const gen = new TurnGenerator(rep, cfg, pool, sc);
  const out: Turn[] = new Array<Turn>(outCapacityFor(cfg));
  const stats = newGenStats();
  const n = gen.generate(p, tables, score, UNLIMITED_WORK, 0, keep, out, stats);
  return { p, turns: out.slice(0, n), stats };
}

/** Replays a turn through the replica and returns its real end `Kpos`. */
function replay(p: PackedState, turn: Turn): { lo: number; hi: number; legal: boolean; ended: boolean } {
  const undo = newUndo();
  const side = p.side;
  const turnNumber = p.turnNumber;
  let applied = 0;
  let legal = true;
  const choice = keepForTurn(turn, keep);
  for (let i = 0; i < turn.count; i++) {
    if (!rep.isLegal(p, turn.actions[i], choice)) {
      legal = false;
      break;
    }
    rep.make(p, turn.actions[i], undo, choice);
    applied++;
  }
  const ended = p.result !== Result.ONGOING || p.side !== side || p.turnNumber !== turnNumber;
  const lo = p.kposLo;
  const hi = p.kposHi;
  for (let i = 0; i < applied; i++) rep.unmake(p, undo);
  return { lo, hi, legal, ended };
}

function quiet(extra: UnitSpec[] = [], overrides: Record<string, unknown> = {}): GameState {
  return buildState({
    units: [
      { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'w-anchor' },
      { def: 'plant_1', owner: 'white', x: 3, y: 4, id: 'w-muju' },
      { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
      { def: 'fire_1', owner: 'black', x: 8, y: 9, id: 'b-second' },
      ...extra,
    ],
    white: 8,
    black: 6,
    current: 'white',
    phase: 'place',
    turnNumber: 5,
    ...overrides,
  });
}

describe('gen/generate.ts TurnGenerator.generate (DESIGN §5.6)', () => {
  it('every candidate replays legally and reaches the end position it claims', () => {
    for (const state of [createInitialGameState(undefined, 4, 0, 'phasing'), quiet(), quiet([], { white: 40 })]) {
      const { p, turns } = generate(state);
      expect(turns.length).toBeGreaterThan(0);
      for (const turn of turns) {
        const end = replay(p, turn);
        expect(end.legal).toBe(true);
        expect(end.ended).toBe(true);
        expect([end.lo, end.hi]).toEqual([turn.endLo, turn.endHi]);
      }
    }
  });

  it('never returns an empty list on a position the mover can act in (DESIGN F7)', () => {
    // No crystals, one body, nothing to buy or promote: the mine-only turn is
    // still there.
    const { turns } = generate(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'w-lonely' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 0,
        black: 0,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
      }),
    );
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.some(t => (t.flags & TurnFlag.QUIET) !== 0)).toBe(true);
  });

  it('deduplicates end positions', () => {
    const { turns } = generate(quiet([], { white: 40 }));
    const keys = new Set(turns.map(t => `${t.endLo}:${t.endHi}`));
    expect(keys.size).toBe(turns.length);
  });

  it('lists every forced injection before the beam, and never counts it against K', () => {
    const { turns } = generate(quiet([], { white: 40 }), 4);
    const forced = turns.filter(t => (t.flags & TurnFlag.FORCED) !== 0);
    expect(forced.length).toBeGreaterThan(0);
    // Forced candidates occupy a prefix of the list ...
    for (let i = 0; i < forced.length; i++) expect((turns[i].flags & TurnFlag.FORCED) !== 0).toBe(true);
    // ... and the beam's own share is capped by K, not shared with them.
    expect(turns.length - forced.length).toBeLessThanOrEqual(4);
    expect(turns.length).toBeGreaterThan(4);
  });

  it('orders the beam half by descending within-turn score', () => {
    const { turns } = generate(quiet([], { white: 40 }));
    const beam = turns.filter(t => (t.flags & TurnFlag.FORCED) === 0);
    for (let i = 1; i < beam.length; i++) expect(beam[i - 1].gainCc).toBeGreaterThanOrEqual(beam[i].gainCc);
  });

  /** The fixture the home-race tests share: a White anchor on H9 opens a wide
   * commitment rectangle, so `homeRaceAvailable` qualifies its whole capacity
   * (24 lines) — the shape that used to flood the candidate list. */
  function raceFixture(white = 12): GameState {
    return buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 7, y: 8, id: 'w-anchor' },
        { def: 'plant_1', owner: 'black', x: 0, y: 9, id: 'b-far' },
      ],
      white,
      black: 6,
      current: 'white',
      phase: 'place',
      turnNumber: 5,
    });
  }

  it('emits a delayed home-race commitment as an ordinary purchase, never FORCED', () => {
    const { turns } = generate(raceFixture());
    const race = turns.filter(t => (t.flags & TurnFlag.HOME_RACE) !== 0);
    expect(race.length).toBeGreaterThan(0);
    // Under Phasing the BUY only creates a PENDING commitment: the body arrives
    // at White's next turn start and only then needs four move-actions. It
    // cannot decide anything this turn, so it competes in the beam like any
    // other purchase instead of being injected ahead of it.
    expect(race.every(t => (t.flags & TurnFlag.FORCED) === 0)).toBe(true);
    expect(race.every(t => (t.flags & TurnFlag.PURCHASE) !== 0)).toBe(true);
    // ... and it is a commitment, not an entry: no corner MOVE rides along.
    expect(
      race.some(t => {
        let buy = false;
        let enter = false;
        for (let i = 0; i < t.count; i++) {
          const a = t.actions[i];
          if (paKind(a) === AKind.BUY) buy = true;
          if (paKind(a) === AKind.MOVE && paB(a) === CORNER[1]) enter = true;
        }
        return buy && !enter;
      }),
    ).toBe(true);
  });

  it('emits at most HOME_RACE_EMIT race commitments, the best squares first', () => {
    // Purchase planning off (only the empty plan), so every HOME_RACE candidate
    // in the list came from `expand`'s own race loop and the cap is visible.
    const base = cfgWithK(DESKTOP.gen.K);
    const cfg: GenConfig = {
      ...base,
      maxPlacePlans: 1,
      purchase: { ...base.purchase, maxPlans: 1 },
    };
    const state = raceFixture();
    const p = rep.pack(state, allocState());
    p.proverMode = 2;
    buildTables(p, sc, 0, 2, tables);
    scoreMover = p.side as Side;
    pool.reset();
    const gen = new TurnGenerator(rep, cfg, pool, sc);
    const out: Turn[] = new Array<Turn>(outCapacityFor(cfg));
    const n = gen.generate(p, tables, score, UNLIMITED_WORK, 0, keep, out, newGenStats());
    const race = out.slice(0, n).filter(t => (t.flags & TurnFlag.HOME_RACE) !== 0);
    // `homeRaceAvailable` qualifies its full 24-line capacity here; the
    // generator keeps only the two best squares.
    expect(race.length).toBeGreaterThan(0);
    expect(race.length).toBeLessThanOrEqual(HOME_RACE_EMIT);
    // Best = shortest route into the enemy corner, then cheaper body, then
    // lower square. H8 (77) and G9 (86) are the only two-move landings.
    const squares = race.map(t => {
      for (let i = 0; i < t.count; i++) if (paKind(t.actions[i]) === AKind.BUY) return paB(t.actions[i]);
      return -1;
    }).sort((a, b) => a - b);
    expect(squares).toEqual([77, 86]);
  });

  /** Counts the Prepare actions a candidate carries. */
  function prepareActions(t: Turn): { buys: number; promos: number } {
    let buys = 0;
    let promos = 0;
    for (let i = 0; i < t.count; i++) {
      const kind = paKind(t.actions[i]);
      if (kind === AKind.BUY) buys++;
      if (kind === AKind.PROMOTE) promos++;
    }
    return { buys, promos };
  }

  it('completes the disrupting turn through the ordinary Prepare path', () => {
    // Black's anchor on F6 supports a commitment on H8. White's Radi stands
    // OUTSIDE that rectangle (so the commitment is currently valid) and can
    // step into it, voiding the commitment and refunding Black.
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 2, y: 2, id: 'w-anchor' },
        { def: 'lightning_1', owner: 'white', x: 5, y: 4, id: 'w-runner' },
        { def: 'plant_1', owner: 'black', x: 5, y: 5, id: 'b-anchor' },
      ],
      pendingSummons: [{ def: 'fire_1', owner: 'black', x: 7, y: 7, id: 'b-pend' }],
      white: 12,
      black: 4,
      current: 'white',
      phase: 'action',
      turnNumber: 8,
    });
    // A generous K so the assertion is about what the generator OFFERS, not
    // about which offers survive this position's beam cutoff.
    const { p, turns } = generate(state, 200);
    const disrupt = turns.filter(t => (t.flags & TurnFlag.DISRUPT) !== 0);
    expect(disrupt.length).toBeGreaterThan(0);
    // The bare completion is still injected, so the idea keeps its guaranteed
    // place in the list ...
    expect(disrupt.some(t => (t.flags & TurnFlag.FORCED) !== 0)).toBe(true);
    // ... and the same Act prefix now also reaches real Prepare plans. Before
    // this, a disrupting turn was `MOVE, END_ACTION, END_PLACE` and bought
    // nothing: it spent an action to refund the enemy and did not use the
    // tempo. Those plans are ORDINARY candidates — a forced Prepare plan is
    // exempt from futility pruning and LMR at every node.
    const withPrepare = disrupt.filter(t => {
      const { buys, promos } = prepareActions(t);
      return buys + promos > 0;
    });
    expect(withPrepare.length).toBeGreaterThan(0);
    expect(withPrepare.some(t => (t.flags & TurnFlag.FORCED) === 0)).toBe(true);
    expect(withPrepare.some(t => prepareActions(t).buys > 0)).toBe(true);
    // Every one of them is still a turn the canonical replica accepts.
    for (const t of disrupt) {
      const end = replay(p, t);
      expect(end.legal).toBe(true);
      expect(end.ended).toBe(true);
      expect([end.lo, end.hi]).toEqual([t.endLo, t.endHi]);
    }
  });

  /** White holds Black's corner on J10 with a blocker on I10; Black's Mizu on
   * J7 can still walk to J9 and answer, so the occupation is not yet mate and
   * the Prepare phase is reached with the corner held. */
  function fortifyFixture(units: UnitSpec[]): GameState {
    return buildState({
      units,
      white: 30,
      black: 4,
      current: 'white',
      phase: 'place',
      actions: 0,
      turnNumber: 9,
    });
  }

  const FORTIFY_HOLD: UnitSpec[] = [
    { def: 'fire_1', owner: 'white', x: 9, y: 9, id: 'w-occupier' },
    { def: 'fire_1', owner: 'white', x: 8, y: 9, id: 'w-blocker' },
    { def: 'water_1', owner: 'black', x: 9, y: 6, id: 'b-rescuer' },
    { def: 'plant_1', owner: 'black', x: 2, y: 2, id: 'b-far' },
  ];

  it('fortifies with TWO promotions when an own unit holds the enemy corner', () => {
    const { p, turns } = generate(fortifyFixture(FORTIFY_HOLD), 200);
    const pairs = turns.filter(t => prepareActions(t).promos >= 2);
    // A fortification mate can need BOTH the corner occupier and a rescue-path
    // blocker promoted. One promotion index per place combo could not express
    // that, so the mate was ungenerable however deep the search went.
    expect(pairs.length).toBeGreaterThan(0);
    for (const t of pairs) {
      expect(t.flags & TurnFlag.HOME_FORTIFY).not.toBe(0);
      expect(t.flags & TurnFlag.PROMOTION).not.toBe(0);
      // A fortification is forced, exactly as the single-promotion one is.
      expect(t.flags & TurnFlag.FORCED).not.toBe(0);
      const end = replay(p, t);
      expect(end.legal).toBe(true);
      expect(end.ended).toBe(true);
      expect([end.lo, end.hi]).toEqual([t.endLo, t.endHi]);
    }
    // The pair promotes the occupier together with the blocker, and never the
    // same body twice.
    const occupierAndBlocker = pairs.some(t => {
      const slots = new Set<number>();
      for (let i = 0; i < t.count; i++) if (paKind(t.actions[i]) === AKind.PROMOTE) slots.add(paA(t.actions[i]));
      return slots.size === 2 && slots.has(p.pieceAt[CORNER[1]]);
    });
    expect(occupierAndBlocker).toBe(true);
  });

  it('pairs no promotions when no own unit holds the enemy corner', () => {
    // The same army one square off the corner: nothing to fortify, so Prepare
    // stays at one promotion per plan and the pairing never runs.
    const off: UnitSpec[] = FORTIFY_HOLD.map(u =>
      u.id === 'w-occupier' ? { ...u, x: 9, y: 8 } : u,
    );
    const { turns } = generate(fortifyFixture(off), 200);
    expect(turns.length).toBeGreaterThan(0);
    for (const t of turns) expect(prepareActions(t).promos).toBeLessThanOrEqual(1);
  });

  it('injects the home-corner entry an existing body can make', () => {
    const { turns } = generate(
      buildState({
        units: [
          { def: 'lightning_1', owner: 'white', x: 9, y: 6, id: 'w-radi' },
          { def: 'plant_1', owner: 'black', x: 0, y: 9, id: 'b-far' },
        ],
        white: 0,
        black: 6,
        current: 'white',
        phase: 'action',
        turnNumber: 5,
      }),
    );
    expect(turns.some(t => (t.flags & TurnFlag.HOME_ENTRY) !== 0 && (t.flags & TurnFlag.FORCED) !== 0)).toBe(true);
  });

  it('keeps Prepare purchases pending and never attacks with a fresh body', () => {
    const state = quiet([], { white: 8 });
    const { p, turns } = generate(state);
    const buying = turns.filter(t => t.actions.subarray(0, t.count).some(a => paKind(a) === AKind.BUY));
    expect(buying.length).toBeGreaterThan(0);
    for (const turn of buying) {
      expect(turn.actions.subarray(0, turn.count).some(a => paKind(a) === AKind.MOVE || paKind(a) === AKind.ATTACK)).toBe(false);
      expect(replay(p, turn).legal).toBe(true);
      expect(paKind(turn.actions[turn.count - 1])).toBe(AKind.END_PLACE);
    }
  });

  it('injects the kill a killNow entry names', () => {
    const { turns } = generate(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'w-hi' },
          { def: 'lightning_1', owner: 'black', x: 4, y: 5, id: 'b-radi' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 0,
        black: 6,
        current: 'white',
        phase: 'action',
        turnNumber: 5,
      }),
    );
    expect(turns.some(t => (t.flags & TurnFlag.KILL) !== 0 && (t.flags & TurnFlag.FORCED) !== 0)).toBe(true);
  });

  it('pays upkeep first and searches the keep-set as a root branch (DESIGN §5.10)', () => {
    const units: UnitSpec[] = [
      { def: 'fire_1', owner: 'white', x: 0, y: 0, id: 'w-t1' },
      { def: 'fire_2', owner: 'white', x: 1, y: 0, id: 'w-hono' },
      { def: 'water_2', owner: 'white', x: 2, y: 0, id: 'w-straumr' },
      { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
    ];
    const { p, turns } = generate(
      buildState({
        units,
        white: 2,
        black: 6,
        current: 'white',
        phase: 'place',
        upkeepPending: true,
        turnNumber: 9,
      }),
    );
    expect(turns.length).toBeGreaterThan(0);
    const choices = new Set<string>();
    for (const turn of turns) {
      expect(turn.count).toBeGreaterThan(0);
      expect(paKind(turn.actions[0])).toBe(AKind.PAY_UPKEEP);
      expect(paA(turn.actions[0])).toBe(0);
      expect(turn.keepMask?.length).toBe(4);
      choices.add([...turn.keepMask!].join(","));
      const end = replay(p, turn);
      expect(end.legal).toBe(true);
      expect([end.lo, end.hi]).toEqual([turn.endLo, turn.endHi]);
    }
    // More than one keep set was actually searched at the root.
    expect(choices.size).toBeGreaterThan(1);
  });

  it('places purchases after the retained Act and ends at the first handoff', () => {
    const { turns } = generate(quiet([], { white: 40, phase: 'action', actions: 1 }));
    const withBuy = turns.filter(t => {
      for (let i = 0; i < t.count; i++) if (paKind(t.actions[i]) === AKind.BUY) return true;
      return false;
    });
    expect(withBuy.length).toBeGreaterThan(0);
    for (const turn of withBuy) {
      // Act ends first; BUY/PROMOTE belong to the mover's ensuing Prepare.
      expect([...turn.actions.subarray(0, turn.count)].findIndex(a => paKind(a) === AKind.END_ACTION)).toBeLessThan(
        [...turn.actions.subarray(0, turn.count)].findIndex(a => paKind(a) === AKind.BUY));
      let seenEndPlace = false;
      for (let i = 0; i < turn.count; i++) {
        const kind = paKind(turn.actions[i]);
        if (kind === AKind.END_PLACE) seenEndPlace = true;
        else if (kind === AKind.BUY || kind === AKind.PROMOTE) expect(seenEndPlace).toBe(false);
      }
    }
  });

  it('records statistics that add up', () => {
    const { turns, stats } = generate(quiet([], { white: 40, phase: 'action', actions: 1 }));
    expect(stats.placePlans).toBeGreaterThan(0);
    expect(stats.rawLines).toBeGreaterThan(0);
    expect(stats.dedupedTo).toBe(turns.length);
    expect(stats.forcedOverflow).toBe(0);
    expect(stats.injected).toBeGreaterThan(0);
    expect(stats.nodes).toBeGreaterThan(0);
  });
});

describe('gen/generate.ts TurnGenerator.generateReference (DESIGN §5.6, F25)', () => {
  it('returns a broader list whose candidates all replay legally', () => {
    const cfg = cfgWithK(DESKTOP.gen.K);
    const state = quiet([], { white: 12 });
    const p = rep.pack(state, allocState());
    p.proverMode = 2;
    buildTables(p, sc, 0, 2, tables);
    scoreMover = p.side as Side;

    pool.reset();
    const gen = new TurnGenerator(rep, cfg, pool, sc);
    const cheapOut: Turn[] = new Array<Turn>(outCapacityFor(cfg));
    const cheapStats = newGenStats();
    const cheap = gen.generate(p, tables, score, UNLIMITED_WORK, 0, keep, cheapOut, cheapStats);
    const cheapKeys = new Set(cheapOut.slice(0, cheap).map(t => `${t.endLo}:${t.endHi}`));

    pool.reset();
    const refOut: Turn[] = new Array<Turn>(referenceCapacity());
    const refCount = gen.generateReference(p, tables, score, 0, keep, refOut);
    expect(refCount).toBeGreaterThan(cheap);
    const refKeys = new Set(refOut.slice(0, refCount).map(t => `${t.endLo}:${t.endHi}`));
    expect(refKeys.size).toBe(refCount);
    for (const turn of refOut.slice(0, refCount)) {
      const end = replay(p, turn);
      expect(end.legal).toBe(true);
      expect([end.lo, end.hi]).toEqual([turn.endLo, turn.endHi]);
    }
    // The two beams explore different cones (widths [6,4,3,2] against
    // [40,16,8,4], 16 place plans against 200), so the cheap list is NOT a
    // subset of the reference one. What both must hold is every forced
    // injection — they are the same lines, computed from the same tables.
    let shared = 0;
    for (const k of cheapKeys) if (refKeys.has(k)) shared++;
    expect(shared).toBeGreaterThan(0);
    const forcedKeys = cheapOut
      .slice(0, cheap)
      .filter(t => (t.flags & TurnFlag.FORCED) !== 0)
      .map(t => `${t.endLo}:${t.endHi}`);
    expect(forcedKeys.length).toBeGreaterThan(0);
    for (const k of forcedKeys) expect(refKeys.has(k)).toBe(true);
    // The reference walks `REFERENCE_NODE_BUDGET` within-turn nodes and scores
    // every boundary it reaches, so this one case is seconds rather than
    // milliseconds — the only test here that needs more than vitest's default.
  }, 30_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file
});
