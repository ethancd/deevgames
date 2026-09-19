/** Author-time refusal of decisions that sit on an uncredited mover win.
 *
 * A macro-decision is only a decision if the root mover cannot simply end the
 * game in its own favour by a line the case's own accept predicate refuses to
 * credit. v1 shipped nine summon-disruption roots and four tactics roots where
 * the mover had a legal home entry that wins, while accept demanded a
 * non-terminal endpoint (or a specific own-Act capture), so winning scored
 * zero. This probe enumerates those wins canonically and refuses the case.
 *
 * The probe is canonical-only: it never consults the Hard engine, a corpus, an
 * opening or any measured outcome. It asks two questions the rules answer:
 * the canonical victory check over the mover's own reachable Act states, and
 * analyzeHomeDefenseEvidence over any home occupation those states establish.
 */
import { applyAction, transitionWithoutCheckmate } from '../../../../src/ai/simulate';
import { isLegalAction, phaseEndAction } from '../../../../src/game/legality';
import { getValidMoves } from '../../../../src/game/movement';

import { defaultUpkeepAction } from '../../../../src/game/upkeep';
import { checkVictory, getHomeOccupier } from '../../../../src/game/victory';
import { analyzeHomeDefenseEvidence } from '../../../../src/game/homeCheckmate';
import { continueHorizon, replayMacro, semanticHash } from './canonical';
import type { CanonicalTrace } from './canonical';
import { evaluateDecision } from './predicates';
import type { AIAction, GameState, MacroDecision, PhasingCase, PhasingPosition, PositionRef } from './format';

/** Home-defence proof budget for the author-time probe. Matches the canonical
 * default used by resolveHomeCheckmate so the probe cannot be more generous
 * than the rule that would actually award the win in play. */
export const VETO_PROOF_NODES = 20000;
/** Distinct mover Act states the probe will expand before it refuses to answer.
 * Exhausting the bound is a refusal, never a clean bill of health. */
export const VETO_STATE_BUDGET = 200_000;

export interface UncreditedWin {
  /** The mover's own actions, from the root, that reach the win. */
  actions: AIAction[];
  /** How the win is established. */
  via: 'canonical-victory' | 'home-mate';
  reason: GameState['victoryReason'] | 'home-mate';
  /** Status the case's own accept predicate gives that winning line. */
  acceptStatus: 'fail' | 'indeterminate';
}
export class VetoError extends Error {
  constructor(readonly caseId: string, readonly wins: UncreditedWin[], readonly exhausted: boolean) {
    super(exhausted
      ? `free-win veto: ${caseId} exhausted the ${VETO_STATE_BUDGET}-state canonical probe budget; absence of an uncredited mover win is unproven`
      : `free-win veto: ${caseId} leaves the root mover ${wins.length} winning line(s) its accept predicate does not credit, e.g. ${JSON.stringify(wins[0]?.actions)} (${wins[0]?.reason})`);
    this.name = 'VetoError';
  }
}

/** Finish the mover's turn with the canonical pass-only completion, then apply
 * the case's declared horizon. Returns null when the line cannot be completed. */
function settle(root: GameState, prefix: readonly AIAction[], horizon: MacroDecision['horizon']): CanonicalTrace | null {
  let state = root;
  const line = [...prefix];
  for (const action of prefix) {
    if (!isLegalAction(state, action)) return null;
    const next = applyAction(state, action);
    if (semanticHash(next) === semanticHash(state)) return null;
    state = next;
  }
  for (let n = 0; n < 8 && state.phase === 'playing' && state.turn.currentPlayer === root.turn.currentPlayer; n++) {
    const action = state.upkeepPending ? defaultUpkeepAction(state, true) : phaseEndAction(state);
    if (!isLegalAction(state, action)) return null;
    const next = applyAction(state, action);
    if (semanticHash(next) === semanticHash(state)) return null;
    line.push(action); state = next;
  }
  try { return continueHorizon(replayMacro(root, line), horizon); } catch { return null; }
}

/** Every action the mover may take from one of its own states inside its turn. */
function moverActions(state: GameState): AIAction[] {
  const mover = state.turn.currentPlayer, actions: AIAction[] = [];
  if (state.turn.phase === 'action') {
    for (const unit of state.board.units.filter(u => u.owner === mover)) {
      for (const to of getValidMoves(unit, state.board)) actions.push({ type: 'MOVE', unitId: unit.id, to });
      for (const enemy of state.board.units.filter(u => u.owner !== mover)) actions.push({ type: 'ATTACK', unitId: unit.id, targetPosition: enemy.position });
    }
    return actions;
  }
  // A Prepare root can still convert an occupation by promoting its occupier.
  // isLegalAction is the filter; affordability and tier are canonical concerns.
  for (const unit of state.board.units.filter(u => u.owner === mover)) actions.push({ type: 'PROMOTE_UNIT', unitId: unit.id });
  return actions;
}

/** Is this state worth settling? Only the two canonical routes to a terminal
 * endpoint are searched: the victory check over the board, and a home
 * occupation this state establishes. A pass-only upkeep collapse of the
 * defender is out of scope and stated as such in the v2 preregistration. */
function couldTerminate(state: GameState, mover: GameState['turn']['currentPlayer']): boolean {
  return state.phase === 'victory' || checkVictory(state.board).status === 'victory' || !!getHomeOccupier(state.board, mover);
}
/** Does this state establish a home occupation the defender provably cannot
 * answer? Adjudicated on the settled Prepare snapshot, the only boundary at
 * which Phasing awards home-checkmate; an occupier released by its own upkeep
 * never mates, and the canonical analysis is what says so. */
function establishesHomeMate(state: GameState, mover: GameState['turn']['currentPlayer']): boolean {
  if (state.phase !== 'playing' || !getHomeOccupier(state.board, mover)) return false;
  let prepare = state;
  for (let n = 0; n < 4 && prepare.phase === 'playing' && prepare.turn.phase === 'action'; n++) {
    const action = phaseEndAction(prepare);
    if (!isLegalAction(prepare, action)) return false;
    const next = applyAction(prepare, action);
    if (semanticHash(next) === semanticHash(prepare)) return false;
    prepare = next;
  }
  if (prepare.phase !== 'playing' || prepare.upkeepPending || !getHomeOccupier(prepare.board, mover)) return false;
  return analyzeHomeDefenseEvidence(prepare, mover, transitionWithoutCheckmate, VETO_PROOF_NODES).result === 'mate';
}

/** Enumerate the root mover's own winning lines whose win the case's accept
 * predicate does not credit. An empty array is the only clean result. */
export function uncreditedMoverWins(c: MacroDecision, root: GameState, budget = VETO_STATE_BUDGET): { wins: UncreditedWin[]; exhausted: boolean } {
  if (root.phase !== 'playing') throw new Error(`veto probe requires a playing root (${c.id})`);
  const mover = root.turn.currentPlayer, wins: UncreditedWin[] = [];
  const seen = new Set<string>([semanticHash(root)]);
  let frontier: { state: GameState; path: AIAction[] }[] = [{ state: root, path: [] }];
  let expanded = 0;
  const record = (state: GameState, path: AIAction[]): void => {
    if (!couldTerminate(state, mover)) return;
    const trace = settle(root, path, c.horizon);
    // A line the canonical replay cannot complete is not a usable win.
    if (!trace) return;
    // Two independent grounds. The declared horizon may itself end the game in
    // the mover's favour; or the line may force a home mate the horizon is too
    // short to show, which is still a win the accept predicate must credit.
    const terminal = trace.endpoint.phase === 'victory' && trace.endpoint.winner === mover;
    const mate = !terminal && establishesHomeMate(state, mover);
    if (!terminal && !mate) return;
    const credited = evaluateDecision(c, trace);
    if (credited.status === 'pass') return;
    wins.push({ actions: [...path], via: mate ? 'home-mate' : 'canonical-victory',
      reason: mate ? 'home-mate' : trace.endpoint.victoryReason, acceptStatus: credited.status });
  };
  for (let depth = 0; depth <= root.turn.actionsRemaining && frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      if (node.path.length) record(node.state, node.path);
      if (depth === root.turn.actionsRemaining) continue;
      if (node.state.phase !== 'playing' || node.state.turn.currentPlayer !== mover) continue;
      for (const action of moverActions(node.state)) {
        if (++expanded > budget) return { wins, exhausted: true };
        if (!isLegalAction(node.state, action)) continue;
        const after = applyAction(node.state, action);
        const key = semanticHash(after);
        if (key === semanticHash(node.state) || seen.has(key)) continue;
        seen.add(key);
        next.push({ state: after, path: [...node.path, action] });
      }
    }
    frontier = next;
  }
  return { wins, exhausted: false };
}

/** Refuse a decision whose root hands the mover a win its accept cannot score.
 * `allow-root-mover-win` cases credit the win, so they pass this probe by
 * construction rather than by exemption: evaluateDecision returns pass. */
export function assertNoUncreditedWin(c: MacroDecision, root: GameState, budget = VETO_STATE_BUDGET): void {
  const { wins, exhausted } = uncreditedMoverWins(c, root, budget);
  if (exhausted || wins.length) throw new VetoError(c.id, wins, exhausted);
}

/** Apply the veto to every macro-decision in a v2 suite document. */
export function vetoUncreditedWins(cases: readonly PhasingCase[], resolve: (ref: PositionRef) => PhasingPosition, budget = VETO_STATE_BUDGET): void {
  for (const c of cases) if (c.kind === 'macro-decision') assertNoUncreditedWin(c, resolve(c.root).state, budget);
}
