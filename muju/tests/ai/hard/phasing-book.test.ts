// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GameState } from '../../../src/game/types';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { mirror180 } from '../../../lab/hard-ai/positions/corpus';
import { allocState, Replica } from '../../../src/ai/hard/core/state';
import { BookFormatError, EMPTY_BOOK, HEADER_BYTES, packBook, parseBook } from '../../../src/ai/hard/book/format';
import { bookCompatibility, canonicalKey, findCompatibleBookEntry, mirrorPackedForBook, probeBook } from '../../../src/ai/hard/book/probe';
import { cloneWeights, DEFAULT_WEIGHTS } from '../../../src/ai/hard/eval/weights';
import { TurnPool } from '../../../src/ai/hard/gen/turn';
import { buildState } from './game-fixture';

const rep = new Replica();
function state() {
  return buildState({ units: [
    { id: 'a', def: 'water_1', owner: 'white', x: 3, y: 3 },
    { id: 'b', def: 'metal_1', owner: 'black', x: 7, y: 7 }],
    pendingSummons: [
      { id: 'w-first', def: 'fire_1', owner: 'white', x: 1, y: 2 },
      { id: 'b-second', def: 'plant_1', owner: 'black', x: 8, y: 8 },
      { id: 'w-third', def: 'plant_1', owner: 'white', x: 1, y: 1 }],
    current: 'black', phase: 'place', actions: 0, white: 50, black: 50,
    victoryRule: 'elimination', inactivityRule: 'off', turnNumber: 6 });
}
function fixture() {
  const p = rep.pack(state()), key = canonicalKey(p), turn = new TurnPool(1).alloc();
  turn.endLo = 123; turn.endHi = 456;
  const entry = { keyLo: key.lo, keyHi: key.hi, turnLo: 123, turnHi: 456, flags: 2, score: -17, count: 4 };
  const meta = { handicap: p.handicap, mapHash: 0, weightsVersion: DEFAULT_WEIGHTS.version, ...bookCompatibility(p, DEFAULT_WEIGHTS) };
  const bytes = packBook([entry], meta), book = parseBook(bytes.buffer as ArrayBuffer);
  return { p, turn, entry, meta, bytes, book };
}

describe('ordered Phasing mirrors', () => {
  it('mirrors all pending planes, preserves commit order and agrees with canonical fresh packing', () => {
    const s = state(), p = rep.pack(s), m = mirrorPackedForBook(p, allocState());
    const fresh = rep.pack(mirror180(s));
    for (const key of ['pendDef', 'pendCost', 'pendOrd', 'pendIds', 'reserve', 'initialReserve', 'bank', 'gained', 'ord', 'ordNext', 'pendOrdNext', 'kposLo', 'kposHi'] as const) expect(m[key], key).toEqual(fresh[key]);
    expect(rep.unpack(m).pendingSummons?.map(v => v.id)).toEqual(['w-first', 'b-second', 'w-third']);
    expect(mirrorPackedForBook(m, allocState())).toEqual(p);
  });
  it('rotates ordered receipts, income positions and highlights without mutation', () => {
    const s = state(), before = structuredClone(s);
    s.lastSummoning = { player: 'white', turnNumber: 5, summoned: [s.pendingSummons![0]], disrupted: [s.pendingSummons![2]] };
    s.lastIncome = { player: 'white', turnNumber: 5, total: 2, takes: [{ unitId: 'a', definitionId: 'water_1', position: { x: 3, y: 3 }, amount: 2 }] };
    s.validMoves = [{ x: 1, y: 3 }]; s.validAttacks = [{ x: 2, y: 3 }];
    const m = mirror180(s);
    expect(m.lastSummoning?.summoned[0]).toEqual({ ...s.pendingSummons![0], owner: 'black', position: { x: 8, y: 7 } });
    expect(m.lastIncome?.takes[0].position).toEqual({ x: 6, y: 6 });
    expect(m.validMoves).toEqual([{ x: 8, y: 6 }]); expect(m.validAttacks).toEqual([{ x: 7, y: 6 }]);
    expect(mirror180(m)).toEqual(s); expect(s.pendingSummons).toEqual(before.pendingSummons);
  });
  it('commutes with affordable pass boundaries and ordered arrivals apart from seat-based round labels', () => {
    let a = state(), b = mirror180(a);
    const roundLabels: number[][] = [];
    const withoutRoundLabels = (state: GameState) => {
      const out = structuredClone(state);
      out.turn.turnNumber = 0;
      for (const receipt of [out.lastIncome, out.lastUpkeep, out.lastSummoning]) if (receipt) receipt.turnNumber = 0;
      return out;
    };
    for (const type of ['END_PLACE_PHASE', 'END_ACTION_PHASE', 'END_PLACE_PHASE'] as const) {
      const action = { type };
      expect(isLegalAction(a, action)).toBe(true); expect(isLegalAction(b, action)).toBe(true);
      a = applyAction(a, action); b = applyAction(b, action);
      // Canonical round increments when White starts. A seat swap cannot
      // commute with that label while staying an integer-valued involution.
      roundLabels.push([a.turn.turnNumber, b.turn.turnNumber]);
      expect(withoutRoundLabels(mirror180(a))).toEqual(withoutRoundLabels(b));
    }
    expect(roundLabels).toEqual([[7, 6], [7, 6], [7, 7]]);
    expect(a.pendingSummons).toHaveLength(0);
    expect(a.board.units.map(u => u.id)).toEqual(['a', 'b', 'w-first', 'w-third', 'b-second']);
  });
  it('keeps raw book keys because the named forecast policy is not rotationally symmetric', () => {
    const p = rep.pack(state());
    expect(canonicalKey(p)).toEqual({ lo: p.kturnLo >>> 0, hi: p.kturnHi >>> 0, negated: false });
    p.handicap = 3;
    expect(canonicalKey(p).negated).toBe(false);
  });
});

describe('BK03 exact compatibility and candidate matching', () => {
  it('round-trips metadata and permits only the stored generated end key', () => {
    const { p, book, turn, entry, meta } = fixture();
    expect(book.lookup(entry.keyLo, entry.keyHi)).toEqual(entry);
    expect(book.weightsKey).toBe(meta.weightsKey);
    expect(probeBook(book, p, [turn], 1, DEFAULT_WEIGHTS)).toBe(0);
    turn.endLo++;
    expect(probeBook(book, p, [turn], 1, DEFAULT_WEIGHTS)).toBe(-1);
    expect(probeBook(EMPTY_BOOK, p, [turn], 1, DEFAULT_WEIGHTS)).toBe(-1);
  });
  it('refuses changed same-version weights, maps, rules, handicap and old descriptors', () => {
    const { p, book, turn } = fixture();
    const w = cloneWeights(DEFAULT_WEIGHTS); w.w[2]++;
    expect(probeBook(book, p, [turn], 1, w)).toBe(-1);
    expect(probeBook(book, p, [turn], 1)).toBe(-1);
    const stale = cloneWeights(DEFAULT_WEIGHTS); delete stale.featureSchema;
    expect(probeBook(book, p, [turn], 1, stale)).toBe(-1);
    const map = rep.pack(state()); map.initialReserve[0]++;
    expect(probeBook(book, map, [turn], 1, DEFAULT_WEIGHTS)).toBe(-1);
    const rules = rep.pack(state()); rules.victoryHome = rules.victoryHome ? 0 : 1;
    expect(probeBook(book, rules, [turn], 1, DEFAULT_WEIGHTS)).toBe(-1);
    const handicap = rep.pack(state()); handicap.handicap = 3;
    expect(probeBook(book, handicap, [turn], 1, DEFAULT_WEIGHTS)).toBe(-1);
    expect(probeBook({ ...book, lookup: book.lookup.bind(book), formatVersion: undefined }, p, [turn], 1, DEFAULT_WEIGHTS)).toBe(-1);
  });
  it('uses the same compatibility gate for time-budget hits and distinguishes partial/Prepare roots', () => {
    const { p, book, turn } = fixture();
    expect(findCompatibleBookEntry(book, p, DEFAULT_WEIGHTS)).not.toBeNull();
    const changed = cloneWeights(DEFAULT_WEIGHTS); changed.w[2]++;
    expect(findCompatibleBookEntry(book, p, changed)).toBeNull();
    const act = state(); act.turn.phase = 'action'; act.turn.actionsRemaining = 4;
    const freshAct = rep.pack(act);
    expect(freshAct.kposLo).toBe(p.kposLo); expect(freshAct.kposHi).toBe(p.kposHi);
    expect(canonicalKey(freshAct)).not.toEqual(canonicalKey(p));
    expect(probeBook(book, freshAct, [turn], 1, DEFAULT_WEIGHTS)).toBe(-1);
    act.turn.actionsRemaining = 3;
    expect(canonicalKey(rep.pack(act))).not.toEqual(canonicalKey(freshAct));
  });
  it('rejects legacy magic, malformed/extra bytes, invalid metadata and duplicate keys', () => {
    const { bytes, entry, meta } = fixture();
    const old = bytes.slice(); old[7] = '2'.charCodeAt(0);
    expect(() => parseBook(old.buffer)).toThrow(BookFormatError);
    expect(() => parseBook(bytes.slice(0, HEADER_BYTES - 1).buffer)).toThrow(BookFormatError);
    const extra = new Uint8Array(bytes.length + 1); extra.set(bytes);
    expect(() => parseBook(extra.buffer)).toThrow(BookFormatError);
    const bad = bytes.slice(); new DataView(bad.buffer).setUint32(20, 0xffffffff, true);
    expect(() => parseBook(bad.buffer)).toThrow(BookFormatError);
    expect(() => packBook([entry, entry], meta)).toThrow(/duplicate/);
    expect(() => packBook([entry], { ...meta, weightsKey: '' })).toThrow(/keys/);
    expect(() => packBook([entry], { ...meta, handicap: 21 })).toThrow(/metadata/);
  });
});
