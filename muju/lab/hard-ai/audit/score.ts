/**
 * The bounded preference signal for E2.1 step 4.
 *
 * THIS IS NOT STRENGTH. Everything here is the engine's own STATIC evaluation —
 * `eval/turnScore.ts withinTurnScore` at ply 0, the one closure `engine.ts`,
 * `analyze/engine.ts` and `recall/run.ts` share for the within-turn score — read
 * off a position with no search, no reply, no quiescence. It answers one
 * question: at the moment a place phase ends (or a whole turn ends), does the
 * evaluator prefer a position reached with two or more promotions to the best
 * position reachable with at most one? A difference here is a claim about the
 * SHORTLIST's reachable set under the shipped evaluation, not a claim that the
 * multi-promotion turn wins games.
 *
 * Two depths are offered because they disagree in a way worth reporting.
 *
 *   `placeOnly` — score the position the place phase leaves. Cheap, and blind
 *   to the whole point of a KILL-mission promotion, whose payoff is the strike
 *   it enables in the action phase.
 *   `withActions` — enumerate the action phase from that position through the
 *   canonical rules (capped) and take the best static end score. Much slower,
 *   and it is the honest comparison for promotions bought in order to hit.
 */
import type { GameState } from '../../../src/game/types';
import { applyAction } from '../../../src/ai/simulate';
import { generateAllActions } from '../../../src/ai/moves';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { Evaluator } from '../../../src/ai/hard/eval/evaluate';
import { withinTurnScore } from '../../../src/ai/hard/eval/turnScore';
import { MATE_PLY_CC, WIN_CC, type Centi, type Side } from '../../../src/ai/hard/types';
import type { HardConfig } from '../../../src/ai/hard/config';

export class StaticScorer {
  private readonly rep = new Replica();
  private readonly sc = new Scratch(8, 8, 4, 4);
  private readonly evaluator: Evaluator;

  constructor(weights: HardConfig['weights']) {
    this.evaluator = new Evaluator(this.rep, weights);
  }

  /**
   * `stage0 + stage1` from `mover`'s point of view, or the terminal score when
   * the position is decided. `null` when the replica refuses the position.
   */
  score(state: GameState, mover: Side): Centi | null {
    if (state.phase === 'victory') {
      const magnitude = WIN_CC - MATE_PLY_CC;
      const winnerSide: Side | null = state.winner === null ? null : state.winner === 'white' ? 0 : 1;
      if (winnerSide === null) return 0;
      return winnerSide === mover ? magnitude : -magnitude;
    }
    let p;
    try {
      p = this.rep.pack(state, allocState());
    } catch {
      return null;
    }
    return withinTurnScore(this.evaluator, p, mover, this.sc, 1);
  }
}

export interface Completion {
  best: Centi | null;
  /** Turn-boundary positions visited. */
  ends: number;
  capped: boolean;
  visits: number;
}

/**
 * Best static end-of-turn score reachable from `state` by playing out the
 * ACTION phase only, through the canonical rules. `state` must already be in
 * the action phase (or the game over there). Mid-turn transpositions are
 * deduped by the turn-key `verify/perft.ts` uses, exactly as
 * `exam/witness.ts enumerateTurnEnds` does.
 */
export function bestActionCompletion(
  state: GameState,
  scorer: StaticScorer,
  mover: Side,
  maxVisits = 40_000,
): Completion {
  const rootPlayer = state.turn.currentPlayer;
  const rootTurnNumber = state.turn.turnNumber;
  const seen = new Set<string>();
  const rep = new Replica();
  const buf = allocState();
  let best: Centi | null = null;
  let ends = 0;
  let visits = 0;
  let capped = false;

  const take = (end: GameState): void => {
    ends++;
    const s = scorer.score(end, mover);
    if (s !== null && (best === null || s > best)) best = s;
  };

  if (state.phase !== 'playing' || state.turn.currentPlayer !== rootPlayer) {
    take(state);
    return { best, ends, capped, visits };
  }

  const visit = (s: GameState): void => {
    if (capped) return;
    if (visits >= maxVisits) {
      capped = true;
      return;
    }
    visits++;
    try {
      const p = rep.pack(s, buf);
      const key = `${(p.kturnHi >>> 0).toString(16)}:${(p.kturnLo >>> 0).toString(16)}`;
      if (seen.has(key)) return;
      seen.add(key);
    } catch {
      // A position the replica refuses is still walked; only the dedup is lost.
    }
    for (const action of generateAllActions(s, s.turn.currentPlayer)) {
      if (capped) return;
      const next = applyAction(s, action);
      if (next === s) continue;
      const done = next.phase !== 'playing' || next.turn.currentPlayer !== rootPlayer || next.turn.turnNumber !== rootTurnNumber;
      if (done) take(next);
      else visit(next);
    }
  };

  visit(state);
  return { best, ends, capped, visits };
}
