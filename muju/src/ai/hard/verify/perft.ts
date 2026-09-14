/**
 * Canonical-engine perft (DESIGN §7.2, §4). This is the "canonical half" of
 * `verify/perft.ts`: it enumerates whole macro-turns using ONLY the canonical
 * rules engine (`src/ai/moves.ts generateAllActions`, `src/ai/simulate.ts
 * applyAction`), never the packed replica. `perftReplica` (the replica half)
 * lands at M5 once `core/state.ts` exists.
 *
 * A "sequence" is a path of actions from `state` to the moment the acting
 * side's turn actually ends (the side to move changes, the turn number
 * changes, or the game leaves `phase: 'playing'` altogether -- e.g. an
 * elimination or home-checkmate mid-turn). `END_PLACE_PHASE`/`PAY_UPKEEP`
 * are ordinary intermediate actions, not sequence terminators, because a
 * macro turn spans the whole Place+Action phase (DESIGN §1).
 *
 * Two states are the "same" for dedup purposes when every unit occupies the
 * same square with the same owner/definition/damage (square-keyed, DESIGN
 * F10 §3.3 -- never keyed by the volatile unit id a BUY/PROMOTE assigns).
 *
 * `maxActions` bounds the DFS depth (actions counted BEFORE the terminal
 * one, which is always explored regardless of the cap so a sequence that
 * legitimately finishes at exactly `maxActions` actions is still counted).
 * Branches that have not terminated by the cap are abandoned, uncounted.
 * `perftTurns`/`perftMidStates` have no `maxActions` parameter (DESIGN §4);
 * they use `DEFAULT_MAX_ACTIONS`, which is exact for the initial position
 * (action-phase only, bounded by `actionsPerTurn`) and is not intended for
 * Place-phase-heavy positions -- callers enumerating those should call
 * `perftActions` directly with an explicit small `maxActions` instead (see
 * `lab/hard-ai/perft/run.ts`, which does exactly that for the 11 authored
 * fixtures). See `docs/hard-ai/design/DEVIATIONS.md` under M1 for the
 * `src/ai/moves.ts` layering note this file relies on.
 */
import type { GameState, PlayerId } from '../../../game/types';
import { generateAllActions } from '../../moves';
import { applyAction } from '../../simulate';

const DEFAULT_MAX_ACTIONS = 4;
/** Guards against an unbounded call (e.g. a heavy Place-phase position handed
 * to the parameterless functions) hanging the process instead of failing fast. */
const MAX_DFS_CALLS = 5_000_000;

function squareOf(x: number, y: number): number {
  return y * 10 + x;
}

/** Square-keyed board digest: dedupes states that differ only by which
 * concrete unit id occupies a square (BUY/PROMOTE order), per DESIGN F10. */
function boardKey(state: GameState): string {
  const parts: string[] = new Array(state.board.units.length);
  for (let i = 0; i < state.board.units.length; i++) {
    const u = state.board.units[i];
    parts[i] = `${squareOf(u.position.x, u.position.y)}:${u.owner}:${u.definitionId}:${u.damageTaken}`;
  }
  parts.sort();
  return parts.join('|');
}

function midStateKey(state: GameState): string {
  return [
    boardKey(state),
    state.turn.phase,
    state.turn.actionsRemaining,
    state.players.white.resources,
    state.players.black.resources,
    state.upkeepPending ? 1 : 0,
  ].join('#');
}

function endStateKey(state: GameState): string {
  return [
    boardKey(state),
    state.players.white.resources,
    state.players.black.resources,
    state.turn.currentPlayer,
    state.upkeepPending ? 1 : 0,
  ].join('#');
}

export interface PerftResult {
  /** Distinct legal action sequences of length <= maxActions that complete a full macro-turn. */
  sequences: number;
  /** Distinct states visited during the DFS (square-keyed, including intermediate nodes). */
  midStates: number;
  /** Distinct post-turn positions the completed sequences reach (square-keyed). */
  endPositions: number;
  /** Total DFS calls made; exposed for the `hard:perft` budget report. */
  calls: number;
}

/** Shared enumeration used by `perftActions`/`perftTurns`/`perftMidStates`
 * and by `lab/hard-ai/perft/run.ts` (which needs all three numbers per fixture
 * from one DFS pass rather than three redundant ones). */
export function enumerateTurn(root: GameState, maxActions: number): PerftResult {
  let sequences = 0;
  let calls = 0;
  const mid = new Set<string>();
  const end = new Set<string>();
  const rootPlayer: PlayerId = root.turn.currentPlayer;
  const rootTurnNumber = root.turn.turnNumber;

  function visit(state: GameState, depth: number): void {
    calls++;
    if (calls > MAX_DFS_CALLS) {
      throw new Error(
        `perft: exceeded ${MAX_DFS_CALLS} DFS calls at maxActions=${maxActions}; ` +
          'lower maxActions for this position or check for a branching regression',
      );
    }
    mid.add(midStateKey(state));
    const actions = generateAllActions(state, state.turn.currentPlayer);
    for (const action of actions) {
      const next = applyAction(state, action);
      const done =
        next.phase !== 'playing' ||
        next.turn.currentPlayer !== rootPlayer ||
        next.turn.turnNumber !== rootTurnNumber;
      if (done) {
        sequences++;
        end.add(endStateKey(next));
        continue;
      }
      if (depth + 1 > maxActions) continue;
      visit(next, depth + 1);
    }
  }
  visit(root, 0);
  return { sequences, midStates: mid.size, endPositions: end.size, calls };
}

/** Number of distinct legal action sequences of length <= maxActions from `state`
 * that complete a whole macro-turn (DESIGN §7.2, ET §8.1). Seed: perftActions(initial, 4) = 14,959. */
export function perftActions(state: GameState, maxActions: number): number {
  return enumerateTurn(state, maxActions).sequences;
}

/** Number of distinct end-of-turn positions reachable from `state` within one
 * macro-turn. Seed: perftTurns(initial) = 797. Not intended for Place-phase-heavy
 * positions; see the module doc comment. */
export function perftTurns(state: GameState): number {
  return enumerateTurn(state, DEFAULT_MAX_ACTIONS).endPositions;
}

/** Number of distinct mid-turn states visited enumerating one macro-turn from
 * `state`. Seed: perftMidStates(initial) = 1,053. */
export function perftMidStates(state: GameState): number {
  return enumerateTurn(state, DEFAULT_MAX_ACTIONS).midStates;
}
