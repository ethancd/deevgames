// @vitest-environment node
/**
 * `core/action.ts` (DESIGN §3.2; M4 gate: "`PA` round-trips for every kind;
 * `keepSetIds` round-trips"). Two layers are pinned here: the bit layout
 * (`paMake`/`paKind`/`paA`/`paB`/`paC` over each field's full range) and the
 * packed/canonical boundary (`toAIAction`/`fromAIAction`/`keepSetIds`),
 * including a differential check that the id `unitIdFor` invents for a unit
 * bought during the search is the id the canonical engine actually assigns.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  AKind,
  KEEP_SET_CAPACITY,
  PaDecodeError,
  findKeepSet,
  fromAIAction,
  keepSetAdd,
  keepSetHas,
  keepSetIds,
  keepSetReset,
  newKeepSetTable,
  paA,
  paB,
  paC,
  paKind,
  paMake,
  slotForId,
  toAIAction,
  unitIdFor,
  type PA,
} from '../../../src/ai/hard/core/action';
import { DEF_ID, DEF_INDEX, NDEF } from '../../../src/ai/hard/core/catalog';
import { MAX_SLOTS, type PackedState } from '../../../src/ai/hard/types';
import type { AIAction } from '../../../src/ai/types';
import { allocPacked, putPending, putUnit } from './packed-fixture';
import { createInitialGameState } from '../../../src/game/board';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { applyAction } from '../../../src/ai/simulate';
import type { GameState } from '../../../src/game/types';

// E0.5 timeout budget: slowest test 0.5 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const ALL_KINDS: readonly AKind[] = [
  AKind.END_PLACE, AKind.MOVE, AKind.ATTACK, AKind.BUY,
  AKind.PROMOTE, AKind.END_ACTION, AKind.PAY_UPKEEP, AKind.RESIGN,
];

/** White: Hi@B1, Sjor@B2, Muju@A2 (slots 0-2, named). Black: Muju@I9 (slot 3, named).
 *  Slot 4 is a white unit bought during the search (no originId). */
function fixture(): PackedState {
  const p = allocPacked();
  putUnit(p, { slot: 0, side: 0, defId: DEF_INDEX.get('fire_1') as number, sq: 1, originId: 'white-hi' });
  putUnit(p, { slot: 1, side: 0, defId: DEF_INDEX.get('water_1') as number, sq: 11, originId: 'white-sjor' });
  putUnit(p, { slot: 2, side: 0, defId: DEF_INDEX.get('plant_1') as number, sq: 10, originId: 'white-muju' });
  putUnit(p, { slot: 3, side: 1, defId: DEF_INDEX.get('plant_1') as number, sq: 98, originId: 'black-muju' });
  putUnit(p, { slot: 4, side: 0, defId: DEF_INDEX.get('metal_2') as number, sq: 20 });
  p.turnNumber = 7;
  return p;
}

describe('core/action: PA bit layout', () => {
  it('round-trips every kind over each field’s full range', () => {
    for (const kind of ALL_KINDS) {
      for (let a = 0; a < 128; a++) {
        for (const b of [0, 1, 42, 99, 127]) {
          for (const c of [0, 1, 4, 127]) {
            const pa: PA = paMake(kind, a, b, c);
            expect(pa).toBeGreaterThanOrEqual(0);
            expect(pa).toBeLessThan(1 << 24);
            expect(paKind(pa)).toBe(kind);
            expect(paA(pa)).toBe(a);
            expect(paB(pa)).toBe(b);
            expect(paC(pa)).toBe(c);
          }
        }
      }
    }
  });

  it('packs the four fields into disjoint bit ranges', () => {
    expect(paMake(AKind.END_PLACE)).toBe(0);
    expect(paMake(AKind.RESIGN)).toBe(7);
    expect(paMake(AKind.MOVE, 1)).toBe(AKind.MOVE | (1 << 3));
    expect(paMake(AKind.MOVE, 0, 1)).toBe(AKind.MOVE | (1 << 10));
    expect(paMake(AKind.MOVE, 0, 0, 1)).toBe(AKind.MOVE | (1 << 17));
    // Distinct (kind, a, b, c) tuples never collide.
    const seen = new Set<number>();
    for (const kind of ALL_KINDS) {
      for (let a = 0; a < 128; a += 13) {
        for (let b = 0; b < 128; b += 11) {
          for (let c = 0; c < 5; c++) {
            const pa = paMake(kind, a, b, c);
            expect(seen.has(pa)).toBe(false);
            seen.add(pa);
          }
        }
      }
    }
  });

  it('every slot id (0..127) and every square (0..99) fits its field', () => {
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const pa = paMake(AKind.MOVE, slot, 99, 4);
      expect(paA(pa)).toBe(slot);
    }
    for (let s = 0; s < 100; s++) expect(paB(paMake(AKind.BUY, NDEF - 1, s))).toBe(s);
    for (let i = 0; i < KEEP_SET_CAPACITY; i++) expect(paA(paMake(AKind.PAY_UPKEEP, i))).toBe(i);
  });
});

describe('core/action: keep-set table', () => {
  it('stores slot bitmasks and reads them back as ascending canonical ids', () => {
    const p = fixture();
    const keep = newKeepSetTable();
    keep.count = 2;
    keepSetAdd(keep, 0, 2);
    keepSetAdd(keep, 0, 0);
    keepSetAdd(keep, 1, 3);
    keepSetAdd(keep, 1, 4);

    expect(keepSetHas(keep, 0, 0)).toBe(true);
    expect(keepSetHas(keep, 0, 1)).toBe(false);
    expect(keepSetIds(p, keep, 0)).toEqual(['white-hi', 'white-muju']);
    expect(keepSetIds(p, keep, 1)).toEqual(['black-muju', unitIdFor(p, 4)]);
  });

  it('handles slots above 31 (the mask is 128 bits wide)', () => {
    const p = allocPacked();
    putUnit(p, { slot: 0, side: 0, defId: 0, sq: 0, originId: 'a' });
    putUnit(p, { slot: 70, side: 0, defId: 0, sq: 70, originId: 'b' });
    putUnit(p, { slot: 127, side: 0, defId: 0, sq: 99, originId: 'c' });
    const keep = newKeepSetTable();
    keep.count = 1;
    for (const slot of [0, 70, 127]) keepSetAdd(keep, 0, slot);
    expect(keepSetIds(p, keep, 0)).toEqual(['a', 'b', 'c']);
  });

  it('keepSetReset empties the table for reuse', () => {
    const keep = newKeepSetTable();
    keep.count = 3;
    keepSetAdd(keep, 2, 5);
    keepSetReset(keep);
    expect(keep.count).toBe(0);
    expect(keepSetHas(keep, 2, 5)).toBe(false);
  });

  it('rejects an out-of-range keep-set index', () => {
    const p = fixture();
    const keep = newKeepSetTable();
    expect(() => keepSetIds(p, keep, KEEP_SET_CAPACITY)).toThrow(PaDecodeError);
    expect(() => keepSetIds(p, keep, -1)).toThrow(PaDecodeError);
  });
});

describe('core/action: canonical boundary', () => {
  function keepTable(p: PackedState): { keep: ReturnType<typeof newKeepSetTable> } {
    const keep = newKeepSetTable();
    keep.count = 3;
    keepSetAdd(keep, 0, 0);
    keepSetAdd(keep, 1, 0);
    keepSetAdd(keep, 1, 1);
    keepSetAdd(keep, 2, 4);
    void p;
    return { keep };
  }

  it('toAIAction / fromAIAction round-trip every kind', () => {
    const p = fixture();
    const { keep } = keepTable(p);
    const cases: readonly PA[] = [
      paMake(AKind.END_PLACE),
      paMake(AKind.END_ACTION),
      paMake(AKind.RESIGN),
      paMake(AKind.MOVE, 1, 21, 2),
      paMake(AKind.ATTACK, 0, 2),
      paMake(AKind.PROMOTE, 2),
      paMake(AKind.BUY, DEF_INDEX.get('shadow_1') as number, 30),
      paMake(AKind.PAY_UPKEEP, 1),
      // a unit bought earlier in this same turn
      paMake(AKind.MOVE, 4, 30, 1),
      paMake(AKind.PROMOTE, 4),
    ];
    for (const pa of cases) {
      const canonical = toAIAction(p, pa, keep);
      const back = fromAIAction(p, canonical, keep);
      // `paC` is an encoder-side cache the canonical action does not carry, so
      // the round-trip preserves kind/a/b exactly and drops c.
      expect(paKind(back)).toBe(paKind(pa));
      expect(paA(back)).toBe(paA(pa));
      expect(paB(back)).toBe(paB(pa));
      expect(paC(back)).toBe(0);
    }
  });

  it('decodes each kind into the canonical AIAction shape', () => {
    const p = fixture();
    const { keep } = keepTable(p);
    expect(toAIAction(p, paMake(AKind.END_PLACE), keep)).toEqual({ type: 'END_PLACE_PHASE' });
    expect(toAIAction(p, paMake(AKind.END_ACTION), keep)).toEqual({ type: 'END_ACTION_PHASE' });
    expect(toAIAction(p, paMake(AKind.RESIGN), keep)).toEqual({ type: 'RESIGN' });
    expect(toAIAction(p, paMake(AKind.MOVE, 1, 34, 3), keep)).toEqual({ type: 'MOVE', unitId: 'white-sjor', to: { x: 4, y: 3 } });
    expect(toAIAction(p, paMake(AKind.ATTACK, 0, 2), keep)).toEqual({ type: 'ATTACK', unitId: 'white-hi', targetPosition: { x: 2, y: 0 } });
    expect(toAIAction(p, paMake(AKind.PROMOTE, 2), keep)).toEqual({ type: 'PROMOTE_UNIT', unitId: 'white-muju' });
    expect(toAIAction(p, paMake(AKind.BUY, 0, 99), keep)).toEqual({ type: 'BUY_UNIT', definitionId: DEF_ID[0], position: { x: 9, y: 9 } });
    expect(toAIAction(p, paMake(AKind.PAY_UPKEEP, 1), keep)).toEqual({ type: 'PAY_UPKEEP', keepUnitIds: ['white-hi', 'white-sjor'] });
  });

  it('a keep-set round-trips through PAY_UPKEEP for every entry in the table', () => {
    const p = fixture();
    const { keep } = keepTable(p);
    for (let i = 0; i < keep.count; i++) {
      const action = toAIAction(p, paMake(AKind.PAY_UPKEEP, i), keep);
      expect(action.type).toBe('PAY_UPKEEP');
      expect(fromAIAction(p, action, keep)).toBe(paMake(AKind.PAY_UPKEEP, i));
      expect(findKeepSet(p, keep, keepSetIds(p, keep, i))).toBe(i);
    }
    // Order within `keepUnitIds` is irrelevant: the lookup is set-based.
    const reversed: AIAction = { type: 'PAY_UPKEEP', keepUnitIds: [...keepSetIds(p, keep, 1)].reverse() };
    expect(fromAIAction(p, reversed, keep)).toBe(paMake(AKind.PAY_UPKEEP, 1));
  });

  it('throws PaDecodeError on unknown ids, unknown definitions and absent keep-sets', () => {
    const p = fixture();
    const { keep } = keepTable(p);
    expect(() => fromAIAction(p, { type: 'MOVE', unitId: 'nobody', to: { x: 0, y: 0 } }, keep)).toThrow(PaDecodeError);
    expect(() => fromAIAction(p, { type: 'BUY_UNIT', definitionId: 'stone_9', position: { x: 0, y: 0 } }, keep)).toThrow(PaDecodeError);
    expect(() => fromAIAction(p, { type: 'PAY_UPKEEP', keepUnitIds: ['white-muju'] }, keep)).toThrow(PaDecodeError);
    expect(() => toAIAction(p, paMake(AKind.BUY, NDEF, 0), keep)).toThrow(PaDecodeError);
    expect(() => unitIdFor(p, 50)).toThrow(PaDecodeError);
  });
});

describe('core/action: ids for units bought during the search', () => {
  it('matches the id the canonical engine assigns (simulate.ts:14-20)', () => {
    let state: GameState = createInitialGameState();
    state = {
      ...state,
      players: { ...state.players, white: { ...state.players.white, resources: 12 } },
      turn: { ...state.turn, phase: 'place' },
    };
    const square = getAllSpawnPositions('white', state.board).sort((a, b) => a.y * 10 + a.x - (b.y * 10 + b.x))[0];
    const bought = applyAction(state, { type: 'BUY_UNIT', definitionId: 'fire_1', position: square });
    const newIds = bought.board.units.filter(u => !state.board.units.some(o => o.id === u.id)).map(u => u.id);
    expect(newIds).toHaveLength(1);

    // The packed mirror: six starting units with their canonical ids, then the
    // bought unit in the next free slot with no `originIds` entry.
    const p = allocPacked();
    state.board.units.forEach((u, i) => {
      putUnit(p, { slot: i, side: u.owner === 'white' ? 0 : 1, defId: DEF_INDEX.get(u.definitionId) as number, sq: u.position.y * 10 + u.position.x, originId: u.id });
    });
    putUnit(p, { slot: state.board.units.length, side: 0, defId: DEF_INDEX.get('fire_1') as number, sq: square.y * 10 + square.x });
    p.turnNumber = state.turn.turnNumber;

    expect(unitIdFor(p, state.board.units.length)).toBe(newIds[0]);
    expect(slotForId(p, newIds[0])).toBe(state.board.units.length);
  });

  it('numbers successive ghost slots per owner and inverts exactly', () => {
    const p = allocPacked();
    putUnit(p, { slot: 0, side: 0, defId: 0, sq: 0, originId: 'seed-w' });
    putUnit(p, { slot: 1, side: 0, defId: 0, sq: 1 });
    putUnit(p, { slot: 2, side: 1, defId: 0, sq: 2 });
    putUnit(p, { slot: 3, side: 0, defId: 0, sq: 3 });
    putUnit(p, { slot: 4, side: 1, defId: 0, sq: 4 });
    p.turnNumber = 5;

    expect(unitIdFor(p, 1)).toBe('unit-white-5-0');
    expect(unitIdFor(p, 3)).toBe('unit-white-5-1');
    expect(unitIdFor(p, 2)).toBe('unit-black-5-0');
    expect(unitIdFor(p, 4)).toBe('unit-black-5-1');
    for (const slot of [0, 1, 2, 3, 4]) expect(slotForId(p, unitIdFor(p, slot))).toBe(slot);

    // A canonical id from an earlier turn never resolves to a ghost slot.
    expect(() => slotForId(p, 'unit-white-4-0')).toThrow(PaDecodeError);
    expect(() => slotForId(p, 'unit-white-5-2')).toThrow(PaDecodeError);
  });

  it('prefers an explicit originIds entry and never collides with one', () => {
    const p = allocPacked();
    // A pre-existing unit already carries the id the naive scheme would invent.
    putUnit(p, { slot: 0, side: 0, defId: 0, sq: 0, originId: 'unit-white-5-0' });
    putUnit(p, { slot: 1, side: 0, defId: 0, sq: 1 });
    putUnit(p, { slot: 2, side: 0, defId: 0, sq: 2, originId: 'unit-white-5-2' });
    putUnit(p, { slot: 3, side: 0, defId: 0, sq: 3 });
    p.turnNumber = 5;

    expect(unitIdFor(p, 0)).toBe('unit-white-5-0');
    // Ghost slots skip every index an originIds entry already occupies, exactly
    // as nextUnitId (simulate.ts:14-20) does.
    expect(unitIdFor(p, 1)).toBe('unit-white-5-1');
    expect(unitIdFor(p, 3)).toBe('unit-white-5-3');
    const ids = [0, 1, 2, 3].map(slot => unitIdFor(p, slot));
    expect(new Set(ids).size).toBe(4);
    for (const slot of [0, 1, 2, 3]) expect(slotForId(p, unitIdFor(p, slot))).toBe(slot);
  });

  it('commitments live outside the unit-id space entirely', () => {
    // A pending summon owns no slot, so `unitIdFor` and `slotForId` cannot see
    // it — and the id it carries in `pendIds` never shadows a unit's.
    const p = allocPacked();
    putUnit(p, { slot: 0, side: 0, defId: 0, sq: 0, originId: 'unit-white-5-0' });
    putUnit(p, { slot: 1, side: 0, defId: 0, sq: 1 });
    p.turnNumber = 5;
    const before = [unitIdFor(p, 0), unitIdFor(p, 1)];

    // The commitment deliberately carries the very id the ghost slot 1 derives,
    // which is the worst case: the codec must still resolve that id to the UNIT.
    expect(before[1]).toBe('unit-white-5-1');
    putPending(p, { side: 0, defId: 0, sq: 20, cost: 3, pendId: 'unit-white-5-1' });
    putPending(p, { side: 1, defId: 2, sq: 99, cost: 5 });
    expect([unitIdFor(p, 0), unitIdFor(p, 1)]).toEqual(before);
    expect(slotForId(p, 'unit-white-5-1')).toBe(1);
  });

  it('a BUY round-trips by definition and square, commitments present or not', () => {
    const p = allocPacked();
    putUnit(p, { slot: 0, side: 0, defId: DEF_INDEX.get('plant_1') as number, sq: 11, originId: 'w0' });
    putPending(p, { side: 0, defId: DEF_INDEX.get('fire_1') as number, sq: 0, cost: 3, pendId: 'committed' });
    const keep = newKeepSetTable();
    for (const id of ['fire_1', 'water_1', 'metal_1']) {
      for (const sq of [0, 5, 99]) {
        const pa = paMake(AKind.BUY, DEF_INDEX.get(id) as number, sq);
        const action = toAIAction(p, pa, keep);
        expect(action).toEqual({ type: 'BUY_UNIT', definitionId: id, position: { x: sq % 10, y: (sq / 10) | 0 } });
        // The encoding is definition + square only: whether that square already
        // carries a commitment is `isLegal`'s question, not the codec's.
        expect(fromAIAction(p, action, keep)).toBe(pa);
      }
    }
  });

  it('matches successive canonical buys in one turn', () => {
    const initial = createInitialGameState();
    // Widen White's spawn rectangle to 5x5 by pushing its Muju anchor to E5,
    // so three successive buys all have a legal square.
    let state: GameState = {
      ...initial,
      players: { ...initial.players, white: { ...initial.players.white, resources: 20 } },
      turn: { ...initial.turn, phase: 'place' },
      board: {
        ...initial.board,
        units: initial.board.units.map(u =>
          u.owner === 'white' && u.definitionId === 'plant_1' ? { ...u, position: { x: 4, y: 4 } } : u,
        ),
      },
    };
    const starting = state.board.units.map(u => u.id);
    const boughtIds: string[] = [];
    for (let buy = 0; buy < 3; buy++) {
      const square = getAllSpawnPositions('white', state.board)
        .map(pos => pos.y * 10 + pos.x)
        .sort((a, b) => a - b)[0];
      const next = applyAction({ ...state, turn: { ...state.turn, phase: 'place' } }, {
        type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: square % 10, y: (square / 10) | 0 },
      });
      const added = next.board.units.find(u => !state.board.units.some(o => o.id === u.id));
      expect(added).toBeDefined();
      boughtIds.push((added as { id: string }).id);
      state = next;
    }
    expect(boughtIds).toEqual(['unit-white-1-0', 'unit-white-1-1', 'unit-white-1-2']);

    const p = allocPacked();
    let slot = 0;
    for (const u of state.board.units) {
      const isStarting = starting.includes(u.id);
      putUnit(p, {
        slot,
        side: u.owner === 'white' ? 0 : 1,
        defId: DEF_INDEX.get(u.definitionId) as number,
        sq: u.position.y * 10 + u.position.x,
        originId: isStarting ? u.id : undefined,
      });
      slot++;
    }
    p.turnNumber = state.turn.turnNumber;
    const derived = state.board.units.map((_, i) => unitIdFor(p, i));
    expect(derived).toEqual(state.board.units.map(u => u.id));
  });
});
