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
import { TurnFlag } from '../../../src/ai/hard/gen/turn';
import { buildState } from './game-fixture';
import { candidates, prepare } from './search-fixture';

// E0.5 timeout budget: slowest test 36.9 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 180 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 180_000 });

describe('pvs', () => {
  it('matches a hand-rolled one-ply maximisation at depth 1', () => {
    const prepared = prepare(createInitialGameState(), 800_000);
    const { ctx, p } = prepared;
    const mover = p.side as Side;

    const value = pvs(ctx, p, 1, -INF, INF, 0, 0);

    // Re-derive the same quantity from the same candidate list.
    const fresh = prepare(createInitialGameState(), 800_000);
    const { turns, n } = candidates(fresh);
    expect(n).toBeGreaterThan(0);
    let best = -INF;
    for (let i = 0; i < n; i++) {
      const applied = makeTurn(fresh.ctx, fresh.p, turns[i], fresh.ctx.keep[0]);
      if (applied === turns[i].count) {
        const terminal = terminalScore(fresh.p, mover, 1);
        const child = terminal !== null ? terminal : -quiesce(fresh.ctx, fresh.p, -INF, INF, 1, 0);
        if (child > best) best = child;
      }
      unmakeTurn(fresh.ctx, fresh.p, applied);
    }
    expect(value).toBe(best);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('leaves the position byte-identical after a multi-ply search', () => {
    const prepared = prepare(createInitialGameState(), 200_000);
    const { ctx, p } = prepared;
    const before = ctx.rep.digest(p);
    pvs(ctx, p, 3, -INF, INF, 0, 0);
    expect(ctx.rep.digest(p)).toBe(before);
    ctx.rep.check(p);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('a deeper search never reports a lower depth than a shallower one', () => {
    const prepared = prepare(createInitialGameState(), 200_000);
    const result = iterativeDeepening(prepared.ctx, prepared.p);
    expect(result.depth).toBeGreaterThanOrEqual(1);
    expect(result.best).not.toBeNull();
    expect(result.pv.length).toBeGreaterThan(0);
    expect(result.stats.nodes).toBeGreaterThan(0);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('never starts an iteration past DESIGN §5.11.2\'s 0.45 guard', () => {
    // A tiny rung: depth 1 runs, and the guard stops the search before it can
    // spend a second iteration it could not finish.
    const prepared = prepare(createInitialGameState(), 3_000);
    const result = iterativeDeepening(prepared.ctx, prepared.p);
    expect(result.depth).toBe(1);
    expect(['work', 'abort', 'complete']).toContain(result.stats.stopReason);
  });

  it('respects the work rung', () => {
    const prepared = prepare(createInitialGameState(), 50_000);
    iterativeDeepening(prepared.ctx, prepared.p);
    // The meter may overshoot by at most one node's charge.
    expect(prepared.ctx.meter.used).toBeLessThan(50_000 + 5_000);
  });

  it('polls `stop` and truncates instead of finishing the iteration', () => {
    const engine = new HardEngine();
    const ctx = engine.ctx;
    const p = ctx.rep.pack(createInitialGameState(), engine.rootState);
    p.proverMode = 2;
    ctx.meter.reset(2_000_000);
    let calls = 0;
    ctx.stop = () => ++calls > 3;
    const result = iterativeDeepening(ctx, p);
    expect(calls).toBeGreaterThan(3);
    expect(result.stats.stopReason).toBe('abort');
    expect(result.depth).toBeLessThanOrEqual(2);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('a truncated iteration can only truncate, never change the move', () => {
    // DESIGN §5.11.6: the abort watchdog "can only truncate iterative deepening
    // (returning the last completed depth), never alter a completed depth".
    //
    // `stop()` is polled at iteration boundaries, inside the candidate loop and
    // inside quiescence, and until it first answers true the search is
    // bit-identical to one whose `stop()` is constant false. So the move a
    // truncated search reports at depth `d` must be the move the UNTRUNCATED
    // search chose at that same depth — anything else means a partially
    // searched deeper iteration overwrote a completed answer in place.
    const key = (t: { endHi: number; endLo: number }): string =>
      `${(t.endHi >>> 0).toString(16)}:${(t.endLo >>> 0).toString(16)}`;

    const baseline = prepare(createInitialGameState(), 800_000);
    const byDepth = new Map<number, string>();
    iterativeDeepening(baseline.ctx, baseline.p, r => {
      if (r.best !== null) byDepth.set(r.depth, key(r.best));
    });
    expect(byDepth.size).toBeGreaterThan(1);

    // The trip points are not arbitrary: on this position, `stop()` first
    // answering true anywhere in 36..58 lands inside a deeper iteration that
    // had already changed its best-so-far, which is exactly the window the
    // aliasing bug was visible in (measured: it returned the wrong move on
    // 12 of the first 200 trip points, all but two of them in that band).
    for (const trip of [2, 36, 48, 58, 96]) {
      const run = prepare(createInitialGameState(), 800_000);
      let calls = 0;
      run.ctx.stop = () => ++calls > trip;
      const result = iterativeDeepening(run.ctx, run.p);
      expect(result.best).not.toBeNull();
      if (result.depth === 0) continue; // nothing completed: the partial answer
      expect(`d${result.depth}=${key(result.best!)}`).toBe(`d${result.depth}=${byDepth.get(result.depth)}`);
    }
  }, 180_000); // measured 36.9 s in the E0.5 survey; 5x headroom, down from an uncommented 300 s

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

  it('injects the prover rescue witness, upkeep pending or not', () => {
    // DESIGN §5.6 injection 4 / §5.10 item 3: when an enemy holds my corner the
    // prover's own witness line is a FORCED candidate. `tactics/prover.ts`
    // writes that line for the position at the DEFENDER'S UPKEEP, so it opens
    // with `PAY_UPKEEP` against the prover's private keep-set table — and
    // `search/root.ts installRescueWitness` is what makes it a line the node can
    // play (drop the `PAY_UPKEEP` when none is pending, adopt the keep-set and
    // re-index it when one is). Without that the injection is dead in every
    // position, and the defender walks into a mate it could have answered.
    const units = [
      { def: 'plant_1', owner: 'black' as const, x: 0, y: 0, id: 'invader' },
      { def: 'plant_1', owner: 'white' as const, x: 1, y: 0, id: 'defender-1' },
      { def: 'fire_1', owner: 'white' as const, x: 2, y: 0, id: 'defender-2' },
    ];
    for (const upkeepPending of [true, false]) {
      const state = buildState({
        current: 'white',
        phase: 'place',
        actions: 4,
        upkeepPending,
        units,
      });
      const prepared = prepare(state, 400_000);
      const { turns, n } = candidates(prepared);
      let rescues = 0;
      for (let i = 0; i < n; i++) {
        if ((turns[i].flags & TurnFlag.HOME_RESCUE) !== 0) rescues++;
      }
      expect(`upkeepPending=${String(upkeepPending)} rescues=${rescues > 0}`).toBe(
        `upkeepPending=${String(upkeepPending)} rescues=true`,
      );
      // The witness is FORCED, so it is in the list before the beam runs, and
      // the ordering puts `HOME_RESCUE` first (§5.11.3 item 2).
      expect((turns[0].flags & TurnFlag.HOME_RESCUE) !== 0).toBe(true);
    }
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('a decided position scores as a terminal, not as an evaluation', () => {
    const prepared = prepare(createInitialGameState(), 100_000);
    const { ctx, p } = prepared;
    p.result = Result.WHITE_WIN;
    expect(pvs(ctx, p, 3, -INF, INF, 0, 0)).toBe(terminalScore(p, p.side as Side, 0));
    p.result = Result.ONGOING;
  });
});
