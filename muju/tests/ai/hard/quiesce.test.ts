// @vitest-environment node
/**
 * `search/quiesce.ts` (DESIGN §4.16, §5.11.4, F24): the tactical-turn
 * classification, the stand-pat contract, and the R5 cap.
 *
 * The cap is the sharp one. DESIGN §5.11.4 gates quiescence at 0.35 of the work
 * rung and M14's bench measures it; the implementation ENFORCES it on the work
 * a quiescence subtree actually costs, so the test drives a real search at a
 * small rung on a tactics-rich position and asserts the measured share.
 */
import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../../src/game/board';
import { TACTICAL_FLAGS, TurnFlag, type Turn } from '../../../src/ai/hard/gen/turn';
import {
  QUIESCE_SHARE_DEN,
  QUIESCE_SHARE_NUM,
  isTacticalTurn,
  quiesce,
} from '../../../src/ai/hard/search/quiesce';
import { evaluateLeaf } from '../../../src/ai/hard/search/pvs';
import { HardEngine } from '../../../src/ai/hard/engine';
import { INF } from '../../../src/ai/hard/search/pvs';
import { buildState } from './game-fixture';
import { prepare } from './search-fixture';

function turnWith(flags: number): Turn {
  return { actions: new Int32Array(1), count: 0, endLo: 0, endHi: 0, sig: 0, flags, gainCc: 0, place: -1, hangCc: 0 };
}

describe('isTacticalTurn', () => {
  it('is exactly F24\'s five flags', () => {
    const p = {} as never;
    for (const flag of [TurnFlag.KILL, TurnFlag.HOME_ENTRY, TurnFlag.HOME_RESCUE, TurnFlag.HOME_RACE, TurnFlag.SUMMON_STRIKE]) {
      expect(isTacticalTurn(p, turnWith(flag))).toBe(true);
    }
    // F24 keeps anchor voiding OUT of quiescence: `SPAWN_DENY` is an ordering
    // bonus, not a reason to extend.
    for (const flag of [TurnFlag.SPAWN_DENY, TurnFlag.PURCHASE, TurnFlag.PROMOTION, TurnFlag.RETREAT, TurnFlag.QUIET, TurnFlag.BOOK]) {
      expect(isTacticalTurn(p, turnWith(flag))).toBe(false);
    }
    // `CLEAVE_CHAIN` is in `TACTICAL_FLAGS` because a Cleave chain IS a kill.
    expect(isTacticalTurn(p, turnWith(TurnFlag.CLEAVE_CHAIN))).toBe(true);
    expect(TACTICAL_FLAGS & TurnFlag.SPAWN_DENY).toBe(0);
  });
});

describe('quiesce', () => {
  it('stands pat on a position with no tactic available', () => {
    // The initial position: nothing is killable, no corner is one turn away.
    const prepared = prepare(createInitialGameState(), 400_000);
    const { ctx, p } = prepared;
    const expected = evaluateLeaf(ctx, p, -INF, INF, 0);
    const value = quiesce(ctx, p, -INF, INF, 0, 0);
    expect(value).toBe(expected);
    // Standing pat costs the node itself and its evaluation, nothing more.
    expect(ctx.stats.qnodes).toBe(1);
  });

  it('returns beta when the stand-pat score already beats the window', () => {
    const prepared = prepare(createInitialGameState(), 400_000);
    const { ctx, p } = prepared;
    const standPat = evaluateLeaf(ctx, p, -INF, INF, 0);
    const beta = standPat - 1_000;
    expect(quiesce(ctx, p, beta - 1, beta, 0, 0)).toBe(beta);
  });

  it('leaves the position byte-identical', () => {
    const prepared = prepare(createInitialGameState(), 400_000);
    const { ctx, p } = prepared;
    const before = ctx.rep.digest(p);
    quiesce(ctx, p, -INF, INF, 0, 0);
    expect(ctx.rep.digest(p)).toBe(before);
    ctx.rep.check(p);
  });

  it('honours DESIGN §5.11.4\'s R5 cap on a tactics-rich position', async () => {
    // Four white bodies inside striking distance of four black ones: every
    // node has kills, which is exactly where quiescence would run away.
    const state = buildState({
      current: 'white',
      phase: 'action',
      actions: 4,
      white: 6,
      black: 6,
      units: [
        { def: 'fire_1', owner: 'white', x: 3, y: 3 },
        { def: 'water_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'white', x: 3, y: 5 },
        { def: 'metal_1', owner: 'white', x: 5, y: 3 },
        { def: 'lightning_1', owner: 'black', x: 4, y: 3 },
        { def: 'shadow_1', owner: 'black', x: 3, y: 4 },
        { def: 'fire_2', owner: 'black', x: 5, y: 4 },
        { def: 'water_2', owner: 'black', x: 4, y: 5 },
      ],
    });
    const engine = new HardEngine();
    const result = await engine.searchTurn(state, { work: 120_000 });
    expect(result.stats.quiesceWork).toBeGreaterThan(0);
    const share = result.stats.quiesceWork / result.work;
    expect(share).toBeLessThanOrEqual(QUIESCE_SHARE_NUM / QUIESCE_SHARE_DEN + 0.02);
    // And the cap is 0.35 in DESIGN's own terms.
    expect(share).toBeLessThanOrEqual(0.35);
  }, 60_000);

  it('never recurses past cfg.quiesce.maxPly', () => {
    const prepared = prepare(createInitialGameState(), 400_000, { quiesce: { maxPly: 1, deltaMarginCc: 300, maxCandidates: 8 } });
    const { ctx, p } = prepared;
    quiesce(ctx, p, -INF, INF, 0, 0);
    expect(ctx.stats.seldepth).toBeLessThanOrEqual(1);
  });
});
