// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildState, type StateSpec } from './game-fixture';
import { INACTIVITY_LIMIT, Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Scratch, bbHas, bbNew } from '../../../src/ai/hard/core/bits';
import { AKind, newKeepSetTable, paKind, paMake } from '../../../src/ai/hard/core/action';
import { allocTables, buildTables } from '../../../src/ai/hard/tables/context';
import { TurnGenerator, newGenStats, outCapacityFor } from '../../../src/ai/hard/gen/generate';
import { TurnFlag, TACTICAL_FLAGS, TurnPool, keepForTurn, type Turn } from '../../../src/ai/hard/gen/turn';
import { UNLIMITED_WORK } from '../../../src/ai/hard/gen/actionsearch';
import { genKeepSets } from '../../../src/ai/hard/gen/upkeep';
import { DESKTOP, type HardConfig } from '../../../src/ai/hard/config';
import { INF, allocTurn, copyTurn, generateAt, iterativeDeepening, macroTtEligible, makeTurn, pvs, unmakeTurn } from '../../../src/ai/hard/search/pvs';
import { verifyTurn } from '../../../src/ai/hard/verify/replay';
import { prepare } from './search-fixture';
import { terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { quiesce } from '../../../src/ai/hard/search/quiesce';
import { Bound } from '../../../src/ai/hard/search/tt';
import { validPendingMask } from '../../../src/ai/hard/core/spawn';
import type { PackedState, Side } from '../../../src/ai/hard/types';

const base = (extra: Partial<StateSpec> = {}) => buildState({
  units: [{ id: 'w', def: 'plant_1', owner: 'white', x: 2, y: 2 },
    { id: 'b', def: 'plant_1', owner: 'black', x: 8, y: 8 }],
  white: 3, black: 0, actions: 1, ...extra,
});

function generated(state: ReturnType<typeof base>) {
  const rep = new Replica(), p = rep.pack(state, allocState());
  p.proverMode = 2;
  const sc = new Scratch(4, 8, 4, 4), t = allocTables(), keep = newKeepSetTable();
  buildTables(p, sc, 0, 2, t);
  const cfg = { ...DESKTOP.gen, K: 8, maxPlacePlans: 3,
    action: { ...DESKTOP.gen.action, widths: Int32Array.of(3, 2, 1, 1), keep: 4 },
    purchase: { ...DESKTOP.gen.purchase, maxPlans: 3, maxBodies: 1, squares: 2 } };
  const pool = new TurnPool(4096), out: Turn[] = new Array(outCapacityFor(cfg)), stats = newGenStats();
  const gen = new TurnGenerator(rep, cfg, pool, sc);
  const side = p.side;
  const n = gen.generate(p, t, q => q.materialCc[side] - q.materialCc[1 - side] + q.bank[side],
    UNLIMITED_WORK, 0, keep, out, stats);
  return { rep, p, keep, turns: out.slice(0, n), pool, gen, stats };
}

describe('Phasing macro boundary and upkeep ownership', () => {
  for (const [name, extra] of [
    ['partial Act', { actions: 1 }], ['full Act', { actions: 4 }],
    ['Prepare', { phase: 'place', actions: 0 }],
    ['upkeep root', { phase: 'place', actions: 0, upkeepPending: true }],
    ['review after Act', { reviewUpkeep: { white: true, black: false } }],
  ] as const) {
    it(`replays every ${name} candidate through exactly the first handoff`, () => {
      const state = base(extra), { rep, p, keep, turns } = generated(state);
      const before = rep.digest(p);
      expect(turns.length).toBeGreaterThan(0);
      for (const turn of turns) {
        const decoded = verifyTurn(rep, state, p, turn, keep);
        expect(decoded.verified, decoded.reason).toBe(true);
        expect(turn.count).toBeLessThanOrEqual(24);
        if (decoded.endState.phase !== 'victory') {
          expect(decoded.endState.turn.currentPlayer).toBe('black');
          expect(decoded.endState.turn.phase).toBe('action');
          expect(decoded.endState.turn.actionsRemaining).toBe(4);
          expect(paKind(turn.actions[turn.count - 1])).toBe(AKind.END_PLACE);
        }
        if (turn.actions.subarray(0, turn.count).some(a => paKind(a) === AKind.PAY_UPKEEP)) {
          expect(turn.keepMask?.length).toBe(4);
        }
      }
      expect(rep.digest(p)).toBe(before);
      rep.check(p);
    });
  }

  it('rejects a same-side END_ACTION prefix even with the correct end key', () => {
    const state = base(), rep = new Replica(), p = rep.pack(state, allocState());
    const turn = allocTurn(), undo = newUndo();
    turn.actions[0] = paMake(AKind.END_ACTION); turn.count = 1;
    rep.make(p, turn.actions[0], undo); turn.endLo = p.kposLo; turn.endHi = p.kposHi;
    rep.unmake(p, undo);
    expect(verifyTurn(rep, state, p, turn, newKeepSetTable())).toMatchObject({ verified: false });
    const s = prepare(state);
    expect(makeTurn(s.ctx, s.p, turn, newKeepSetTable())).toBe(0);
    expect(s.ctx.rep.digest(s.p)).toBe(rep.digest(p));
  });

  it('owns post-Act choices independently of the next keep table and pool reuse', () => {
    const state = base({ reviewUpkeep: { white: true, black: false } });
    const { rep, p, keep, turns, pool } = generated(state);
    const turn = turns.find(t => t.keepMask !== undefined)!;
    expect(turn).toBeDefined();
    const saved = copyTurn(allocTurn(), turn), mask = [...saved.keepMask!];
    turn.keepMask!.fill(0); keep.masks.fill(0); keep.count = 0; pool.reset(); pool.alloc();
    expect([...saved.keepMask!]).toEqual(mask);
    expect(verifyTurn(rep, state, p, saved, keep).verified).toBe(true);
    const s = prepare(state), before = s.ctx.rep.digest(s.p);
    const n = makeTurn(s.ctx, s.p, saved, keep);
    expect(n).toBe(saved.count); expect(s.p.side).toBe(1);
    unmakeTurn(s.ctx, s.p, n); expect(s.ctx.rep.digest(s.p)).toBe(before);
  });

  it('rejects a missing upkeep choice and a malformed owned mask', () => {
    const t = allocTurn(); t.actions[0] = paMake(AKind.PAY_UPKEEP); t.count = 1;
    expect(() => keepForTurn(t, newKeepSetTable())).toThrow('Missing');
    t.keepMask = new Uint32Array(3);
    expect(() => keepForTurn(t, newKeepSetTable())).toThrow('Invalid');
  });

  it('does not continue into the opponent after a valid complete turn', () => {
    const state = base(), { rep, p, keep, turns } = generated(state);
    const turn = copyTurn(allocTurn(), turns[0]);
    turn.actions[turn.count++] = paMake(AKind.END_ACTION);
    expect(verifyTurn(rep, state, p, turn, keep).verified).toBe(false);
  });

  it('keeps partial roots outside the numerical macro TT domain', () => {
    const rep = new Replica();
    expect(macroTtEligible(rep.pack(base({ actions: 4 }), allocState()))).toBe(true);
    for (const state of [base(), base({ phase: 'place', actions: 0 }),
      base({ phase: 'place', actions: 0, upkeepPending: true }), base({ actions: 4, progressThisTurn: true })]) {
      expect(macroTtEligible(rep.pack(state, allocState()))).toBe(false);
    }
  });

  it('has representation-independent ranked keep prefixes below the 64-set cap', () => {
    const units: StateSpec['units'] = [
      { id: 'a', def: 'fire_2', owner: 'white', x: 3, y: 3 },
      { id: 'c', def: 'fire_2', owner: 'white', x: 4, y: 3 },
      { id: 'd', def: 'fire_2', owner: 'white', x: 3, y: 4 },
      { id: 'b', def: 'plant_1', owner: 'black', x: 9, y: 9 },
    ];
    const prefix = (army: StateSpec['units']) => {
      const rep = new Replica(), p = rep.pack(base({ units: army, phase: 'place', actions: 0, white: 2, upkeepPending: true }), allocState());
      const k = newKeepSetTable();
      const n = genKeepSets(p, allocTables(), k);
      expect(n).toBe(7);
      return Array.from({ length: 4 }, (_, i) => Array.from({ length: 128 }, (_, slot) => slot)
        .filter(slot => (k.masks[i * 4 + (slot >>> 5)] & (1 << (slot & 31))) !== 0)
        .map(slot => p.sq[slot]).sort((a, b) => a - b));
    };
    expect(prefix(units)).toEqual(prefix([...units].reverse()));
  });

  it('preserves a surviving corner occupier as the first affordable keep choice', () => {
    const state = base({ phase: 'place', actions: 0, white: 1, upkeepPending: true,
      units: [{ id: 'inv', def: 'fire_2', owner: 'white', x: 9, y: 9 },
        { id: 'other', def: 'fire_2', owner: 'white', x: 0, y: 1 },
        { id: 'b', def: 'plant_1', owner: 'black', x: 8, y: 8 }] });
    const rep = new Replica(), p = rep.pack(state, allocState()), keep = newKeepSetTable();
    expect(genKeepSets(p, allocTables(), keep)).toBe(3);
    expect(keep.masks[0] & 1).toBe(1);
  });

  it('preserves terminal-before-handoff semantics and keeps disruption non-tactical', () => {
    // One ply short of the LIMIT, so the END_PLACE under test is the hand-off
    // that draws. A literal 9 stopped being that the moment A4 moved the limit.
    const state = base({ phase: 'place', actions: 0, inactivityPlies: INACTIVITY_LIMIT - 1 });
    const { rep, p, keep, turns } = generated(state);
    const quiet = turns.find(t => t.count === 1 && paKind(t.actions[0]) === AKind.END_PLACE)!;
    const check = verifyTurn(rep, state, p, quiet, keep);
    expect(check.verified).toBe(true);
    expect(check.endState.phase).toBe('victory');
    expect(TurnFlag.DISRUPT & TACTICAL_FLAGS).toBe(0);
    expect(TurnFlag.HOME_FORTIFY & TACTICAL_FLAGS).toBe(TurnFlag.HOME_FORTIFY);
  });
});

// Storage policy is exercised directly with synthetic end keys: canonical
// legality and full replay are independently covered above. This seam lets the
// test force a late arrival after the beam has consumed the exact capacity.
describe('bounded forced candidate storage', () => {
  function storage() {
    const { gen } = generated(base({ phase: 'place', actions: 0, white: 0 }));
    const record = (key: number, flags: number, gainCc: number) => {
      const t = allocTurn(); t.endLo = key; t.endHi = key ^ 0x1357;
      t.flags = flags; t.gainCc = gainCc; return t;
    };
    const forced = record(0x11111111, TurnFlag.FORCED | TurnFlag.QUIET, 100);
    const beam = record(0x22222222, TurnFlag.QUIET, 900);
    const late = record(0x33333333, TurnFlag.FORCED | TurnFlag.HOME_FORTIFY, -100);
    const ctx = { out: [forced, beam], count: 2, forced: 1, capacity: 2, stats: newGenStats() };
    const offer = (turn: Turn) => (gen as unknown as {
      offerForced(context: typeof ctx, candidate: Turn): void;
    }).offerForced(ctx, turn);
    return { ctx, late, offer, record };
  }

  it('retains late HOME_FORTIFY by evicting a full beam even when its gain is lower', () => {
    const { ctx, late, offer } = storage();
    offer(late);
    expect(ctx.count).toBe(2); expect(ctx.forced).toBe(2);
    expect(ctx.out.map(t => t.endLo)).toContain(late.endLo);
    expect(ctx.out.some(t => (t.flags & TurnFlag.HOME_FORTIFY) !== 0)).toBe(true);
    expect(ctx.stats.forcedOverflow).toBe(0);
  });

  it('reports pure-forced overflow explicitly and keeps the retained records intact', () => {
    const { ctx, late, offer, record } = storage();
    offer(late);
    const before = ctx.out.map(t => [t.endLo, t.endHi, t.flags]);
    offer(record(0x44444444, TurnFlag.FORCED | TurnFlag.HOME_FORTIFY, 99999));
    expect(ctx.out.map(t => [t.endLo, t.endHi, t.flags])).toEqual(before);
    expect(ctx.stats.forcedOverflow).toBe(1);
  });
});


describe('Phasing macro TT equivalence on complete bounded trees', () => {
  const gen = { ...DESKTOP.gen, K: 3, maxPlacePlans: 1, maxPromotions: 0,
    action: { ...DESKTOP.gen.action, widths: Int32Array.of(2, 1, 1, 1), keep: 3 },
    purchase: { ...DESKTOP.gen.purchase, maxPlans: 1, maxBodies: 0 } };
  const config: Partial<HardConfig> = { maxDepth: 2, gen, genInterior: gen,
    useExtensions: false, useAspiration: false, useLmr: false, useFutility: false,
    quiesce: { ...DESKTOP.quiesce, maxPly: 0 } };
  const key = (t: Turn) => `${t.endHi}:${t.endLo}`;
  const stateFor = (extra: Partial<StateSpec>) => base({
    white: 0, black: 0, actions: 4, reserves: new Array(100).fill(0),
    units: [{ def: 'fire_1', owner: 'white', x: 2, y: 2 },
      { def: 'plant_1', owner: 'black', x: 7, y: 7 }], ...extra,
  });

  // Exhaustive over the configured candidate tree: no alpha/beta pruning, no
  // TT, and every generated macro is applied in full. This is deliberately
  // not a claim that the selective generator emits every legal action line.
  function manual(ctx: ReturnType<typeof prepare>['ctx'], p: PackedState, depth: number, ply: number): { score: number; bestEnds: Set<string> } {
    const mover = p.side as Side;
    const terminal = terminalScore(p, mover, ply);
    if (terminal !== null) return { score: terminal, bestEnds: new Set() };
    if (depth === 0) return { score: quiesce(ctx, p, -INF, INF, ply, 0), bestEnds: new Set() };
    const tables = buildTables(p, ctx.sc, ply, 2, ctx.tables[ply]);
    const n = generateAt(ctx, p, tables, ply);
    expect(n).toBeGreaterThan(0);
    const turns = ctx.turns[ply].slice(0, n).map(t => copyTurn(allocTurn(), t));
    let best = -INF;
    const ends = new Set<string>();
    for (const t of turns) {
      const applied = makeTurn(ctx, p, t, ctx.keep[ply]);
      expect(applied).toBe(t.count);
      const terminalChild = terminalScore(p, mover, ply + 1);
      const score = terminalChild ?? -manual(ctx, p, depth - 1, ply + 1).score;
      unmakeTurn(ctx, p, applied);
      if (score > best) { best = score; ends.clear(); }
      if (score === best) ends.add(key(t));
    }
    return { score: best, bestEnds: ends };
  }

  for (const [name, extra] of [
    ['full Act', {}], ['partial Act', { actions: 1 }],
    ['pending Act', { pendingSummons: [{ def: 'plant_1', owner: 'white', x: 1, y: 2 }] } as Partial<StateSpec>],
    ['Prepare', { phase: 'place', actions: 0 }],
    ['upkeep Prepare', { phase: 'place', actions: 0, upkeepPending: true }],
  ] as const) {
    it(`${name}: TT on/off match complete generated-tree minimax and retain verified optima`, () => {
      const state = stateFor(extra), oracle = prepare(state, 2_000_000, config);
      if (name === 'pending Act') {
        const noPending = oracle.ctx.rep.pack(stateFor({}), allocState());
        expect([...oracle.p.pieceAt]).toEqual([...noPending.pieceAt]);
        expect([...oracle.p.bank]).toEqual([...noPending.bank]);
        expect([oracle.p.kposHi, oracle.p.kposLo]).not.toEqual([noPending.kposHi, noPending.kposLo]);
        expect(bbHas(validPendingMask(oracle.p, 0, bbNew()), 21)).toBe(true);
        // Demonstrate an actual arrival along the generated quiet/quiet branch
        // of the same depth-two tree, through canonical replay at both plies.
        let arrivalState = state;
        for (let ply = 0; ply < 2; ply++) {
          const path = prepare(arrivalState, 2_000_000, config);
          const tables = buildTables(path.p, path.ctx.sc, 0, 2, path.ctx.tables[0]);
          const n = generateAt(path.ctx, path.p, tables, 0);
          const quiet = path.ctx.turns[0].slice(0, n).find(t =>
            t.count === 2 && paKind(t.actions[0]) === AKind.END_ACTION && paKind(t.actions[1]) === AKind.END_PLACE);
          expect(quiet).toBeDefined();
          const checked = verifyTurn(path.ctx.rep, arrivalState, path.p, quiet!, path.ctx.keep[0]);
          expect(checked.verified, checked.reason).toBe(true);
          arrivalState = checked.endState;
        }
        expect(arrivalState.pendingSummons?.length).toBe(0);
        expect(arrivalState.board.units.some(u => u.owner === 'white' && u.definitionId === 'plant_1' &&
          u.position.x === 1 && u.position.y === 2)).toBe(true);
      }
      oracle.ctx.useTT = false;
      const before = oracle.ctx.rep.digest(oracle.p);
      const expected = manual(oracle.ctx, oracle.p, 2, 0);
      expect(oracle.ctx.rep.digest(oracle.p)).toBe(before);
      expect(oracle.ctx.truncated).toBe(false); expect(oracle.ctx.meter.exhausted()).toBe(false);
      const retained: { score: number; end: string; pv: string[] }[] = [];
      for (const useTT of [false, true]) {
        const run = prepare(state, 2_000_000, config); run.ctx.useTT = useTT;
        const digest = run.ctx.rep.digest(run.p), result = iterativeDeepening(run.ctx, run.p);
        expect(result.depth).toBe(2); expect(run.ctx.truncated).toBe(false);
        expect(run.ctx.meter.exhausted()).toBe(false); expect(result.scoreCc).toBe(expected.score);
        expect(result.best).not.toBeNull();
        const best = copyTurn(allocTurn(), result.best!);
        expect(expected.bestEnds.has(key(best))).toBe(true);
        expect(verifyTurn(run.ctx.rep, state, run.p, best, run.ctx.keep[0]).verified).toBe(true);
        expect(run.ctx.rep.digest(run.p)).toBe(digest);
        expect(result.pv.length).toBeGreaterThan(0);
        const pv = result.pv.map(t => copyTurn(allocTurn(), t));
        let canonical = state;
        for (const t of pv) {
          const packed = run.ctx.rep.pack(canonical, allocState());
          const checked = verifyTurn(run.ctx.rep, canonical, packed, t, newKeepSetTable());
          expect(checked.verified, checked.reason).toBe(true);
          canonical = checked.endState;
        }
        retained.push({ score: result.scoreCc, end: key(best), pv: pv.map(key) });
      }
      expect(retained[1].score).toBe(retained[0].score);
      // TT ordering may choose a different equally optimal line. Only a
      // unique optimum requires identical retained end, not a witness tie.
      if (expected.bestEnds.size === 1) expect(retained[1].end).toBe(retained[0].end);

      const cached = prepare(state, 2_000_000, config); cached.ctx.useTT = true;
      if (macroTtEligible(cached.p)) {
        expect(pvs(cached.ctx, cached.p, 2, -INF, INF, 0, 0)).toBe(expected.score);
        const hits = cached.ctx.tt.hits;
        expect(pvs(cached.ctx, cached.p, 2, -INF, INF, 0, 0)).toBe(expected.score);
        expect(cached.ctx.tt.hits).toBeGreaterThan(hits);
      } else {
        cached.ctx.tt.store(cached.p.kposLo, cached.p.kposHi, 123456, 2, Bound.EXACT, 0, 0);
        expect(pvs(cached.ctx, cached.p, 2, -INF, INF, 0, 0)).toBe(expected.score);
      }
      expect(cached.ctx.truncated).toBe(false); expect(cached.ctx.meter.exhausted()).toBe(false);
    });
  }
});
