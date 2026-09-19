/**
 * The id-independent hash of what actually happened in a Gate 1 game.
 *
 * Preregistration amendment A3 §2: "The report hashes every game's action
 * sequence. A cell whose number of distinct games is below 90% of its game count
 * is INVALID." That statistic is only meaningful if two identical games hash the
 * same, and unit ids are minted with `Date.now()` and `Math.random()`
 * (`src/game/board.ts`), both at setup and for every purchase that arrives. So
 * the hash is taken over the SQUARE-based form of each action — the same
 * portable form the opening book itself is stored in
 * (`ladder/openings.ts#actionToOpeningAction`) — together with the turn number,
 * the side to move and the phase the action was taken in.
 *
 * Two games that would replay into each other hash the same; two games that
 * diverge at any decision do not.
 */
import { createHash } from 'node:crypto';
import type { AIAction } from '../../src/ai/types';
import type { GameState, Position } from '../../src/game/types';

const square = (p: Position) => `${p.x},${p.y}`;

/** The square a unit stands on in `before`. Throws rather than guess: every
 * id-bearing action is legality-checked against this position by the harness,
 * so a missing unit is a defect in the runner, not a game event. */
function squareOf(before: GameState, unitId: string, where: string): string {
  const unit = before.board.units.find(u => u.id === unitId);
  if (!unit) throw new Error(`${where}: no unit ${unitId} on the board in this position`);
  return square(unit.position);
}

/** One action, written so it names no minted id. */
export function canonicalAction(before: GameState, action: AIAction): string {
  const where = `gate1 trace (turn ${before.turn.turnNumber}, ${before.turn.currentPlayer})`;
  switch (action.type) {
    case 'MOVE':
      return `M ${squareOf(before, action.unitId, where)} ${square(action.to)}`;
    case 'ATTACK':
      return `A ${squareOf(before, action.unitId, where)} ${square(action.targetPosition)}`;
    case 'PROMOTE_UNIT':
      return `P ${squareOf(before, action.unitId, where)}`;
    case 'BUY_UNIT':
      return `B ${action.definitionId} ${square(action.position)}`;
    case 'PAY_UPKEEP':
      return `U ${action.keepUnitIds.map(id => squareOf(before, id, where)).sort().join('|')}`;
    case 'END_ACTION_PHASE':
      return 'EA';
    case 'END_PLACE_PHASE':
      return 'EP';
    case 'RESIGN':
      return 'R';
  }
}

/** The context an action was taken in, so a reordered game cannot collide with an identical one. */
export function canonicalStep(before: GameState, action: AIAction): string {
  const phase = before.upkeepPending ? 'upkeep' : before.turn.phase;
  return `${before.turn.turnNumber}/${before.turn.currentPlayer}/${phase}/${canonicalAction(before, action)}`;
}

/** Accumulates the canonical steps of one game and hashes them. */
export function createTraceHasher(opening: string, handicap: number) {
  const steps: string[] = [];
  return {
    steps,
    push(before: GameState, action: AIAction) {
      steps.push(canonicalStep(before, action));
    },
    /** Start position included: the same moves from two openings are two games. */
    digest(): string {
      return createHash('sha256').update(JSON.stringify({ opening, handicap, steps })).digest('hex');
    },
  };
}
