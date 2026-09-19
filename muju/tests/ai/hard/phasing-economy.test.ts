// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState, PlayerId } from '../../../src/game/types';
import { applyAction } from '../../../src/ai/simulate';
import { getUnitDefinition } from '../../../src/game/units';
import { isValidSpawnPosition } from '../../../src/game/spawning';
import { canonicalPhasingEconomy } from '../../../lab/hard-ai/oracles/phasing-economy';
import { INACTIVITY_LIMIT, Replica, allocState, copyState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { GAMMA_Q16 } from '../../../src/ai/hard/core/income';
import { Reason, Result, type PackedState } from '../../../src/ai/hard/types';
import { newEconResult, type EconResult } from '../../../src/ai/hard/tables/economy';
import { phasingEconomy, PhasingEconomyProofCutoff } from '../../../src/ai/hard/tables/phasing-economy';
import * as forecastModule from '../../../src/ai/hard/tables/phasing-economy';
import { allocTables, buildTables, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8 } from '../../../src/ai/hard/tables/context';
import { buildState, type StateSpec } from './game-fixture';

const zero = () => Array<number>(100).fill(0);
const reserves = (entries: Record<number, number>) => Object.assign(zero(), entries);
const basic = [{ def: 'plant_2', owner: 'white' as const, x: 2, y: 2, id: 'live-w' },
  { def: 'plant_1', owner: 'black' as const, x: 7, y: 7, id: 'live-b' }];
function authored(spec: Partial<StateSpec> = {}): GameState {
  return buildState({ units: basic, victoryRule: 'elimination', inactivityRule: 'off', reserves: reserves({ 22: 16, 77: 16 }), ...spec });
}
/** Test-local mirror, no corpus import or historical suite dependence. */
function mirror(s: GameState): GameState {
  const swap = (p: PlayerId): PlayerId => p === 'white' ? 'black' : 'white';
  const transform = (p: { x: number; y: number }) => ({ x: 9 - p.x, y: 9 - p.y });
  return { ...s, winner: s.winner ? swap(s.winner) : null,
    turn: { ...s.turn, currentPlayer: swap(s.turn.currentPlayer) },
    players: { white: { ...s.players.black, id: 'white', startCorner: { x: 0, y: 0 } },
      black: { ...s.players.white, id: 'black', startCorner: { x: 9, y: 9 } } },
    reviewUpkeep: { white: s.reviewUpkeep?.black, black: s.reviewUpkeep?.white },
    board: { ...s.board,
      cells: [...s.board.cells].reverse().map(row => [...row].reverse().map(c => ({ ...c, position: transform(c.position) }))),
      initialResourceLayers: [...s.board.initialResourceLayers!].reverse(),
      units: s.board.units.map(u => ({ ...u, owner: swap(u.owner), position: transform(u.position) })) },
    pendingSummons: (s.pendingSummons ?? []).map(q => ({ ...q, owner: swap(q.owner), position: transform(q.position) })) };
}
function compare(s: GameState) {
  const rep = new Replica(), p = rep.pack(s, allocState()), before = structuredClone(p);
  const out: [EconResult, EconResult] = [newEconResult(), newEconResult()];
  const result = phasingEconomy(p, out, true), reference = canonicalPhasingEconomy(s);
  expect(p).toEqual(before); // caller state, identities, order and keys stay intact
  expect(result.steps).toBe(reference.steps);
  expect(result.stop).toBe(reference.stop);
  expect(result.finalBank).toEqual(reference.finalBank);
  expect(result.bills).toEqual(reference.bills);
  expect(result.arrivals).toEqual(reference.arrivals);
  expect(result.proverCalls).toBe(reference.proverCalls);
  expect(result.cappedProverCalls).toBe(0);
  const end = rep.pack(reference.state, allocState());
  expect([result.result, result.reason]).toEqual([end.result, end.reason]);
  for (const side of [0, 1] as const) {
    const e = out[side], c = reference.side[side];
    for (const key of ['livePVQ16', 'livePVcc', 'firstBillReached', 'requiredReserve', 'rentShortfall',
      'incomeClosures', 'waste', 'turnsToInsolvency'] as const) expect(e[key], key).toEqual(c[key]);
    for (const key of ['pendingServicePVQ16', 'pendingServicePVcc', 'pendingArrival', 'income', 'upkeep'] as const)
      expect(Array.from(e[key]), key).toEqual(c[key]);
    for (const window of ['pendingEnemyAct', 'pendingOwnAct'] as const) {
      const actual = e[window], expected = c[window];
      if (expected === null) expect(actual, window).toBeNull();
      else {
        expect(actual, window).not.toBeNull();
        expect(rep.digest(actual!), window).toBe(rep.digest(rep.pack(expected, allocState())));
      }
    }
    expect(Number.isSafeInteger(e.livePVQ16)).toBe(true);
    expect(result.bills.filter(b => b.side === side).every(b => b.cashAfterRent >= 0)).toBe(true);
  }
  return { out, result, reference };
}
afterEach(() => vi.restoreAllMocks());

const cases: [string, () => GameState][] = [
  ['Act income finances rent', () => authored()],
  ['already-mined unpaid Prepare', () => authored({ phase: 'place', upkeepPending: true })],
  ['settled Prepare has no repeated bill', () => authored({ phase: 'place' })],
  ['explicit affordable review', () => authored({ white: 8, reviewUpkeep: { white: true, black: true } })],
  ['zero-bank commitment in Act', () => authored({ pendingSummons: [{ def: 'plant_1', owner: 'white', x: 1, y: 2, id: 'pending-w' }], reserves: reserves({ 22: 16, 77: 16, 21: 16 }) })],
  ['zero-bank commitment in paid Prepare', () => authored({ phase: 'place', pendingSummons: [{ def: 'plant_1', owner: 'white', x: 1, y: 2, id: 'pending-w' }], reserves: reserves({ 22: 16, 77: 16, 21: 16 }) })],
  ['both owners paid commitments', () => authored({ pendingSummons: [
    { def: 'water_1', owner: 'white', x: 1, y: 2, id: 'pending-w' },
    { def: 'plant_1', owner: 'black', x: 8, y: 7, id: 'pending-b' }], reserves: reserves({ 22: 16, 77: 16, 21: 16, 78: 16 }) })],
  ['valid and invalid siblings', () => authored({ phase: 'place', pendingSummons: [
    { def: 'plant_1', owner: 'white', x: 1, y: 2, id: 'inside' },
    { def: 'plant_1', owner: 'white', x: 3, y: 2, id: 'outside' }] })],
  ['release destroys arrival anchor', () => authored({ reserves: zero(), units: [...basic,
    { def: 'plant_1', owner: 'white', x: 0, y: 1, id: 'free' }],
    pendingSummons: [{ def: 'plant_1', owner: 'white', x: 1, y: 2, id: 'orphaned' }] })],
  ['enemy release unblocks arrival', () => authored({ reserves: zero(), units: [
    { ...basic[0], def: 'plant_1' }, basic[1], { def: 'fire_2', owner: 'black', x: 1, y: 1, id: 'blocker' }],
    pendingSummons: [{ def: 'plant_1', owner: 'white', x: 1, y: 2, id: 'unblocked' }] })],
  ['immediate rent cannot spend later refund', () => authored({ phase: 'place', upkeepPending: true, reserves: zero(), units: [...basic,
    { def: 'plant_1', owner: 'white', x: 0, y: 1, id: 'free' }],
    pendingSummons: [{ def: 'plant_1', owner: 'white', x: 3, y: 2, id: 'invalid' }] })],
  ['incoming refund can fund first future bill', () => authored({ current: 'black', phase: 'place', reserves: zero(),
    pendingSummons: [{ def: 'plant_1', owner: 'white', x: 3, y: 2, id: 'invalid' }] })],
  ['finite depletion changes later payment', () => authored({ reserves: reserves({ 22: 1, 77: 1 }), units: [...basic,
    { def: 'plant_1', owner: 'white', x: 0, y: 1, id: 'free' }] })],
  ['default keep prefers catalogue cost', () => authored({ phase: 'place', upkeepPending: true, white: 2, reserves: zero(), units: [...basic,
    { def: 'fire_3', owner: 'white', x: 3, y: 3, id: 'expensive' }] })],
  ['equal-cost keep uses square not slot order', () => authored({ phase: 'place', upkeepPending: true, white: 1, reserves: zero(), units: [
    { def: 'water_2', owner: 'white', x: 4, y: 4, id: 'later' },
    { def: 'shadow_2', owner: 'white', x: 3, y: 3, id: 'earlier' }, basic[1]] })],
  ['inactivity stops before arrivals or income', () => authored({ phase: 'place', inactivityRule: 'on', inactivityPlies: INACTIVITY_LIMIT - 1,
    pendingSummons: [{ def: 'plant_1', owner: 'black', x: 8, y: 7, id: 'too-late' }] })],
  ['settled home mate stops at the first bill', () => authored({ victoryRule: 'home-or-elimination', white: 2, reserves: zero(), units: [
    { def: 'metal_3', owner: 'white', x: 9, y: 9, id: 'invader' },
    { def: 'plant_1', owner: 'black', x: 0, y: 9, id: 'defender' }] })],
  ['pass-only reply ends by occupation before incoming batch', () => authored({ victoryRule: 'home-or-elimination', white: 3, black: 3,
    phase: 'place', reserves: zero(), units: [
      { def: 'metal_2', owner: 'white', x: 9, y: 9, id: 'invader' },
      { def: 'fire_3', owner: 'black', x: 8, y: 9, id: 'defender' }],
    pendingSummons: [{ def: 'plant_1', owner: 'white', x: 0, y: 0, id: 'too-late' }] })],
];

describe('M6 chronological canonical economy reference (authored only)', () => {
  for (const [name, build] of cases) {
    it(`${name}: canonical exact receipts and Q16 attribution`, () => { compare(build()); });
    it(`${name}: mirrored canonical exact receipts and Q16 attribution`, () => { compare(mirror(build())); });
  }

  it('separates immediate Prepare debt from Act income and settled Prepare', () => {
    const act = compare(authored()).out[0];
    const unpaid = compare(authored({ phase: 'place', upkeepPending: true }));
    const paid = compare(authored({ phase: 'place' }));
    expect(act.requiredReserve).toBe(0); expect(act.rentShortfall).toBe(0);
    expect(unpaid.out[0].requiredReserve).toBe(1); expect(unpaid.out[0].rentShortfall).toBe(1);
    expect(unpaid.result.bills[0]).toMatchObject({ ordinal: 0, income: 0, paidRent: 0, releasedPrincipal: 9 });
    expect(paid.result.bills.filter(b => b.side === 0)[0]).toMatchObject({ ordinal: 1, income: 5, paidRent: 1 });
  });

  it('the same paid arrival starts service at ordinal 2 from Act, ordinal 1 from Prepare', () => {
    const common: Partial<StateSpec> = { pendingSummons: [{ def: 'plant_1', owner: 'white', x: 1, y: 2, id: 'q' }],
      reserves: reserves({ 22: 16, 77: 16, 21: 3 }) };
    const act = compare(authored(common)), paid = compare(authored({ ...common, phase: 'place' }));
    expect(act.out[0].pendingServicePVQ16[21]).toBe(3 * 100 * GAMMA_Q16[2]);
    expect(paid.out[0].pendingServicePVQ16[21]).toBe(3 * 100 * GAMMA_Q16[1]);
    expect(act.out[0].pendingArrival[21]).toBe(1);
    expect(act.result.bills[0].pendingIncome).toEqual([]);
    expect(act.result.bills.find(b => b.side === 0 && b.ordinal === 2)?.pendingIncome).toEqual([{ square: 21, amount: 3 }]);
  });

  it('anchor releases and blocker releases change actual future batch validity', () => {
    const lostRoot = cases.find(([name]) => name === 'release destroys arrival anchor')![1]();
    expect(isValidSpawnPosition({ x: 1, y: 2 }, 'white', lostRoot.board)).toBe(true);
    const lost = compare(lostRoot);
    expect(lost.out[0].pendingArrival[21]).toBe(2);
    expect(lost.out[0].pendingServicePVQ16[21]).toBe(0);
    expect(lost.result.bills[0].releasedIds).toContain('live-w');
    const openedRoot = cases.find(([name]) => name === 'enemy release unblocks arrival')![1]();
    expect(isValidSpawnPosition({ x: 1, y: 2 }, 'white', openedRoot.board)).toBe(false);
    expect(compare(openedRoot).out[0].pendingArrival[21]).toBe(1);
  });

  it('a future refund finances only a bill actually reached after its boundary', () => {
    const immediate = compare(cases.find(([name]) => name === 'immediate rent cannot spend later refund')![1]());
    expect(immediate.out[0].rentShortfall).toBe(1);
    expect(immediate.result.bills[0].releasedIds).toContain('live-w');
    const future = compare(cases.find(([name]) => name === 'incoming refund can fund first future bill')![1]());
    expect(future.out[0].requiredReserve).toBe(1); expect(future.out[0].rentShortfall).toBe(0);
    expect(future.result.bills[0]).toMatchObject({ side: 0, cashBeforeIncome: 5, paidRent: 1, releasedPrincipal: 0 });
  });

  it('a legal promotion after paid rent changes only the next bill', () => {
    const root = authored({ phase: 'place', white: 4, units: [{ ...basic[0], def: 'plant_1' }, basic[1]] });
    const promoted = applyAction(root, { type: 'PROMOTE_UNIT', unitId: 'live-w' });
    expect(promoted).not.toBe(root);
    expect(promoted.upkeepPending).toBe(false);
    expect(promoted.players.white.resources).toBe(0);
    const result = compare(promoted);
    expect(result.result.bills.filter(b => b.side === 0)[0]).toMatchObject({ ordinal: 1, income: 5, paidRent: 1 });
    expect(result.result.bills.some(b => b.ordinal === 0)).toBe(false);
  });

  it('zero-rent legal BUY transfers principal without immediate live service', () => {
    const root = authored({ phase: 'place', white: 5, units: [{ ...basic[0], def: 'plant_1' }, basic[1]],
      reserves: reserves({ 22: 16, 77: 16, 21: 3 }) });
    const bought = applyAction(root, { type: 'BUY_UNIT', definitionId: 'plant_1', position: { x: 1, y: 2 } });
    expect(bought).not.toBe(root);
    expect(bought.board.units).toHaveLength(root.board.units.length);
    expect(bought.players.white.resources + bought.pendingSummons!.reduce((n, q) => n + q.cost, 0)).toBe(root.players.white.resources);
    const before = compare(root), after = compare(bought);
    expect(after.out[0].livePVQ16).toBe(before.out[0].livePVQ16);
    expect(after.out[0].pendingServicePVQ16[21]).toBe(3 * 100 * GAMMA_Q16[1]);
    expect(after.result.arrivals[0]).toMatchObject({ cost: 5, arrived: true, cashBefore: 0, cashAfter: 0 });
  });

  it('a refund is a cash transfer, never an income or service event', () => {
    const root = authored({ phase: 'place', reserves: zero(), units: [{ ...basic[0], def: 'plant_1' }, basic[1]],
      pendingSummons: [{ def: 'plant_1', owner: 'white', x: 3, y: 2, id: 'refund-only' }] });
    const result = compare(root);
    expect(result.out[0].pendingArrival[23]).toBe(2);
    expect(result.out[0].pendingServicePVQ16[23]).toBe(0);
    expect(result.out[0].livePVQ16).toBe(0);
    expect(result.result.finalBank[0]).toBe(5);
    expect(result.result.arrivals).toEqual([{ side: 0, square: 23, cost: 5, arrived: false, cashBefore: 0, cashAfter: 5 }]);
    expect(result.result.bills.every(b => b.income === 0 && b.paidRent === 0)).toBe(true);
  });

  it('stops before any income/arrival after an actual terminal boundary', () => {
    const draw = compare(cases.find(([name]) => name === 'inactivity stops before arrivals or income')![1]());
    expect(draw.result).toMatchObject({ steps: 1, result: Result.DRAW, reason: Reason.INACTIVITY, bills: [], arrivals: [] });
    expect(draw.out[1].firstBillReached).toBe(false);
    expect(draw.out[1].pendingArrival[78]).toBe(0);
    const mate = compare(cases.find(([name]) => name === 'settled home mate stops at the first bill')![1]());
    expect(mate.result).toMatchObject({ steps: 1, reason: Reason.HOME_CHECKMATE, proverCalls: 1 });
    expect(mate.out[1].incomeClosures).toBe(0);
  });

  it('charges each released principal once without 32-bit overflow', () => {
    const units = Array.from({ length: 50 }, (_, n) => ({ def: 'plant_3', owner: 'white' as const, x: n % 10, y: Math.floor(n / 10), id: `cost-${n}` }));
    const root = authored({ phase: 'place', upkeepPending: true, reserves: zero(), units: [...units, basic[1]] });
    const result = compare(root), principal = 50 * getUnitDefinition('plant_3').cost;
    expect(result.result.bills).toHaveLength(1);
    expect(result.result.bills[0].releasedIds).toHaveLength(50);
    expect(result.out[0].livePVQ16).toBe(-principal * 100 * 65536);
    expect(Math.abs(result.out[0].livePVQ16)).toBeGreaterThan(2 ** 31);
    expect(result.out[0].livePVcc).toBe(-principal * 100);
  });

  it('owns reusable chronological windows, preserving current AP and excluding an enemy Prepare window', () => {
    const root = authored({ current: 'black', actions: 1, pendingSummons: [
      { def: 'plant_1', owner: 'white', x: 1, y: 2, id: 'q' }] });
    const current = compare(root);
    expect(current.out[0].pendingEnemyAct?.side).toBe(1);
    expect(current.out[0].pendingEnemyAct?.actions).toBe(1);
    expect(current.out[0].pendingOwnAct?.side).toBe(0);
    expect(current.out[0].pendingOwnAct?.actions).toBe(4);
    expect(current.out[0].pendingOwnAct?.pendCount[0]).toBe(0);
    const none = compare({ ...root, turn: { ...root.turn, phase: 'place', actionsRemaining: 0 } });
    expect(none.out[0].pendingEnemyAct).toBeNull();
    expect(none.out[0].pendingOwnAct).not.toBeNull();
    const rep = new Replica(), p = rep.pack(root, allocState()), out: [EconResult, EconResult] = [newEconResult(), newEconResult()];
    phasingEconomy(p, out);
    const enemy = out[0].pendingEnemyAct, own = out[0].pendingOwnAct;
    phasingEconomy(p, out);
    expect(out[0].pendingEnemyAct).toBe(enemy); expect(out[0].pendingOwnAct).toBe(own);
    phasingEconomy(rep.pack(authored(), allocState()), out);
    expect(out.every(e => e.pendingEnemyAct === null && e.pendingOwnAct === null)).toBe(true);
  });

  const cacheRoot = () => authored({ current: 'black', actions: 1, reserves: zero(),
    units: [{ ...basic[0], def: 'plant_1' }, basic[1]], pendingSummons: [
      { def: 'plant_1', owner: 'white', x: 1, y: 2, id: 'first-paid' },
      { def: 'plant_1', owner: 'white', x: 2, y: 1, id: 'second-paid' }] });
  const identitiesOf = (p: PackedState) => ({ ord: Array.from(p.ord), originIds: [...p.originIds],
    ordNext: p.ordNext, pendOrd: Array.from(p.pendOrd), pendIds: [...p.pendIds], pendOrdNext: p.pendOrdNext });
  const identityChanges: [string, (p: PackedState) => void][] = [
    ['live order', p => { [p.ord[0], p.ord[1]] = [p.ord[1], p.ord[0]]; }],
    ['live IDs', p => { p.originIds[1] = 'different-enemy'; }],
    ['next birth counter', p => { p.ordNext += 7; }],
    ['pending order', p => { [p.pendOrd[21], p.pendOrd[12]] = [p.pendOrd[12], p.pendOrd[21]]; }],
    ['pending IDs', p => { p.pendIds[21] = 'different-paid'; }],
    ['next commitment counter', p => { p.pendOrdNext += 7; }],
  ];
  it.each(identityChanges)('rebuilds equal-key, equal-slot windows after changing %s', (_name, mutate) => {
    const rep = new Replica(), p = rep.pack(cacheRoot(), allocState()), changed = allocState();
    copyState(changed, p); mutate(changed); rep.rehash(changed);
    expect([changed.kposLo, changed.kposHi, changed.kturnLo, changed.kturnHi])
      .toEqual([p.kposLo, p.kposHi, p.kturnLo, p.kturnHi]);
    expect(changed.sq).toEqual(p.sq);
    expect(identitiesOf(changed)).not.toEqual(identitiesOf(p));
    const sc = new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2), t = allocTables();
    const forecast = vi.spyOn(forecastModule, 'phasingEconomy');
    buildTables(p, sc, 0, 2, t);
    expect(identitiesOf(t.econ[0].pendingEnemyAct!)).toEqual(identitiesOf(p));
    const storage = t.econ[0].pendingEnemyAct;
    buildTables(changed, sc, 0, 2, t);
    expect(forecast).toHaveBeenCalledTimes(2);
    expect(t.econ[0].pendingEnemyAct).toBe(storage); // same owned buffer, refreshed contents
    expect(identitiesOf(t.econ[0].pendingEnemyAct!)).toEqual(identitiesOf(changed));
    const own = t.econ[0].pendingOwnAct!;
    for (const square of [21, 12]) {
      expect(own.originIds[own.pieceAt[square]]).toBe(changed.pendIds[square]);
      const rank = changed.pendOrd[square] < changed.pendOrd[square === 21 ? 12 : 21] ? 0 : 1;
      expect(own.ord[own.pieceAt[square]]).toBe(changed.ordNext + rank);
    }
    const calls = t.economyProverCalls;
    buildTables(changed, sc, 0, 2, t);
    expect(forecast).toHaveBeenCalledTimes(2); // exact-identity cache hit does no forecast work
    expect(t.economyProverCalls).toBe(calls);
  });

  it('an identity-changing forecast veto leaves only L1 cached and retries L2', () => {
    const rep = new Replica(), p = rep.pack(cacheRoot(), allocState()), changed = allocState();
    copyState(changed, p); changed.originIds[1] = 'replacement-enemy';
    const sc = new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2), t = allocTables();
    buildTables(p, sc, 0, 2, t);
    const beforeCalls = t.economyProverCalls, beforeCapped = t.economyCappedProverCalls;
    const original = Replica.prototype.make;
    const fault = vi.spyOn(Replica.prototype, 'make').mockImplementation(function (this: Replica, ...args) {
      original.apply(this, args); this.fullProverCalls++; this.cappedProverCalls++;
    });
    expect(() => buildTables(changed, sc, 0, 2, t)).toThrow(PhasingEconomyProofCutoff);
    expect(t.level).toBe(1);
    expect(t.economyProverCalls).toBe(beforeCalls + 1);
    expect(t.economyCappedProverCalls).toBe(beforeCapped + 1);
    fault.mockRestore();
    const forecast = vi.spyOn(forecastModule, 'phasingEconomy');
    buildTables(changed, sc, 0, 1, t);
    expect(forecast).not.toHaveBeenCalled();
    buildTables(changed, sc, 0, 2, t);
    expect(forecast).toHaveBeenCalledTimes(1);
    expect(t.level).toBe(2);
    expect(identitiesOf(t.econ[0].pendingEnemyAct!)).toEqual(identitiesOf(changed));
    buildTables(changed, sc, 0, 2, t);
    expect(forecast).toHaveBeenCalledTimes(1);
  });

  it('vetoes a forecast proof cutoff and unwinds its private arrival/ID state', () => {
    const root = authored({ phase: 'place', pendingSummons: [{ def: 'plant_1', owner: 'black', x: 8, y: 7, id: 'arrive-before-veto' }] });
    const p = new Replica().pack(root, allocState()), out: [EconResult, EconResult] = [newEconResult(), newEconResult()];
    const original = Replica.prototype.make;
    const fault = vi.spyOn(Replica.prototype, 'make').mockImplementation(function (this: Replica, ...args) {
      original.apply(this, args); this.fullProverCalls++; this.cappedProverCalls++;
    });
    expect(() => phasingEconomy(p, out)).toThrow(PhasingEconomyProofCutoff);
    expect(out[0].forecastProverCalls).toBe(1); expect(out[0].cappedProverCalls).toBe(1);
    fault.mockRestore();
    compare(root); compare(root); // prior failure cannot poison the reused private stack
  });
});
