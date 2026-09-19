// @vitest-environment node
/**
 * `search/order.ts` (DESIGN §4.16, §5.11.3): the killer/counter/history tables
 * and the nine-item ordering, including the SEE analogue.
 *
 * The ordering itself is checked against its own definition — a turn that takes
 * material sorts above a quiet turn, a turn that HANGS material sorts below one
 * that does not — rather than against a hard-coded list of end keys, so the test
 * still pins the semantics after a generator change.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../../../src/game/board';
import { TurnFlag, copyTurnRecord, type Turn } from '../../../src/ai/hard/gen/turn';
import {
  HISTORY_CEILING,
  ORDER_COUNTER,
  ORDER_KILLER,
  ORDER_TT,
  clearOrderTables,
  newOrderTables,
  onCutoff,
} from '../../../src/ai/hard/search/order';
import { allocTurn } from '../../../src/ai/hard/search/pvs';
import { Replica, newUndo } from '../../../src/ai/hard/core/state';
import { fromAIAction, newKeepSetTable } from '../../../src/ai/hard/core/action';
import { verifyTurn } from '../../../src/ai/hard/verify/replay';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import type { AIAction } from '../../../src/ai/types';
import { Bound, newTTEntry } from '../../../src/ai/hard/search/tt';
import { scoreTurns } from '../../../src/ai/hard/search/order';
import { buildTables } from '../../../src/ai/hard/tables/context';
import { buildState } from './game-fixture';
import { candidates, prepare, rawCandidates } from './search-fixture';

// E0.5 timeout budget: slowest test 0.0 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

describe('newOrderTables', () => {
  it('has DESIGN §4.16\'s shapes', () => {
    const ord = newOrderTables(16);
    expect(ord.killers).toHaveLength(32); // 2 per ply
    expect(ord.counter).toHaveLength(1 << 14);
    expect(ord.histMove).toHaveLength(6 * 100);
    expect(ord.histBuy).toHaveLength(18 * 100);
  });

  it('rejects a non-positive ply count', () => {
    expect(() => newOrderTables(0)).toThrow(RangeError);
  });
});

function fakeTurn(sig: number, flags = 0): Turn {
  return {
    actions: Int32Array.from([1 /* MOVE, slot 0, square 0 */]),
    count: 1,
    endLo: 0,
    endHi: 0,
    sig,
    flags,
    gainCc: 0,
    place: -1,
    hangCc: 0,
  };
}

describe('onCutoff', () => {
  it('keeps two killers per ply, most recent first, without duplicates', () => {
    const ord = newOrderTables(4);
    onCutoff(ord, fakeTurn(0xaaaa), 2, 0, 3);
    onCutoff(ord, fakeTurn(0xbbbb), 2, 0, 3);
    expect([ord.killers[4], ord.killers[5]]).toEqual([0xbbbb, 0xaaaa]);
    // The same signature again must not push the other killer out.
    onCutoff(ord, fakeTurn(0xbbbb), 2, 0, 3);
    expect([ord.killers[4], ord.killers[5]]).toEqual([0xbbbb, 0xaaaa]);
  });

  it('records a counter-move keyed on the previous turn', () => {
    const ord = newOrderTables(4);
    onCutoff(ord, fakeTurn(0x1234), 1, 0x9999, 2);
    // The slot is private, but a second cutoff for a DIFFERENT previous move
    // must not overwrite the first one's slot.
    onCutoff(ord, fakeTurn(0x5678), 1, 0x1111, 2);
    expect(ord.counter.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)).toBe(2);
  });

  it('bumps history by depth squared and halves the table at the ceiling', () => {
    const ord = newOrderTables(4);
    const before = ord.histMove.reduce((a, b) => a + b, 0);
    onCutoff(ord, fakeTurn(1), 0, 0, 5);
    expect(ord.histMove.reduce((a, b) => a + b, 0)).toBe(before + 25);
    for (let i = 0; i < 200; i++) onCutoff(ord, fakeTurn(1), 0, 0, 12);
    expect(Math.max(...ord.histMove)).toBeLessThanOrEqual(HISTORY_CEILING + 144);
  });

  it('clearOrderTables drops everything', () => {
    const ord = newOrderTables(4);
    onCutoff(ord, fakeTurn(7), 0, 3, 4);
    clearOrderTables(ord);
    expect(ord.killers.every(v => v === 0)).toBe(true);
    expect(ord.counter.every(v => v === 0)).toBe(true);
    expect(ord.histMove.every(v => v === 0)).toBe(true);
    expect(ord.histBuy.every(v => v === 0)).toBe(true);
  });
});

/** Build the exact two full macros used by ordering tests through both engines. */
function legalTurn(state: ReturnType<typeof buildState>, actions: AIAction[]): Turn {
  const rep = new Replica(), p = rep.pack(state), keep = newKeepSetTable(), undo = newUndo();
  const turn = allocTurn();
  let canonical = state;
  for (const action of actions) {
    expect(canonical.phase).toBe('playing');
    expect(canonical.turn.currentPlayer).toBe(state.turn.currentPlayer);
    expect(isLegalAction(canonical, action)).toBe(true);
    const packed = fromAIAction(p, action, keep);
    expect(rep.isLegal(p, packed, keep)).toBe(true);
    turn.actions[turn.count++] = packed;
    rep.make(p, packed, undo, keep);
    canonical = applyAction(canonical, action);
  }
  expect(canonical.turn.currentPlayer).not.toBe(state.turn.currentPlayer);
  turn.endLo = p.kposLo; turn.endHi = p.kposHi; turn.flags = TurnFlag.QUIET;
  const initial = new Replica().pack(state);
  expect(verifyTurn(new Replica(), state, initial, turn, keep).verified).toBe(true);
  return turn;
}

describe('scoreTurns', () => {
  it('sorts descending and is deterministic across repeats', () => {
    const prepared = prepare(createInitialGameState(undefined, 4, 0, 'phasing'), 400_000);
    const first = candidates(prepared);
    expect(first.n).toBeGreaterThan(0);
    const order = [];
    for (let i = 0; i < first.n; i++) order.push(`${first.turns[i].endLo}:${first.turns[i].gainCc}`);
    for (let i = 1; i < first.n; i++) expect(first.turns[i - 1].gainCc).toBeGreaterThanOrEqual(first.turns[i].gainCc);

    const again = prepare(createInitialGameState(undefined, 4, 0, 'phasing'), 400_000);
    const second = candidates(again);
    expect(second.n).toBe(first.n);
    const order2 = [];
    for (let i = 0; i < second.n; i++) order2.push(`${second.turns[i].endLo}:${second.turns[i].gainCc}`);
    expect(order2).toEqual(order);
  });

  it('puts the TT turn first', () => {
    const prepared = prepare(createInitialGameState(undefined, 4, 0, 'phasing'), 400_000);
    const { ctx, p } = prepared;
    const raw = rawCandidates(prepared);
    expect(raw.n).toBeGreaterThan(2);
    // Pick a candidate the beam did NOT rank first and hand it to the ordering
    // as the TT move.
    const target = raw.turns[raw.n - 1];
    const targetEnd = target.endLo;
    const targetHi = target.endHi;
    const tt = newTTEntry();
    tt.bound = Bound.EXACT;
    tt.depth = 3;
    tt.bestEndLo = targetEnd;
    const t = buildTables(p, ctx.sc, 0, 2, ctx.tables[0]);
    scoreTurns(p, t, ctx.turns[0], raw.n, tt, ctx.ord, 0, 0, ctx);
    expect([ctx.turns[0][0].endLo, ctx.turns[0][0].endHi]).toEqual([targetEnd, targetHi]);
    expect(ctx.turns[0][0].gainCc).toBeGreaterThanOrEqual(ORDER_TT);
  });

  it('ranks avoiding an arriving opponent attacker above hanging the same unit', () => {
    const state = buildState({ current: 'white', phase: 'action', actions: 1,
      reserves: new Array(100).fill(0), units: [
        { id: 'water', def: 'water_1', owner: 'white', x: 4, y: 2 },
        { id: 'anchor', def: 'plant_1', owner: 'black', x: 3, y: 3 },
      ], pendingSummons: [{ id: 'arrival', def: 'metal_1', owner: 'black', x: 4, y: 3 }] });
    const end: AIAction[] = [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }];
    const hanging = legalTurn(state, end);
    const safe = legalTurn(state, [{ type: 'MOVE', unitId: 'water', to: { x: 4, y: 1 } }, ...end]);
    hanging.sig = 11; safe.sig = 12; // Equal other bonuses; SEE alone separates them.
    const { ctx, p } = prepare(state);
    const turns = [hanging, safe];
    scoreTurns(p, ctx.tables[0], turns, 2, null, ctx.ord, 0, 0, ctx);
    expect(hanging.hangCc).toBe(400);
    expect(safe.hangCc).toBe(0);
    expect(turns[0]).toBe(safe);
    expect(safe.gainCc - hanging.gainCc).toBe(400);
    const noArrival = { ...state, pendingSummons: [] };
    const control = legalTurn(noArrival, end); control.sig = 11;
    const fresh = prepare(noArrival);
    scoreTurns(fresh.p, fresh.ctx.tables[0], [control], 1, null, fresh.ctx.ord, 0, 0, fresh.ctx);
    expect(control.hangCc).toBe(0);
  });

  it.each([0x12345678, 0x92345678])('preserves killer and counter bonuses for signature %i', sig => {
    const state = buildState({ phase: 'place', actions: 0, reserves: new Array(100).fill(0), units: [
      { def: 'plant_1', owner: 'white', x: 0, y: 0 },
      { def: 'plant_1', owner: 'black', x: 9, y: 9 },
    ] });
    const base = legalTurn(state, [{ type: 'END_PLACE_PHASE' }]);
    for (const bonus of ['killer', 'counter'] as const) {
      const { ctx, p } = prepare(state);
      const target = copyTurnRecord(allocTurn(), base), other = copyTurnRecord(allocTurn(), base);
      target.sig = sig; other.sig = 0x76543210;
      if (bonus === 'killer') ctx.ord.killers[0] = sig;
      else {
        onCutoff(ctx.ord, target, 0, 42, 1);
        ctx.ord.killers.fill(0); ctx.ord.histMove.fill(0); ctx.ord.histBuy.fill(0);
      }
      const turns = [other, target];
      scoreTurns(p, ctx.tables[0], turns, 2, null, ctx.ord, 0, 42, ctx);
      expect(turns[0]).toBe(target);
      expect(target.gainCc - other.gainCc).toBe(bonus === 'killer' ? ORDER_KILLER : ORDER_COUNTER);
    }
  });

  it('the ordering bonuses are DESIGN §5.11.3\'s numbers', () => {
    expect([ORDER_TT, ORDER_KILLER, ORDER_COUNTER]).toEqual([2_000_000, 200_000, 150_000]);
    expect(TurnFlag.KILL).toBe(1);
  });
});
