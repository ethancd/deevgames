// @vitest-environment node
/**
 * The negamax sign (DESIGN §5.11.2): **the sign flips exactly once per TURN
 * boundary, never per action.**
 *
 * This is the bug `docs/AI_CORRECTNESS-2026-09-07.md` repaired in the old
 * engine, and it has two halves in a whole-turn search:
 *
 *   1. a turn that ENDS the game does not flip `p.side` (a lethal attack that
 *      eliminates the last body, a corner entry the home gate resolves), so a
 *      naive `-pvs(child)` would hand the winner the LOSS. `search/pvs.ts`
 *      reads such a child as a terminal in the parent, from the parent's own
 *      point of view, which is what the first test pins;
 *   2. the SEAT to move decides the sign: the same board is a win from the
 *      side that can finish it and a loss from the side that cannot, and a sign
 *      that flipped per action makes exactly one of the two come out backwards.
 */
import { describe, expect, it, vi } from 'vitest';
import { Result, WIN_CC, type Side } from '../../../src/ai/hard/types';
import { terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { INF, iterativeDeepening, makeTurn, pvs, unmakeTurn } from '../../../src/ai/hard/search/pvs';
import { MATE_BOUND_CC } from '../../../src/ai/hard/search/tt';
import { TurnFlag } from '../../../src/ai/hard/gen/turn';
import { buildState } from './game-fixture';
import { candidates, prepare } from './search-fixture';

// E0.5 timeout budget: slowest test 12.9 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 60 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 60_000 });

describe('the turn boundary is the only sign flip', () => {
  it('a turn that eliminates the last enemy body scores +WIN for the MOVER', () => {
    // White fire_1 stands on a lane of Black's only body, a fire_3 it kills in
    // one attack. `p.side` does not flip (the game ends at the action), so the
    // parent must read the terminal itself.
    const state = buildState({
      current: 'white',
      phase: 'action',
      actions: 4,
      victoryRule: 'elimination',
      units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 4, y: 5 },
      ],
    });
    const prepared = prepare(state, 400_000);
    const { ctx, p } = prepared;
    const mover = p.side as Side;
    const { turns, n } = candidates(prepared);

    let sawEliminatingTurn = false;
    for (let i = 0; i < n; i++) {
      const applied = makeTurn(ctx, p, turns[i], ctx.keep[0]);
      if (applied === turns[i].count && p.result !== Result.ONGOING && p.result !== Result.DRAW) {
        sawEliminatingTurn = true;
        // The mover won; from the mover's own point of view that is +WIN.
        expect(terminalScore(p, mover, 1)).toBe(WIN_CC - 1_000);
        // And the loser's view is the exact negative.
        expect(terminalScore(p, (1 - mover) as Side, 1)).toBe(-(WIN_CC - 1_000));
      }
      unmakeTurn(ctx, p, applied);
    }
    expect(sawEliminatingTurn).toBe(true);

    // The search must therefore return a WIN, not a loss.
    const value = pvs(ctx, p, 2, -INF, INF, 0, 0);
    expect(value).toBeGreaterThan(MATE_BOUND_CC);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('a mate-scale advantage keeps its sign when the seat to move changes', () => {
    // White's fire_1 is one action from eliminating Black's only body. With
    // WHITE to move that is a win; with BLACK to move the same board is a loss
    // for the side to move. A sign that flipped per ACTION rather than per TURN
    // makes exactly one of these two come out backwards.
    //
    // Mate scores are used rather than an evaluation difference on purpose: the
    // evaluation is NOT exactly antisymmetric under a 180° rotation — DESIGN
    // §5.8's relocation rule breaks ties by "lowest square index" and `s ↦ 99 −
    // s` reverses that order, which is why M12's bench measures
    // `symmetryMismatch` with the three relocation features removed.
    const units = [
      { def: 'fire_1' as const, owner: 'white' as const, x: 4, y: 4 },
      { def: 'plant_1' as const, owner: 'black' as const, x: 4, y: 5 },
    ];
    const whiteToMove = buildState({ current: 'white', phase: 'action', actions: 4, victoryRule: 'elimination', units });
    const blackToMove = buildState({ current: 'black', phase: 'action', actions: 4, victoryRule: 'elimination', units });

    const a = prepare(whiteToMove, 400_000);
    const white = pvs(a.ctx, a.p, 2, -INF, INF, 0, 0);
    expect(white).toBeGreaterThan(MATE_BOUND_CC);

    const b = prepare(blackToMove, 400_000);
    const black = pvs(b.ctx, b.p, 3, -INF, INF, 0, 0);
    // Black moves, White answers with the elimination: from Black's point of
    // view the position is lost.
    expect(black).toBeLessThan(0);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file

  it('a one-ply search prefers a kill to a quiet move', () => {
    const state = buildState({
      current: 'white',
      phase: 'action',
      actions: 4,
      units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 4, y: 5 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
    });
    const prepared = prepare(state, 800_000);
    const result = iterativeDeepening(prepared.ctx, prepared.p);
    expect(result.best).not.toBeNull();
    // The chosen turn takes material: its flags say so, and the score is above
    // the quiet baseline.
    expect((result.best as { flags: number }).flags & TurnFlag.KILL).not.toBe(0);
  }, 60_000); // explicit per-test budget; see the E0.5 timeout note at the top of this file
});
