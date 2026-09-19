// @vitest-environment node
/** Authored canonical controls; no corpus, search, tuning or score floors. */
import { describe, expect, it } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { getUnitDefinition } from '../../../src/game/units';
import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { AKind, paA, paB, paKind } from '../../../src/ai/hard/core/action';
import { DEF_ID } from '../../../src/ai/hard/core/catalog';
import { DESKTOP } from '../../../src/ai/hard/config';
import { INVARIANT_COUNT, invariantBits, leadCc } from '../../../src/ai/hard/eval/invariants';
import { newPlacePlan, planPurchases } from '../../../src/ai/hard/gen/purchase';
import { allocTables, buildTables, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8 } from '../../../src/ai/hard/tables/context';
import { canonicalPhasingEconomy } from '../../../lab/hard-ai/oracles/phasing-economy';
import { buildState, type StateSpec } from './game-fixture';

const zero = () => Array<number>(100).fill(0);
function authored(spec: Partial<StateSpec> = {}): GameState {
  return buildState({ units: [
    { def: 'plant_2', owner: 'white', x: 2, y: 2, id: 'w' },
    { def: 'fire_1', owner: 'white', x: 1, y: 1, id: 'w-free' },
    { def: 'plant_1', owner: 'black', x: 7, y: 7, id: 'b' },
  ], reserves: Object.assign(zero(), { 22: 16 }), victoryRule: 'elimination', inactivityRule: 'off', ...spec });
}
function mirror(input: GameState): GameState {
  const s = structuredClone(input), swap = (p: PlayerId): PlayerId => p === 'white' ? 'black' : 'white';
  const flip = (p: { x: number; y: number }) => ({ x: 9 - p.x, y: 9 - p.y });
  s.turn.currentPlayer = swap(s.turn.currentPlayer);
  s.players = { white: { ...s.players.black, id: 'white', startCorner: { x: 0, y: 0 } }, black: { ...s.players.white, id: 'black', startCorner: { x: 9, y: 9 } } };
  s.board.cells = s.board.cells.reverse().map(row => row.reverse().map(c => ({ ...c, position: flip(c.position) })));
  s.board.initialResourceLayers = s.board.initialResourceLayers ? [...s.board.initialResourceLayers].reverse() : undefined;
  s.board.units = s.board.units.map(u => ({ ...u, owner: swap(u.owner), position: flip(u.position) }));
  s.pendingSummons = s.pendingSummons?.map(q => ({ ...q, owner: swap(q.owner), position: flip(q.position) }));
  s.reviewUpkeep = { white: s.reviewUpkeep?.black, black: s.reviewUpkeep?.white };
  return s;
}
function inspect(s: GameState, side: 0 | 1) {
  const p = new Replica().pack(s, allocState()), sc = new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2), t = allocTables();
  p.proverMode = 2; buildTables(p, sc, 0, 2, t);
  const bits = invariantBits(p, t, side, sc, 0);
  expect(bits >>> INVARIANT_COUNT).toBe(0);
  const reference = canonicalPhasingEconomy(s).side[side];
  expect(t.econ[side].firstBillReached).toBe(reference.firstBillReached);
  expect(t.econ[side].requiredReserve).toBe(reference.requiredReserve);
  expect(t.econ[side].rentShortfall).toBe(reference.rentShortfall);
  return { p, t, sc, has: (i: number) => (bits & (1 << (i - 1))) !== 0 };
}
function step(s: GameState, action: AIAction): GameState {
  expect(isLegalAction(s, action)).toBe(true); return applyAction(s, action);
}

for (const side of [0, 1] as const) {
  const frame = (s: GameState) => side === 0 ? s : mirror(s);
  describe(`Phasing invariants, side ${side}`, () => {
    it('distinguishes Act income, unpaid Prepare, and settled Prepare at equal cash', () => {
      const act = inspect(frame(authored()), side);
      const unpaid = inspect(frame(authored({ phase: 'place', upkeepPending: true })), side);
      const paid = inspect(frame(authored({ phase: 'place' })), side);
      expect(act.t.econ[side].requiredReserve).toBe(0); expect(act.has(14)).toBe(false);
      expect(unpaid.t.econ[side].requiredReserve).toBe(1); expect(unpaid.has(14)).toBe(true);
      expect(paid.t.econ[side].requiredReserve).toBe(0); expect(paid.has(14)).toBe(false);
    });
    it('marks promotion only when its next reached bill has a shortfall', () => {
      for (const income of [0, 1]) {
        const s = frame(authored({ phase: 'place', white: 4, reserves: Object.assign(zero(), { 22: income }), units: [
          { def: 'fire_1', owner: 'white', x: 2, y: 2, id: 'promote' },
          { def: 'fire_1', owner: 'white', x: 1, y: 1, id: 'free' },
          { def: 'plant_1', owner: 'black', x: 7, y: 7, id: 'b' },
        ] }));
        const promoted = step(s, { type: 'PROMOTE_UNIT', unitId: 'promote' });
        expect(promoted.upkeepPending).toBe(false);
        const result = inspect(promoted, side);
        expect(result.t.econ[side].requiredReserve).toBe(1 - income);
        expect(result.has(7)).toBe(income === 0);
      }
    });
    it('honors an incoming refund before the bill and does not price an unreached bill', () => {
      const refund = inspect(frame(authored({ current: 'black', phase: 'place', reserves: zero(), pendingSummons: [
        { def: 'plant_1', owner: 'white', x: 3, y: 2 },
      ] })), side);
      expect(refund.t.econ[side].requiredReserve).toBe(1); expect(refund.t.econ[side].rentShortfall).toBe(0); expect(refund.has(14)).toBe(false);
      const terminal = inspect(frame(authored({ current: 'black', phase: 'place', reserves: zero(), inactivityRule: 'on', inactivityPlies: 9 })), side);
      expect(terminal.t.econ[side].firstBillReached).toBe(false); expect(terminal.has(7)).toBe(false); expect(terminal.has(14)).toBe(false);
    });
    it('preserves 5/17 as structural zero for pending commitments and old placed flags', () => {
      const s = authored({ phase: 'place', reserves: zero(), pendingSummons: [{ def: 'plant_1', owner: 'white', x: 1, y: 2 }] });
      s.board.units[0].placedThisTurn = true;
      const result = inspect(frame(s), side);
      expect(INVARIANT_COUNT).toBe(20);
      for (const i of [5, 15, 17, 18]) expect(result.has(i)).toBe(false);
    });
    it('detects paid-arrival exposure at zero enemy cash, not affordable uncommitted buys', () => {
      const units: StateSpec['units'] = [
        { def: 'fire_1', owner: 'white', x: 6, y: 7, id: 'victim' },
        { def: 'plant_1', owner: 'black', x: 7, y: 7, id: 'anchor' },
      ];
      expect(getUnitDefinition('fire_1').defense).toBe(1); expect(getUnitDefinition('fire_1').mining).toBeGreaterThan(0);
      const pending: StateSpec['pendingSummons'] = [{ def: 'fire_1', owner: 'black', x: 7, y: 8, id: 'arrival' }];
      const paidRoot = frame(authored({ units, reserves: zero(), pendingSummons: pending })), paid = inspect(paidRoot, side);
      expect(paid.p.bank[1 - side]).toBe(0); expect(paid.has(19)).toBe(true);
      let witness = step(step(paidRoot, { type: 'END_ACTION_PHASE' }), { type: 'END_PLACE_PHASE' });
      expect(witness.board.units.some(u => u.id === 'arrival')).toBe(true);
      witness = step(witness, { type: 'MOVE', unitId: 'arrival', to: side === 0 ? { x: 6, y: 8 } : { x: 3, y: 1 } });
      witness = step(witness, { type: 'ATTACK', unitId: 'arrival', targetPosition: side === 0 ? { x: 6, y: 7 } : { x: 3, y: 2 } });
      expect(witness.board.units.some(u => u.id === 'victim')).toBe(false);
      const uncommitted = inspect(frame(authored({ units, reserves: zero(), black: 30 })), side);
      expect(uncommitted.has(19)).toBe(false);
      const blocked = inspect(frame(authored({ units: [...units, { def: 'fire_1', owner: 'white', x: 8, y: 8 }], reserves: zero(), pendingSummons: pending })), side);
      expect(blocked.has(19)).toBe(false);
    });
    it('conserves lead principal through a legal BUY and later arrival or refund', () => {
      const s = frame(authored({ phase: 'place', white: 5, reserves: zero(), units: [
        { def: 'fire_1', owner: 'white', x: 2, y: 2, id: 'w' },
        { def: 'plant_1', owner: 'black', x: 7, y: 7, id: 'b' },
      ] }));
      const principal = (state: GameState) => leadCc(new Replica().pack(state, allocState()), side);
      const initial = principal(s), position = side === 0 ? { x: 1, y: 2 } : { x: 8, y: 7 };
      let bought = step(s, { type: 'BUY_UNIT', definitionId: 'plant_1', position });
      expect(principal(bought)).toBe(initial); expect(bought.board.units).toHaveLength(2);
      for (const action of [{ type: 'END_PLACE_PHASE' }, { type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }] as AIAction[]) bought = step(bought, action);
      expect(bought.pendingSummons).toHaveLength(0); expect(bought.board.units).toHaveLength(3); expect(principal(bought)).toBe(initial);
      const disrupted = frame(authored({ current: 'black', phase: 'place', reserves: zero(), units: [
        { def: 'fire_1', owner: 'white', x: 2, y: 2 }, { def: 'water_1', owner: 'black', x: 1, y: 1 },
      ], pendingSummons: [{ def: 'plant_1', owner: 'white', x: 1, y: 2 }] }));
      const beforeRefund = principal(disrupted), refunded = step(disrupted, { type: 'END_PLACE_PHASE' });
      expect(refunded.pendingSummons).toHaveLength(0); expect(refunded.board.units).toHaveLength(2); expect(principal(refunded)).toBe(beforeRefund);
    });
    it('uses next-bill reserve for ordering while keeping affordable below-reserve plans legal', () => {
      for (const def of ['fire_1', 'fire_2']) {
        const s = frame(authored({ phase: 'place', white: 3, reserves: zero(), units: [
          { def, owner: 'white', x: 2, y: 2 }, { def: 'fire_1', owner: 'white', x: 1, y: 1 },
          { def: 'plant_1', owner: 'black', x: 7, y: 7 },
        ] }));
        const { p, t, sc } = inspect(s, side), out = Array.from({ length: 16 }, newPlacePlan);
        const cfg = { ...DESKTOP.gen.purchase, maxBodies: 1, maxPlans: 16, weights: { mineCc: 0, safeCc: 0, blockCc: 0, strikeCc: 0, anchorCc: 0, zeroSpawnCc: 0, liquidityCc: 17, homeRaceCc: 0 } };
        const count = planPurchases(p, t, cfg, sc, 0, out), purchases = out.slice(0, count).filter(plan => plan.count > 0);
        expect(purchases.length).toBeGreaterThan(0); expect(t.econ[side].requiredReserve).toBe(def === 'fire_2' ? 1 : 0);
        for (const plan of purchases) {
          expect(plan.spend).toBe(3); expect(plan.scoreCc).toBe(def === 'fire_2' ? -17 : 0);
          const a = plan.actions[0]; expect(paKind(a)).toBe(AKind.BUY);
          expect(isLegalAction(s, { type: 'BUY_UNIT', definitionId: DEF_ID[paA(a)], position: { x: paB(a) % 10, y: Math.floor(paB(a) / 10) } })).toBe(true);
        }
      }
    });
  });
}
