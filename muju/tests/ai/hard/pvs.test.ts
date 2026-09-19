// @vitest-environment node
/**
 * `search/pvs.ts` (DESIGN §4.16, §5.11.2): the macro-turn PVS driver.
 *
 * The load-bearing test is the depth-1 IDENTITY: `pvs(p, 1, -INF, +INF)` must
 * equal the best over this node's candidates of `-value(child)`, where
 * `value(child)` is what the child node itself returns. That is the definition
 * of a one-ply search, and computing the right-hand side independently — by
 * applying each candidate with the replica and calling `quiesce` on the result,
 * exactly as `pvs` does at depth 0 — catches a sign error, an off-by-one in the
 * turn boundary, and a candidate the loop silently skipped.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../../../src/game/board';
import { Result, type Side } from '../../../src/ai/hard/types';
import { terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { quiesce } from '../../../src/ai/hard/search/quiesce';
import {
  INF,
  iterativeDeepening,
  makeTurn,
  pvs,
  unmakeTurn,
} from '../../../src/ai/hard/search/pvs';
import { HardEngine } from '../../../src/ai/hard/engine';
import { DESKTOP, type HardConfig } from '../../../src/ai/hard/config';
import { WorkClass } from '../../../src/ai/hard/search/time';
import { TurnFlag, type Turn } from '../../../src/ai/hard/gen/turn';
import { verifyTurn } from '../../../src/ai/hard/verify/replay';
import { buildState } from './game-fixture';
import { candidates, prepare } from './search-fixture';

// E0.5 timeout budget: slowest test 36.9 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 180 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 180_000 });

const tiny = () => buildState({ reserves: new Array(100).fill(0), units: [
  { def: 'fire_1', owner: 'white', x: 2, y: 2 },
  { def: 'plant_1', owner: 'black', x: 7, y: 7 },
] });
const tinyGen = { ...DESKTOP.gen, K: 4, maxPlacePlans: 1,
  action: { ...DESKTOP.gen.action, widths: Int32Array.of(2, 1, 1, 1), keep: 4 } };
const tinyConfig: Partial<HardConfig> = { maxDepth: 2, gen: tinyGen, genInterior: tinyGen,
  useExtensions: false, useAspiration: false, useLmr: false, useFutility: false };
const retained = (t: Turn | null, scoreCc: number) => t === null ? null : ({
  actions: Array.from(t.actions.subarray(0, t.count)), count: t.count,
  keepMask: t.keepMask ? Array.from(t.keepMask) : null, end: [t.endHi, t.endLo], scoreCc,
});

describe('pvs', () => {
  it('matches a hand-rolled one-ply maximisation at depth 1', () => {
    const prepared = prepare(tiny(), 1_000_000, tinyConfig);
    const { ctx, p } = prepared;
    const mover = p.side as Side;

    const value = pvs(ctx, p, 1, -INF, INF, 0, 0);
    expect(ctx.truncated).toBe(false);
    expect(ctx.meter.exhausted()).toBe(false);

    // Re-derive the same quantity from the same candidate list.
    const fresh = prepare(tiny(), 1_000_000, tinyConfig);
    const { turns, n } = candidates(fresh);
    expect(n).toBeGreaterThan(0);
    let best = -INF;
    for (let i = 0; i < n; i++) {
      const applied = makeTurn(fresh.ctx, fresh.p, turns[i], fresh.ctx.keep[0]);
      expect(applied).toBe(turns[i].count);
      {
        const terminal = terminalScore(fresh.p, mover, 1);
        if (terminal === null) {
          expect(fresh.p.side).not.toBe(mover);
          expect(fresh.p.phase).toBe(1);
          expect(fresh.p.actions).toBe(4);
        }
        const child = terminal !== null ? terminal : -quiesce(fresh.ctx, fresh.p, -INF, INF, 1, 0);
        if (child > best) best = child;
      }
      unmakeTurn(fresh.ctx, fresh.p, applied);
    }
    expect(fresh.ctx.truncated).toBe(false);
    expect(fresh.ctx.meter.exhausted()).toBe(false);
    expect(value).toBe(best);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('leaves the position byte-identical after a multi-ply search', () => {
    const prepared = prepare(createInitialGameState(undefined, 4, 0, 'phasing'), 200_000);
    const { ctx, p } = prepared;
    const before = ctx.rep.digest(p);
    pvs(ctx, p, 3, -INF, INF, 0, 0);
    expect(ctx.rep.digest(p)).toBe(before);
    ctx.rep.check(p);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('completes the requested shallow and deeper search depths on an authored tree', () => {
    for (const depth of [1, 2]) {
      const { ctx, p } = prepare(tiny(), 1_000_000, { ...tinyConfig, maxDepth: depth });
      const result = iterativeDeepening(ctx, p);
      expect(result.depth).toBe(depth);
      expect(ctx.truncated).toBe(false);
      expect(result.best).not.toBeNull();
      expect(result.pv.length).toBeGreaterThan(0);
      expect(result.stats.nodes).toBeGreaterThan(0);
    }
  });

  it('applies the 0.45 iteration-start guard to an already completed answer', () => {
    for (const above of [false, true]) {
      const { ctx, p } = prepare(tiny(), 1_000_000, tinyConfig);
      const depths: number[] = [];
      let first: ReturnType<typeof retained> = null;
      const result = iterativeDeepening(ctx, p, r => {
        depths.push(r.depth);
        if (r.depth !== 1) return;
        first = retained(r.best, r.scoreCc);
        const target = Math.floor(ctx.meter.limit * 0.45) + (above ? 1 : 0);
        expect(ctx.meter.used).toBeLessThan(target);
        ctx.meter.spend(WorkClass.TURN, target - ctx.meter.used);
      });
      expect(result.depth).toBe(above ? 1 : 2);
      expect(depths).toEqual(above ? [1] : [1, 2]);
      if (above) {
        expect(result.stats.stopReason).toBe('work');
        expect(retained(result.best, result.scoreCc)).toEqual(first);
      }
    }
  });

  it('respects the work rung', () => {
    const prepared = prepare(createInitialGameState(undefined, 4, 0, 'phasing'), 50_000);
    iterativeDeepening(prepared.ctx, prepared.p);
    // The meter may overshoot by at most one node's charge.
    expect(prepared.ctx.meter.used).toBeLessThan(50_000 + 5_000);
  });

  it('polls `stop` and truncates instead of finishing the iteration', () => {
    const engine = new HardEngine();
    const ctx = engine.ctx;
    const p = ctx.rep.pack(createInitialGameState(undefined, 4, 0, 'phasing'), engine.rootState);
    p.proverMode = 2;
    ctx.meter.reset(2_000_000);
    let calls = 0;
    ctx.stop = () => ++calls > 3;
    const result = iterativeDeepening(ctx, p);
    expect(calls).toBeGreaterThan(3);
    expect(result.stats.stopReason).toBe('abort');
    expect(result.depth).toBeLessThanOrEqual(2);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('an interrupted deeper iteration preserves all fields of the completed answer', () => {
    const baseline = prepare(tiny(), 1_000_000, tinyConfig);
    const byDepth = new Map<number, ReturnType<typeof retained>>();
    iterativeDeepening(baseline.ctx, baseline.p, r => byDepth.set(r.depth, retained(r.best, r.scoreCc)));
    expect([...byDepth.keys()]).toEqual([1, 2]);
    const run = prepare(tiny(), 1_000_000, tinyConfig);
    let firstNodes = -1;
    run.ctx.stop = () => firstNodes >= 0 && run.ctx.stats.nodes >= firstNodes + 2;
    const completed: number[] = [];
    const result = iterativeDeepening(run.ctx, run.p, r => {
      completed.push(r.depth);
      if (r.depth === 1) firstNodes = run.ctx.stats.nodes;
    });
    expect(completed).toEqual([1]);
    expect(result.depth).toBe(1);
    expect(result.stats.nodes).toBeGreaterThan(firstNodes + 1);
    expect(result.stats.stopReason).toBe('abort');
    expect(run.ctx.truncated).toBe(true);
    expect(retained(result.best, result.scoreCc)).toEqual(byDepth.get(1));
    const replay = verifyTurn(run.ctx.rep, tiny(), run.p, result.best!, run.ctx.keep[0]);
    expect(replay.verified, replay.reason).toBe(true);
  });

  it('the df-pn hook is wired and answers UNKNOWN at M14', () => {
    // `useDfpn` is off in every shipped profile; forcing it on must not change
    // the result while `tactics/dfpn.ts` is a stub, and must exercise the call.
    const state = buildState({
      current: 'white',
      phase: 'action',
      actions: 4,
      units: [
        { def: 'fire_1', owner: 'white', x: 1, y: 1 },
        { def: 'metal_1', owner: 'black', x: 8, y: 8 },
      ],
    });
    const off = prepare(state, 150_000);
    const withoutDfpn = iterativeDeepening(off.ctx, off.p);
    const on = prepare(state, 150_000, { useDfpn: true });
    const withDfpn = iterativeDeepening(on.ctx, on.p);
    expect(withDfpn.scoreCc).toBe(withoutDfpn.scoreCc);
    expect(withDfpn.depth).toBe(withoutDfpn.depth);
    expect(on.ctx.stats.dfpnCalls).toBeGreaterThan(0);
    expect(off.ctx.stats.dfpnCalls).toBe(0);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('injects an Act rescue and completes its post-Act upkeep and Prepare', () => {
    // The Phasing witness is pure Act. The macro generator must append the
    // mover's upkeep/Prepare, stopping before the opponent acts. An additional
    // black survivor prevents the rescue attack from ending by elimination.
    const units = [
      { def: 'plant_1', owner: 'black' as const, x: 0, y: 0, id: 'invader' },
      { def: 'plant_1', owner: 'white' as const, x: 1, y: 0, id: 'defender-1' },
      { def: 'fire_1', owner: 'white' as const, x: 2, y: 0, id: 'defender-2' },
      { def: 'metal_1', owner: 'black' as const, x: 9, y: 9, id: 'survivor' },
    ];
    for (const review of [true, false]) {
      const state = buildState({ current: 'white', phase: 'action', actions: 4,
        reviewUpkeep: { white: review, black: false }, units });
      const prepared = prepare(state, 400_000);
      const { turns, n } = candidates(prepared);
      const rescues = turns.slice(0, n).filter(t => (t.flags & TurnFlag.HOME_RESCUE) !== 0);
      expect(rescues.length).toBeGreaterThan(0);
      expect(turns[0].flags & TurnFlag.HOME_RESCUE).not.toBe(0);
      for (const turn of rescues) {
        expect(turn.flags & TurnFlag.FORCED).not.toBe(0);
        const replay = verifyTurn(prepared.ctx.rep, state, prepared.p, turn, prepared.ctx.keep[0]);
        expect(replay.verified, replay.reason).toBe(true);
        expect(replay.actions.some(a => a.type === 'ATTACK')).toBe(true);
        expect(replay.actions.some(a => a.type === 'PAY_UPKEEP')).toBe(review);
        expect(replay.actions.at(-1)?.type).toBe('END_PLACE_PHASE');
        expect(replay.endState.turn.currentPlayer).toBe('black');
        expect(replay.endState.turn.phase).toBe('action');
        expect(replay.endState.board.units.some(u => u.id === 'invader')).toBe(false);
      }
    }
    for (const upkeepPending of [false, true]) {
      const state = buildState({ current: 'white', phase: 'place', actions: 0,
        upkeepPending, units });
      const prepared = prepare(state, 400_000);
      const { turns, n } = candidates(prepared);
      expect(n).toBeGreaterThan(0);
      expect(turns.slice(0, n).every(t => (t.flags & TurnFlag.HOME_RESCUE) === 0)).toBe(true);
    }
  }, 60_000);

  it('a decided position scores as a terminal, not as an evaluation', () => {
    const prepared = prepare(createInitialGameState(undefined, 4, 0, 'phasing'), 100_000);
    const { ctx, p } = prepared;
    p.result = Result.WHITE_WIN;
    expect(pvs(ctx, p, 3, -INF, INF, 0, 0)).toBe(terminalScore(p, p.side as Side, 0));
    p.result = Result.ONGOING;
  });
});
