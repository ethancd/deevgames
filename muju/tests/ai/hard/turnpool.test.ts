// @vitest-environment node
/**
 * The macro-turn record and its pool (DESIGN §4.13 `gen/turn.ts`).
 *
 * `TurnPool` is the no-allocation contract: every `Turn` the generator, the
 * ordering and the search ever touch comes out of a pool built once. The
 * signature is the killer/counter-move key, so it has to be ABSTRACT (two
 * positions that differ only in which unit id sits on a square must hash the
 * same idea identically) and still discriminating. `decodeTurn` is the bridge
 * back to the canonical engine, so it is tested the only way that matters:
 * the produced `AIAction[]` is replayed through `isLegalAction` +
 * `applyAction` and the re-packed `Kpos` must equal the turn's own.
 */
import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../../src/game/board';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import type { GameState } from '../../../src/game/types';
import { DEAD, MAX_TURN_ACTIONS, Result, type PackedState } from '../../../src/ai/hard/types';
import { AKind, newKeepSetTable, paMake, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { ActionSearch, UNLIMITED_WORK, neutralTables } from '../../../src/ai/hard/gen/actionsearch';
import {
  TACTICAL_FLAGS,
  TurnFlag,
  TurnPool,
  decodeTurn,
  turnSignature,
  type Turn,
} from '../../../src/ai/hard/gen/turn';
import { buildState } from './game-fixture';

const UNBOUNDED = new Int32Array([1 << 24, 1 << 24, 1 << 24, 1 << 24]);

function sq(x: number, y: number): number {
  return y * 10 + x;
}

interface Generated {
  rep: Replica;
  root: PackedState;
  turns: Turn[];
  count: number;
  keep: KeepSetTable;
}

/**
 * Runs the real action search over `state` and hands back the kept turns plus
 * the PRE-turn packed state they were generated from (which is what
 * `turnSignature`/`decodeTurn` are defined against).
 */
function generate(state: GameState, keepCount = 4): Generated {
  const rep = new Replica();
  const p = rep.pack(state, allocState());
  const keep = newKeepSetTable();
  const undo = newUndo();
  const prefix = new Int32Array(8);
  let prefixLen = 0;
  if (p.upkeepPending === 1) {
    rep.genKeepSets(p, keep);
    const a = paMake(AKind.PAY_UPKEEP, 0, 0, 0);
    prefix[prefixLen++] = a;
    rep.make(p, a, undo, keep);
  }
  if (p.phase === 0) {
    const a = paMake(AKind.END_PLACE, 0, 0, 0);
    prefix[prefixLen++] = a;
    rep.make(p, a, undo, keep);
  }
  // The pre-turn state the Turn's actions are read against: unwind the prefix.
  const root = rep.pack(state, allocState());
  const pool = new TurnPool(keepCount);
  const search = new ActionSearch(rep, { widths: UNBOUNDED, keep: keepCount, ttBits: 18 }, pool, new Scratch(1, 1, 1, 1));
  const turns: Turn[] = [];
  const count = search.run(
    p,
    neutralTables(),
    prefix,
    prefixLen,
    -1,
    // Every fixture here has White to move, so White's material advantage is
    // a mover-relative score that is also defined on a terminal position
    // (where the boundary never flipped `side`).
    q => q.materialCc[0] - q.materialCc[1],
    UNLIMITED_WORK,
    0,
    turns,
  );
  return { rep, root, turns, count, keep };
}

describe('TurnPool', () => {
  it('hands out distinct records, resets them, and recycles on reset()', () => {
    const pool = new TurnPool(3);
    expect(pool.capacity).toBe(3);
    expect(pool.used).toBe(0);
    expect(pool.free).toBe(3);

    const a = pool.alloc();
    const b = pool.alloc();
    expect(a).not.toBe(b);
    expect(a.actions.length).toBe(MAX_TURN_ACTIONS);
    expect(pool.used).toBe(2);
    expect(pool.free).toBe(1);

    a.count = 5;
    a.flags = TurnFlag.KILL;
    a.gainCc = 42;
    a.place = 9;
    a.hangCc = -7;
    a.sig = 0x1234;
    a.endLo = 1;
    a.endHi = 2;

    pool.reset();
    expect(pool.used).toBe(0);
    const again = pool.alloc();
    expect(again).toBe(a);
    expect(again.count).toBe(0);
    expect(again.flags).toBe(0);
    expect(again.gainCc).toBe(0);
    expect(again.place).toBe(-1);
    expect(again.hangCc).toBe(0);
    expect(again.sig).toBe(0);
    expect(again.endLo).toBe(0);
    expect(again.endHi).toBe(0);
  });

  it('throws rather than growing, and rejects a non-positive capacity', () => {
    const pool = new TurnPool(1);
    pool.alloc();
    expect(() => pool.alloc()).toThrow(RangeError);
    expect(() => new TurnPool(0)).toThrow(RangeError);
    expect(() => new TurnPool(1.5)).toThrow(RangeError);
  });

  it('bounds what ActionSearch keeps by the pool it was handed', () => {
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'white', x: 5, y: 5 },
        { def: 'lightning_1', owner: 'black', x: 5, y: 4 },
        { def: 'water_1', owner: 'black', x: 9, y: 9 },
      ],
      actions: 3,
    });
    const rep = new Replica();
    const p = rep.pack(state, allocState());
    const pool = new TurnPool(2);
    // `cfg.keep` is 4 but the pool only has 2 records free.
    const search = new ActionSearch(rep, { widths: UNBOUNDED, keep: 4, ttBits: 18 }, pool, new Scratch(1, 1, 1, 1));
    const out: Turn[] = [];
    const n = search.run(p, neutralTables(), new Int32Array(0), 0, -1, () => 0, UNLIMITED_WORK, 0, out);
    expect(n).toBeLessThanOrEqual(2);
    expect(pool.used).toBe(2);
  });
});

describe('turnSignature', () => {
  const state = buildState({
    units: [
      { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'hi' },
      { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'muju' },
      { def: 'lightning_1', owner: 'black', x: 5, y: 4, id: 'radi' },
      { def: 'water_1', owner: 'black', x: 9, y: 9, id: 'sjor' },
    ],
    actions: 3,
  });

  it('is stable, non-zero and discriminating across the kept turns', () => {
    const g = generate(state);
    expect(g.count).toBeGreaterThan(1);
    const sigs = new Set<number>();
    for (let i = 0; i < g.count; i++) {
      const sig = turnSignature(g.root, g.turns[i]);
      expect(sig).toBe(g.turns[i].sig);
      expect(sig).toBeGreaterThan(0);
      expect(turnSignature(g.root, g.turns[i])).toBe(sig);
      sigs.add(sig);
    }
    expect(sigs.size).toBe(g.count);
  });

  it('ignores the unit ids: the same idea from a relabelled position hashes the same', () => {
    const relabelled = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'alpha' },
        { def: 'plant_1', owner: 'white', x: 5, y: 5, id: 'beta' },
        { def: 'lightning_1', owner: 'black', x: 5, y: 4, id: 'gamma' },
        { def: 'water_1', owner: 'black', x: 9, y: 9, id: 'delta' },
      ],
      actions: 3,
    });
    const a = generate(state);
    const b = generate(relabelled);
    expect(b.count).toBe(a.count);
    for (let i = 0; i < a.count; i++) expect(b.turns[i].sig).toBe(a.turns[i].sig);
  });

  it('resolves a slot to the square it holds BEFORE the turn, not after', () => {
    const rep = new Replica();
    const p = rep.pack(state, allocState());
    const pool = new TurnPool(1);
    const one = pool.alloc();
    // Hi E5 -> D5, then Hi D5 -> C5: two hops of one slot. Both hash off E5.
    one.actions[0] = paMake(AKind.MOVE, 0, sq(3, 4), 1);
    one.actions[1] = paMake(AKind.MOVE, 0, sq(2, 4), 1);
    one.count = 2;
    const sig = turnSignature(p, one);

    // Reversing the two destinations is a different idea and must differ.
    one.actions[0] = paMake(AKind.MOVE, 0, sq(2, 4), 1);
    one.actions[1] = paMake(AKind.MOVE, 0, sq(3, 4), 1);
    expect(turnSignature(p, one)).not.toBe(sig);

    // A slot that is DEAD before the turn (a BUY's) hashes by slot index
    // instead of by square, and still differs from the live-slot form.
    one.actions[0] = paMake(AKind.MOVE, 9, sq(3, 4), 1);
    one.count = 1;
    expect(p.sq[9]).toBe(DEAD);
    expect(turnSignature(p, one)).not.toBe(sig);
  });

  it('separates the turn flags the quiescence layer reads', () => {
    expect(TACTICAL_FLAGS & TurnFlag.KILL).toBe(TurnFlag.KILL);
    expect(TACTICAL_FLAGS & TurnFlag.HOME_ENTRY).toBe(TurnFlag.HOME_ENTRY);
    expect(TACTICAL_FLAGS & TurnFlag.SUMMON_STRIKE).toBe(TurnFlag.SUMMON_STRIKE);
    // QUIET, RETREAT, PURCHASE and the rest are NOT tactical.
    expect(TACTICAL_FLAGS & TurnFlag.QUIET).toBe(0);
    expect(TACTICAL_FLAGS & TurnFlag.RETREAT).toBe(0);
    expect(TACTICAL_FLAGS & TurnFlag.PURCHASE).toBe(0);
    expect(TACTICAL_FLAGS & TurnFlag.PROMOTION).toBe(0);
  });

  it('marks a kill line KILL and never also QUIET', () => {
    const g = generate(state);
    const killer = g.turns.slice(0, g.count).find(t => (t.flags & TurnFlag.KILL) !== 0);
    expect(killer).toBeDefined();
    expect((killer as Turn).flags & TurnFlag.QUIET).toBe(0);
    for (let i = 0; i < g.count; i++) {
      const t = g.turns[i];
      expect((t.flags & TACTICAL_FLAGS) === 0).toBe((t.flags & TurnFlag.QUIET) !== 0);
    }
  });
});

describe('decodeTurn', () => {
  /** Replays `actions` through the canonical engine, refusing anything illegal. */
  function replay(state: GameState, turn: Turn, keep: KeepSetTable, root: PackedState): GameState {
    let s = state;
    for (const action of decodeTurn(root, turn, keep)) {
      expect(isLegalAction(s, action), `illegal action ${JSON.stringify(action)}`).toBe(true);
      s = applyAction(s, action);
    }
    return s;
  }

  it('every kept turn of the initial position replays through applyAction to its own Kpos', () => {
    const state = createInitialGameState();
    const g = generate(state, 4);
    expect(g.count).toBe(4);
    const packer = new Replica();
    const scratch = allocState();
    for (let i = 0; i < g.count; i++) {
      const turn = g.turns[i];
      const end = replay(state, turn, g.keep, g.root);
      const packed = packer.pack(end, scratch);
      expect(packed.kposLo, `turn ${i} kposLo`).toBe(turn.endLo);
      expect(packed.kposHi, `turn ${i} kposHi`).toBe(turn.endHi);
    }
  });

  it('replays a turn that ends the game, and stops there', () => {
    // White Hi E5 can eliminate the only Black unit; the turn's last action is
    // the kill itself, with no END_ACTION after it.
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'white', x: 1, y: 1 },
        { def: 'lightning_1', owner: 'black', x: 5, y: 4 },
      ],
      actions: 2,
    });
    const g = generate(state, 4);
    const rep = new Replica();
    const scratch = allocState();
    let terminal = 0;
    for (let i = 0; i < g.count; i++) {
      const end = replay(state, g.turns[i], g.keep, g.root);
      const packed = rep.pack(end, scratch);
      expect(packed.kposLo).toBe(g.turns[i].endLo);
      expect(packed.kposHi).toBe(g.turns[i].endHi);
      if (packed.result !== Result.ONGOING) {
        terminal++;
        const last = g.turns[i].actions[g.turns[i].count - 1];
        expect(last).not.toBe(paMake(AKind.END_ACTION, 0, 0, 0));
      }
    }
    expect(terminal).toBeGreaterThan(0);
  });

  it('walks the turn forward, so an action can reference what an earlier one produced', () => {
    // A place-phase prefix that buys a unit and then moves it: the decoder has
    // to derive the bought unit's canonical id from the state mid-turn.
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 1, y: 0 },
        { def: 'water_1', owner: 'black', x: 9, y: 9 },
      ],
      white: 12,
      phase: 'place',
      actions: 4,
    });
    const rep = new Replica();
    const root = rep.pack(state, allocState());
    const place = new Int32Array(64);
    const n = rep.genPlace(root, place);
    const buy = place.slice(0, n).find(a => a !== paMake(AKind.END_PLACE, 0, 0, 0));
    expect(buy).toBeDefined();

    const p = rep.pack(state, allocState());
    const undo = newUndo();
    const keep = newKeepSetTable();
    const prefix = Int32Array.from([buy as number, paMake(AKind.END_PLACE, 0, 0, 0)]);
    rep.make(p, prefix[0], undo, keep);
    rep.make(p, prefix[1], undo, keep);

    const pool = new TurnPool(2);
    const search = new ActionSearch(rep, { widths: UNBOUNDED, keep: 2, ttBits: 18 }, pool, new Scratch(1, 1, 1, 1));
    const out: Turn[] = [];
    const count = search.run(p, neutralTables(), prefix, 2, 0, q => q.materialCc[0] - q.materialCc[1], UNLIMITED_WORK, 0, out);
    expect(count).toBeGreaterThan(0);

    const packer = new Replica();
    const scratch = allocState();
    for (let i = 0; i < count; i++) {
      expect(out[i].flags & TurnFlag.PURCHASE).toBe(TurnFlag.PURCHASE);
      const end = replay(state, out[i], keep, root);
      const packed = packer.pack(end, scratch);
      expect(packed.kposLo).toBe(out[i].endLo);
      expect(packed.kposHi).toBe(out[i].endHi);
    }
  });
});
