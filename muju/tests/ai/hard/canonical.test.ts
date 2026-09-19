// @vitest-environment node
/**
 * Turn canonicalisation and the within-turn action search (DESIGN §5.3, §5.4,
 * §4.13 `gen/actionsearch.ts`).
 *
 * The load-bearing property is negative: C1's footprint prune and C2's turn TT
 * must never drop an END POSITION. Every other test here pins one of the
 * pieces that property is built from — the footprint of a single action, the
 * independence predicate, the canonical key, the TT's hit condition, the
 * widening — so a regression says which piece broke rather than only "the set
 * differs".
 */
import { describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../../../src/game/board';
import type { GameState } from '../../../src/game/types';
import { MAX_SLOTS, NO_SLOT, Result, type PackedState } from '../../../src/ai/hard/types';
import { AKind, paMake, paA, paB, paKind, type PA } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Scratch, bbNew, bbNext } from '../../../src/ai/hard/core/bits';
import {
  ActionSearch,
  TurnTT,
  UNLIMITED_WORK,
  actionKey,
  actionPriority,
  footprint,
  isIndependent,
  neutralTables,
  type ActionSearchTables,
} from '../../../src/ai/hard/gen/actionsearch';
import { TurnFlag, TurnPool, type Turn } from '../../../src/ai/hard/gen/turn';
import { activeCatalog } from '../../../src/ai/hard/core/catalog';
import { buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.7 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });


const UNBOUNDED = new Int32Array([1 << 24, 1 << 24, 1 << 24, 1 << 24]);

function sq(x: number, y: number): number {
  return y * 10 + x;
}

function squaresOf(bb: Uint32Array): number[] {
  const out: number[] = [];
  for (let s = bbNext(bb, -1); s >= 0; s = bbNext(bb, s)) out.push(s);
  return out;
}

function keyOf(lo: number, hi: number): string {
  return `${(hi >>> 0).toString(16)}:${(lo >>> 0).toString(16)}`;
}

interface Prepared {
  rep: Replica;
  p: PackedState;
  prefix: Int32Array;
  prefixLen: number;
}

/** These are Act-prefix tests; full macro completion is covered by the facade. */
function prepare(state: GameState): Prepared {
  const rep = new Replica();
  const p = rep.pack(state, allocState());
  expect(p.phase).toBe(1);
  expect(p.upkeepPending).toBe(0);
  expect(p.result).toBe(Result.ONGOING);
  return { rep, p, prefix: new Int32Array(0), prefixLen: 0 };
}

function searchFor(prepared: Prepared, ttBits: number, keep = 0): ActionSearch {
  return new ActionSearch(
    prepared.rep,
    { widths: UNBOUNDED, keep, ttBits },
    new TurnPool(Math.max(1, keep)),
    new Scratch(1, 1, 1, 1),
  );
}

function naiveEndSet(prepared: Prepared): { keys: Set<string>; sequences: number } {
  const search = searchFor(prepared, 0);
  const keys = new Set<string>();
  const sequences = search.enumerateAll(prepared.p, prepared.prefix, prepared.prefixLen, (lo, hi) => {
    keys.add(keyOf(lo, hi));
  });
  return { keys, sequences };
}

function canonicalEndSet(prepared: Prepared, ttBits: number): { keys: Set<string>; search: ActionSearch } {
  const search = searchFor(prepared, ttBits);
  const keys = new Set<string>();
  const out: Turn[] = [];
  search.setEndObserver((lo, hi) => {
    keys.add(keyOf(lo, hi));
  });
  search.run(prepared.p, neutralTables(), prepared.prefix, prepared.prefixLen, -1, () => 0, UNLIMITED_WORK, 0, out);
  search.setEndObserver(null);
  return { keys, search };
}

/** Every legal action of `p`, END_ACTION dropped. */
function legalActions(prepared: Prepared): PA[] {
  const buf = new Int32Array(4 + MAX_SLOTS * 104);
  const n = prepared.rep.genActions(prepared.p, buf);
  const out: PA[] = [];
  for (let i = 0; i < n; i++) if (paKind(buf[i]) !== AKind.END_ACTION) out.push(buf[i]);
  return out;
}

function findAction(prepared: Prepared, kind: AKind, slot: number, target: number): PA {
  const found = legalActions(prepared).find(a => paKind(a) === kind && paA(a) === slot && paB(a) === target);
  if (found === undefined) throw new Error(`no legal action kind=${kind} slot=${slot} target=${target}`);
  return found;
}

describe('actionKey (DESIGN §5.3 C1)', () => {
  it('ranks every ATTACK before every MOVE and orders by slot then square', () => {
    const attack = actionKey(paMake(AKind.ATTACK, 127, 99, 0));
    const move = actionKey(paMake(AKind.MOVE, 0, 0, 1));
    expect(attack).toBeLessThan(move);
    expect(actionKey(paMake(AKind.MOVE, 3, 10, 1))).toBe((1 << 20) | (3 << 10) | 10);
    expect(actionKey(paMake(AKind.ATTACK, 3, 10, 0))).toBe((3 << 10) | 10);
    // slot dominates square, square breaks ties within a slot.
    expect(actionKey(paMake(AKind.MOVE, 2, 99, 1))).toBeLessThan(actionKey(paMake(AKind.MOVE, 3, 0, 1)));
    expect(actionKey(paMake(AKind.MOVE, 2, 3, 1))).toBeLessThan(actionKey(paMake(AKind.MOVE, 2, 4, 1)));
  });
});

describe('footprint (DESIGN §5.3)', () => {
  const prepared = prepare(
    buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4 }, // E5, slot 0, speed 2
        { def: 'plant_1', owner: 'white', x: 0, y: 9 }, // A10, slot 1, speed 1
        { def: 'lightning_1', owner: 'black', x: 5, y: 4 }, // F5, slot 2
      ],
      actions: 4,
    }),
  );

  it('an ATTACK covers exactly the attacker and target squares', () => {
    const attack = findAction(prepared, AKind.ATTACK, 0, sq(5, 4));
    const bb = footprint(prepared.p, prepared.rep.dist, attack, bbNew());
    expect(squaresOf(bb)).toEqual([sq(4, 4), sq(5, 4)]);
  });

  it('a MOVE covers from, to and every square a path of that cost could use', () => {
    // Muju A10 -> A9 costs one action at speed 1: the ball is its four-neighbourhood.
    const move = findAction(prepared, AKind.MOVE, 1, sq(0, 8));
    const bb = footprint(prepared.p, prepared.rep.dist, move, bbNew());
    expect(squaresOf(bb).sort((a, b) => a - b)).toEqual([sq(0, 8), sq(1, 9), sq(0, 9)].sort((a, b) => a - b));
  });

  it('a MOVE ball grows with the action cost, and never contains an occupied square but its own from/to', () => {
    const far = findAction(prepared, AKind.MOVE, 1, sq(0, 6));
    const bb = squaresOf(footprint(prepared.p, prepared.rep.dist, far, bbNew()));
    expect(bb.length).toBeGreaterThan(4);
    for (const s of bb) {
      if (s === sq(0, 9) || s === sq(0, 6)) continue;
      expect(prepared.p.pieceAt[s]).toBe(NO_SLOT);
    }
  });

  it('is empty for a kind that is neither MOVE nor ATTACK', () => {
    const bb = footprint(prepared.p, prepared.rep.dist, paMake(AKind.END_ACTION, 0, 0, 0), bbNew());
    expect(squaresOf(bb)).toEqual([]);
  });
});

describe('isIndependent (the F1 fix)', () => {
  it('rejects two actions of the same slot and every non-MOVE/ATTACK kind', () => {
    const prepared = prepare(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 4, y: 4 },
          { def: 'lightning_1', owner: 'black', x: 5, y: 4 },
        ],
        actions: 4,
      }),
    );
    const attack = findAction(prepared, AKind.ATTACK, 0, sq(5, 4));
    const move = findAction(prepared, AKind.MOVE, 0, sq(3, 4));
    const foot = footprint(prepared.p, prepared.rep.dist, attack, bbNew());
    expect(isIndependent(prepared.p, prepared.rep.dist, attack, foot, move)).toBe(false);
    expect(isIndependent(prepared.p, prepared.rep.dist, attack, foot, paMake(AKind.END_ACTION, 0, 0, 0))).toBe(false);
    expect(isIndependent(prepared.p, prepared.rep.dist, paMake(AKind.END_ACTION, 0, 0, 0), foot, move)).toBe(false);
  });

  it('JE F1: "step aside, then run" is NOT independent — the corridor square is in both footprints', () => {
    // Hi F6 (slot 0) wants F4; Muju F5 (slot 1) is standing in the way.
    const prepared = prepare(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 5, y: 5 },
          { def: 'plant_1', owner: 'white', x: 5, y: 4 },
          { def: 'water_1', owner: 'black', x: 9, y: 9 },
        ],
        actions: 2,
      }),
    );
    const step = findAction(prepared, AKind.MOVE, 1, sq(4, 4)); // Muju F5 -> E5
    const stepFoot = footprint(prepared.p, prepared.rep.dist, step, bbNew());
    expect(squaresOf(stepFoot)).toContain(sq(5, 4));

    const undo = newUndo();
    prepared.rep.make(prepared.p, step, undo);
    const run = findAction(prepared, AKind.MOVE, 0, sq(5, 3)); // Hi F6 -> F4 through F5
    // The run only exists because F5 was vacated: the pair must not be pruned,
    // even though `key(step) > key(run)` would order them the other way.
    expect(actionKey(step)).toBeGreaterThan(actionKey(run));
    expect(isIndependent(prepared.p, prepared.rep.dist, step, stepFoot, run)).toBe(false);
    prepared.rep.unmake(prepared.p, undo);
  });

  it('accepts a pair on opposite corners of the board', () => {
    const prepared = prepare(
      buildState({
        units: [
          { def: 'plant_1', owner: 'white', x: 0, y: 3 },
          { def: 'plant_1', owner: 'white', x: 9, y: 6 },
          { def: 'water_1', owner: 'black', x: 9, y: 0 },
        ],
        actions: 2,
      }),
    );
    const a = findAction(prepared, AKind.MOVE, 0, sq(1, 3));
    const foot = footprint(prepared.p, prepared.rep.dist, a, bbNew());
    const undo = newUndo();
    prepared.rep.make(prepared.p, a, undo);
    const b = findAction(prepared, AKind.MOVE, 1, sq(8, 6));
    expect(isIndependent(prepared.p, prepared.rep.dist, a, foot, b)).toBe(true);
    prepared.rep.unmake(prepared.p, undo);
  });
});

describe('TurnTT (DESIGN §5.3 C2)', () => {
  it('a hit needs both key lanes, the live generation and at least as many actions', () => {
    const tt = new TurnTT(12);
    tt.store(0x1234, 0x5678, 3);
    expect(tt.probe(0x1234, 0x5678, 3)).toBe(true);
    expect(tt.probe(0x1234, 0x5678, 2)).toBe(true); // stored 3 >= wanted 2
    expect(tt.probe(0x1234, 0x5678, 4)).toBe(false); // stored 3 < wanted 4
    expect(tt.probe(0x1234, 0x9999, 3)).toBe(false); // wrong high lane
    expect(tt.probe(0x1235, 0x5678, 3)).toBe(false); // wrong low lane
  });

  it('bump() invalidates every entry without clearing the table', () => {
    const tt = new TurnTT(12);
    tt.store(7, 9, 4);
    expect(tt.probe(7, 9, 4)).toBe(true);
    tt.bump();
    expect(tt.probe(7, 9, 4)).toBe(false);
    tt.store(7, 9, 4);
    expect(tt.probe(7, 9, 4)).toBe(true);
  });

  it('an empty slot is never a hit and rejects out-of-range sizes', () => {
    const tt = new TurnTT(8);
    expect(tt.probe(0, 0, 0)).toBe(false);
    expect(() => new TurnTT(0)).toThrow(RangeError);
    expect(() => new TurnTT(25)).toThrow(RangeError);
  });
});

describe('set equality of end positions (the M11 gate, in miniature)', () => {
  it('preserves the exhaustive Phasing initial Act-end set, with and without the turn TT', () => {
    // Historical Standard ET pins were 22,725 sequences / 797 ends / 1,053
    // nodes. They remain history, not asserted as new Phasing measurements.
    const prepared = prepare(createInitialGameState(undefined, 4, 0, 'phasing'));
    const naive = naiveEndSet(prepared);
    expect(naive.keys.size).toBeGreaterThan(0);
    expect(naive.sequences).toBeGreaterThan(naive.keys.size);
    const canon = canonicalEndSet(prepared, 0);
    expect([...canon.keys].sort()).toEqual([...naive.keys].sort());
    const withTt = canonicalEndSet(prepared, 20);
    expect([...withTt.keys].sort()).toEqual([...naive.keys].sort());
    expect(withTt.search.nodes).toBeLessThan(naive.sequences);
  });

  it('preserves authored Phasing corridor, capture, terminal and pending/clock Act-end sets', () => {
    const fixtures = [
      buildState({ actions: 2, units: [
        { def: 'fire_1', owner: 'white', x: 5, y: 5 },
        { def: 'plant_1', owner: 'white', x: 5, y: 4 },
        { def: 'water_1', owner: 'black', x: 9, y: 9 },
      ] }),
      buildState({ actions: 2, units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'white', x: 3, y: 4 },
        { def: 'lightning_1', owner: 'black', x: 5, y: 4 },
        { def: 'water_1', owner: 'black', x: 9, y: 9 },
      ] }),
      buildState({ actions: 2, units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'white', x: 1, y: 1 },
        { def: 'lightning_1', owner: 'black', x: 5, y: 4 },
      ] }),
      buildState({ actions: 2, inactivityPlies: 9, pendingSummons: [
        { def: 'plant_1', owner: 'black', x: 8, y: 9 },
      ], units: [
        { def: 'plant_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'white', x: 3, y: 2 },
        { def: 'water_1', owner: 'black', x: 9, y: 9 },
      ] }),
    ];
    for (const [i, state] of fixtures.entries()) {
      const prepared = prepare(state), naive = naiveEndSet(prepared);
      expect(naive.keys.size, `fixture ${i}`).toBeGreaterThan(0);
      expect([...canonicalEndSet(prepared, 0).keys].sort(), `fixture ${i}, TT off`).toEqual([...naive.keys].sort());
      expect([...canonicalEndSet(prepared, 18).keys].sort(), `fixture ${i}, TT on`).toEqual([...naive.keys].sort());
    }
  });

  it('keeps the end position of a PRUNED child that ends the game', () => {
    // `canonical-move-then-kill`: Muju B2 moves, then Hi E5 kills the last
    // Black unit. C1 prunes that order in favour of "kill, then move" — which
    // cannot exist, because the kill ends the turn. The pruned child must
    // still be applied and recorded.
    const prepared = prepare(buildState({ actions: 2, units: [
      { def: 'fire_1', owner: 'white', x: 4, y: 4 },
      { def: 'plant_1', owner: 'white', x: 1, y: 1 },
      { def: 'lightning_1', owner: 'black', x: 5, y: 4 },
    ] }));
    const move = findAction(prepared, AKind.MOVE, 1, sq(1, 2)); // Muju B2 -> B3
    const moveFoot = footprint(prepared.p, prepared.rep.dist, move, bbNew());
    const undo = newUndo();
    prepared.rep.make(prepared.p, move, undo);
    const kill = findAction(prepared, AKind.ATTACK, 0, sq(5, 4)); // Hi E5 x F5
    expect(actionKey(move)).toBeGreaterThan(actionKey(kill));
    expect(isIndependent(prepared.p, prepared.rep.dist, move, moveFoot, kill)).toBe(true);
    prepared.rep.make(prepared.p, kill, undo);
    expect(prepared.p.result).not.toBe(Result.ONGOING);
    const terminalKey = keyOf(prepared.p.kposLo, prepared.p.kposHi);
    prepared.rep.unmake(prepared.p, undo);
    prepared.rep.unmake(prepared.p, undo);

    expect(canonicalEndSet(prepared, 0).keys.has(terminalKey)).toBe(true);
    expect(canonicalEndSet(prepared, 18).keys.has(terminalKey)).toBe(true);
  });
});

describe('ActionSearch.run (DESIGN §5.4)', () => {
  const fixtureState = buildState({
    units: [
      { def: 'fire_1', owner: 'white', x: 4, y: 4 },
      { def: 'plant_1', owner: 'white', x: 5, y: 5 },
      { def: 'lightning_1', owner: 'black', x: 5, y: 4 },
      { def: 'water_1', owner: 'black', x: 9, y: 9 },
    ],
    actions: 3,
  });

  it('returns at most cfg.keep turns, best gain first, each carrying the prefix', () => {
    const prepared = prepare(fixtureState);
    const pool = new TurnPool(8);
    const search = new ActionSearch(prepared.rep, { widths: UNBOUNDED, keep: 4, ttBits: 18 }, pool, new Scratch(1, 1, 1, 1));
    const prefix = Int32Array.from([findAction(prepared, AKind.MOVE, 1, sq(6, 5))]);
    const prefixUndo = newUndo();
    prepared.rep.make(prepared.p, prefix[0], prefixUndo);
    const out: Turn[] = [];
    // Score by the mover's material so the ordering has something to rank on.
    const n = search.run(
      prepared.p,
      neutralTables(),
      prefix,
      1,
      7,
      p => p.materialCc[0] - p.materialCc[1],
      UNLIMITED_WORK,
      0,
      out,
    );
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(4);
    for (let i = 1; i < n; i++) expect(out[i - 1].gainCc).toBeGreaterThanOrEqual(out[i].gainCc);
    for (let i = 0; i < n; i++) {
      expect(out[i].place).toBe(7);
      expect(out[i].actions[0]).toBe(prefix[0]);
      expect(out[i].count).toBeGreaterThanOrEqual(2);
      expect(out[i].sig).not.toBe(0);
    }
    // The best line takes the free kill, so at least one kept turn is tactical.
    expect(out.slice(0, n).some(t => (t.flags & TurnFlag.KILL) !== 0)).toBe(true);
    prepared.rep.unmake(prepared.p, prefixUndo);
  });

  it('widening bounds the branching without touching the turn boundary', () => {
    const prepared = prepare(fixtureState);
    const pool = new TurnPool(8);
    const narrow = new ActionSearch(
      prepared.rep,
      { widths: Int32Array.from([1, 1, 1, 1]), keep: 1, ttBits: 0 },
      pool,
      new Scratch(1, 1, 1, 1),
    );
    const out: Turn[] = [];
    narrow.run(prepared.p, neutralTables(), new Int32Array(0), 0, -1, () => 0, UNLIMITED_WORK, 0, out);
    // One action per step plus the boundary at every node: four nodes, four ends.
    expect(narrow.nodes).toBeLessThanOrEqual(4);
    expect(narrow.ends).toBe(narrow.nodes);
  });

  it('refuses a state that is not in a live action phase', () => {
    const prepared = prepare(fixtureState);
    const search = searchFor(prepared, 0, 1);
    const out: Turn[] = [];
    prepared.p.phase = 0;
    expect(search.run(prepared.p, neutralTables(), new Int32Array(0), 0, -1, () => 0, UNLIMITED_WORK, 0, out)).toBe(0);
    expect(search.enumerateAll(prepared.p, new Int32Array(0), 0, () => undefined)).toBe(0);
    prepared.p.phase = 1;
  });

  it('enumerateAll aborts with -1 once maxCalls is spent', () => {
    const prepared = prepare(createInitialGameState(undefined, 4, 0, 'phasing'));
    let ends = 0;
    const result = prepared.rep && searchFor(prepared, 0).enumerateAll(
      prepared.p,
      new Int32Array(0),
      0,
      () => {
        ends++;
      },
      10,
    );
    expect(result).toBe(-1);
    // Compare the bounded prefix to this ruleset's own complete enumeration.
    expect(ends).toBeLessThan(naiveEndSet(prepared).sequences);
  });

  it('rejects a prefix that leaves no room for the action phase', () => {
    const prepared = prepare(fixtureState);
    const search = searchFor(prepared, 0, 1);
    const prefix = new Int32Array(24).fill(paMake(AKind.END_PLACE, 0, 0, 0));
    expect(() => search.enumerateAll(prepared.p, prefix, 24, () => undefined)).toThrow(RangeError);
  });
});

describe('actionPriority (DESIGN §5.4)', () => {
  const cat = activeCatalog();

  function tablesWithThreat(slot: number): ActionSearchTables {
    const t = neutralTables();
    t.killActions[slot] = 2;
    return t;
  }

  it('ranks a kill on my own corner above a kill that only removes a threat', () => {
    // White corner is A1. A Black unit sits on it; another sits next to a
    // White unit the enemy can kill within a turn.
    const prepared = prepare(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 1, y: 0 }, // slot 0, can hit A1
          { def: 'fire_1', owner: 'white', x: 5, y: 5 }, // slot 1, the threatened unit
          { def: 'fire_1', owner: 'white', x: 5, y: 6 }, // slot 2, can hit F6's neighbour
          { def: 'lightning_1', owner: 'black', x: 0, y: 0 },
          { def: 'lightning_1', owner: 'black', x: 4, y: 6 },
        ],
        actions: 4,
      }),
    );
    const t = tablesWithThreat(1);
    const cornerKill = findAction(prepared, AKind.ATTACK, 0, sq(0, 0));
    const plainKill = findAction(prepared, AKind.ATTACK, 2, sq(4, 6));
    expect(actionPriority(prepared.p, t, cat, cornerKill, null, null)).toBeGreaterThan(
      actionPriority(prepared.p, t, cat, plainKill, null, null),
    );
    expect(actionPriority(prepared.p, t, cat, cornerKill, null, null)).toBeGreaterThan(100_000);
  });

  it('pays for an enemy-corner arrival, charges for the action cost, and reads the history table', () => {
    const prepared = prepare(
      buildState({
        units: [
          { def: 'lightning_3', owner: 'white', x: 9, y: 4 }, // speed 5, can reach J10
          { def: 'water_1', owner: 'black', x: 0, y: 0 },
        ],
        actions: 4,
      }),
    );
    const t = neutralTables();
    const toCorner = findAction(prepared, AKind.MOVE, 0, sq(9, 9));
    const sameCostElsewhere = findAction(prepared, AKind.MOVE, 0, sq(9, 8));
    expect(actionPriority(prepared.p, t, cat, toCorner, null, null)).toBeGreaterThan(
      actionPriority(prepared.p, t, cat, sameCostElsewhere, null, null) + 300,
    );

    const oneStep = findAction(prepared, AKind.MOVE, 0, sq(9, 3));
    const farStep = findAction(prepared, AKind.MOVE, 0, sq(0, 9));
    expect(actionPriority(prepared.p, t, cat, farStep, null, null)).toBeLessThan(
      actionPriority(prepared.p, t, cat, oneStep, null, null),
    );

    const hist = new Int32Array(8 * 100);
    hist[AKind.MOVE * 100 + sq(9, 3)] = 32 << 5;
    expect(actionPriority(prepared.p, t, cat, oneStep, null, hist)).toBe(
      actionPriority(prepared.p, t, cat, oneStep, null, null) + 32,
    );
  });

  it('pays the retreat bonus only for a move that leaves my exposure', () => {
    const prepared = prepare(
      buildState({
        units: [
          { def: 'plant_1', owner: 'white', x: 4, y: 4 },
          { def: 'water_1', owner: 'black', x: 9, y: 9 },
        ],
        actions: 4,
      }),
    );
    const exposed = neutralTables();
    // Everything on rank 5 is under fire; rank 4 is not.
    for (let x = 0; x < 10; x++) {
      const s = sq(x, 4);
      exposed.exposure[0][s >>> 5] |= 1 << (s & 31);
    }
    const out = findAction(prepared, AKind.MOVE, 0, sq(4, 3));
    const along = findAction(prepared, AKind.MOVE, 0, sq(3, 4));
    expect(actionPriority(prepared.p, exposed, cat, out, null, null)).toBe(
      actionPriority(prepared.p, neutralTables(), cat, out, null, null) + 200,
    );
    expect(actionPriority(prepared.p, exposed, cat, along, null, null)).toBe(
      actionPriority(prepared.p, neutralTables(), cat, along, null, null),
    );
  });
});
