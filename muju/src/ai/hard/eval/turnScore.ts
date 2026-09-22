/**
 * DESIGN §5.4's within-turn score, in one place.
 *
 * `engine.ts`'s `ctx.score` is the definition: a turn that ENDS the game scores
 * the terminal (`ActionSearch` records mid-turn terminals too, and on those
 * `p.side` has not flipped, so the mover cannot be read off the state);
 * otherwise it is `stage0 + stage1` from the mover's side, PLUS the pending
 * summon credit.
 *
 * The credit is not an optional extra. Under Phasing a bought unit is a
 * PENDING summon whose value lives in stage 2 (`F.PendingValue`), which the
 * within-turn score never reaches, so without it every BUY reads as −100 cc per
 * crystal spent and the K cut (`gen/generate.ts`) evicts buying turns before
 * search ever sees them. It shipped unconditionally on 2026-09-20; see
 * `docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md`.
 *
 * Every lab instrument and generator test that builds its own scorer closure
 * calls this, so `hard:recall`, `hard:analyze`, `hard:audit`, `hard:coverage`
 * and the P6 bench describe the generator that actually plays.
 */
import type { Centi, PackedState, Side } from '../types';
import type { Scratch } from '../core/bits';
import { Evaluator, terminalScore } from './evaluate';

/**
 * `(pendCostSum[mover] − pendCostSum[other]) · 100`: the principal already paid
 * into pending summons, in centi-crystals, from the mover's point of view.
 * `pendCostSum` is maintained incrementally by the replica, so this is free.
 */
export const pendingCreditCc = (p: PackedState, mover: Side): Centi =>
  (p.pendCostSum[mover] - p.pendCostSum[1 - mover]) * 100;

/** The within-turn score itself: terminal, else stage0 + stage1 + the credit. */
export function withinTurnScore(
  evaluator: Evaluator,
  p: PackedState,
  mover: Side,
  scratch: Scratch,
  ply: number,
): Centi {
  const terminal = terminalScore(p, mover, ply);
  if (terminal !== null) return terminal;
  return evaluator.stage0(p, mover) + evaluator.stage1(p, mover, scratch, ply) + pendingCreditCc(p, mover);
}
