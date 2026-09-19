// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildState } from './game-fixture';
import { prepare } from './search-fixture';
import { applyAction, transitionWithoutCheckmate } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { analyzeHomeDefense } from '../../../src/game/homeCheckmate';
import type { AIAction } from '../../../src/ai/types';
import { DESKTOP, type GenConfig } from '../../../src/ai/hard/config';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { AKind, newKeepSetTable, paKind } from '../../../src/ai/hard/core/action';
import { allocTables, buildTables } from '../../../src/ai/hard/tables/context';
import { ActionSearch, UNLIMITED_WORK, type WithinTurnScorer } from '../../../src/ai/hard/gen/actionsearch';
import { TurnGenerator, newGenStats, outCapacityFor } from '../../../src/ai/hard/gen/generate';
import { TurnFlag, TurnPool, type Turn } from '../../../src/ai/hard/gen/turn';
import { allocTurn, generateAt } from '../../../src/ai/hard/search/pvs';
import { verifyTurn } from '../../../src/ai/hard/verify/replay';

describe('forced Phasing continuations across generator boundaries', () => {
  it('exposes the actual interior capacity and records omitted forced turns before TT publication', () => {
    const state = buildState({ units: [
      { def: 'plant_1', owner: 'white', x: 2, y: 2 },
      { def: 'plant_1', owner: 'black', x: 8, y: 8 },
    ] });
    const { ctx, p } = prepare(state);
    const rootCapacity = ctx.turns[0].length;
    const interiorCapacity = ctx.turns[1].length;
    expect(rootCapacity).toBeGreaterThan(interiorCapacity);
    expect(ctx.genOut.length).toBe(rootCapacity);
    const attempted = interiorCapacity + 1;
    let seenInteriorCapacity = 0;

    // The generator/storage seam is synthetic so the exact overflow is
    // deterministic. Real generation, legality and mate continuation are
    // exercised below; this test isolates the production generateAt transfer.
    const interior = vi.spyOn(ctx.genInterior, 'generate').mockImplementation(
      (_p, _t, _score, _meter, _ply, _keep, out, stats) => {
        seenInteriorCapacity = out.length;
        Object.assign(stats, newGenStats());
        const retained = Math.min(attempted, out.length);
        for (let i = 0; i < retained; i++) {
          const turn = allocTurn();
          turn.endLo = i + 1;
          turn.endHi = 0x12345678;
          turn.flags = TurnFlag.FORCED | TurnFlag.HOME_FORTIFY;
          out[i] = turn;
        }
        stats.forcedOverflow = attempted - retained;
        return retained;
      },
    );
    let seenRootCapacity = 0;
    const root = vi.spyOn(ctx.gen, 'generate').mockImplementation(
      (_p, _t, _score, _meter, _ply, _keep, out, stats) => {
        seenRootCapacity = out.length;
        Object.assign(stats, newGenStats());
        out[0] = allocTurn();
        out[0].flags = TurnFlag.FORCED;
        return 1;
      },
    );
    try {
      expect(ctx.truncated).toBe(false);
      const n = generateAt(ctx, p, ctx.tables[0], 1);
      expect(interior).toHaveBeenCalledOnce();
      expect(seenInteriorCapacity).toBe(interiorCapacity);
      expect(n).toBe(interiorCapacity);
      expect(ctx.genStats.forcedOverflow).toBe(1);
      expect(ctx.truncated).toBe(true);
      expect(ctx.turns[1].slice(0, n).map(t => t.endLo)).toEqual(
        Array.from({ length: interiorCapacity }, (_, i) => i + 1),
      );
      expect(ctx.turns[1].slice(0, n).every(t => (t.flags & TurnFlag.HOME_FORTIFY) !== 0)).toBe(true);
      expect(ctx.meter.exhausted()).toBe(false);
      // Reusing the shared scratch output for a later root must restore the
      // root capacity; narrowing an interior must not permanently shrink it.
      ctx.truncated = false;
      expect(generateAt(ctx, p, ctx.tables[0], 0)).toBe(1);
      expect(seenRootCapacity).toBe(rootCapacity);
      expect(ctx.truncated).toBe(false);
    } finally {
      interior.mockRestore();
      root.mockRestore();
    }
  });

  it('retains home-entry then fortification mate when the ordinary Act endpoint beam rejects the entry', () => {
    const state = buildState({ phase: 'action', actions: 1, white: 20, black: 0,
      reserves: new Array<number>(100).fill(0), units: [
        { def: 'metal_2', owner: 'white', x: 9, y: 8, id: 'occupier' },
        { def: 'fire_2', owner: 'black', x: 8, y: 9, id: 'defender' },
        { def: 'plant_1', owner: 'black', x: 0, y: 9, id: 'remote' },
      ] });
    const entry: AIAction = { type: 'MOVE', unitId: 'occupier', to: { x: 9, y: 9 } };
    expect(isLegalAction(state, entry)).toBe(true);
    const entered = applyAction(state, entry);
    expect(entered.phase).toBe('playing');
    const endAct: AIAction = { type: 'END_ACTION_PHASE' };
    expect(isLegalAction(entered, endAct)).toBe(true);
    const ready = applyAction(entered, endAct);
    expect(ready.phase).toBe('playing');
    expect(ready.turn.currentPlayer).toBe('white');
    expect(ready.turn.phase).toBe('place');
    expect(ready.upkeepPending).toBe(false);
    expect(analyzeHomeDefense(ready, 'white', transitionWithoutCheckmate)).toBe('rescue');
    const promote: AIAction = { type: 'PROMOTE_UNIT', unitId: 'occupier' };
    expect(isLegalAction(ready, promote)).toBe(true);
    const mate = applyAction(ready, promote);
    expect(mate.winner).toBe('white');
    expect(mate.victoryReason).toBe('home-checkmate');

    const cfg: GenConfig = { ...DESKTOP.gen, K: 1, maxPlacePlans: 1, maxPromotions: 0,
      action: { ...DESKTOP.gen.action, widths: Int32Array.of(1), keep: 1 },
      purchase: { ...DESKTOP.gen.purchase, maxPlans: 1, maxBodies: 0 } };
    const rep = new Replica(), p = rep.pack(state, allocState());
    p.proverMode = 2;
    const before = rep.digest(p);
    const sc = new Scratch(4, 8, 4, 4), tables = buildTables(p, sc, 0, 2, allocTables());
    const slot = p.pieceAt[89];
    // Deliberately hostile ordering proves forced coverage independently of
    // evaluator strength: the unchanged square wins the one-slot Act beam.
    const score: WithinTurnScorer = q => q.sq[slot] === 89 ? 1000 : -1000;
    const ordinary = new ActionSearch(rep, cfg.action, new TurnPool(8), sc);
    const parts: Turn[] = [];
    const nParts = ordinary.run(p, tables, new Int32Array(24), 0, -1, score, UNLIMITED_WORK, 0, parts);
    expect(nParts).toBe(1);
    expect([...parts[0].actions.subarray(0, parts[0].count)].map(paKind)).toEqual([AKind.END_ACTION]);
    expect(rep.digest(p)).toBe(before);

    const gen = new TurnGenerator(rep, cfg, new TurnPool(1536), sc);
    const out: Turn[] = new Array(outCapacityFor(cfg));
    const keep = newKeepSetTable(), stats = newGenStats();
    const n = gen.generate(p, tables, score, UNLIMITED_WORK, 0, keep, out, stats);
    expect(n).toBeGreaterThan(0);
    expect(stats.forcedOverflow).toBe(0);
    const required = TurnFlag.FORCED | TurnFlag.HOME_ENTRY | TurnFlag.HOME_FORTIFY | TurnFlag.PROMOTION;
    const fortifications = out.slice(0, n).filter(t => (t.flags & required) === required);
    expect(fortifications.length).toBeGreaterThan(0);
    let foundMate = false;
    for (const turn of out.slice(0, n)) {
      const replay = verifyTurn(rep, state, p, turn, keep);
      expect(replay.verified, replay.reason).toBe(true);
      if ((turn.flags & required) !== required) continue;
      expect(replay.actions).toEqual([entry, endAct, promote]);
      expect(replay.endState.winner).toBe('white');
      expect(replay.endState.victoryReason).toBe('home-checkmate');
      foundMate = true;
    }
    expect(foundMate).toBe(true);
    expect(rep.digest(p)).toBe(before);
    rep.check(p);
  });
});
