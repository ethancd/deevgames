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
 * the canonical victory check over the mover's own reachable states, and
 * analyzeHomeDefenseEvidence over any home occupation those states establish.
 *
 * ## Why the enumeration has two stages
 *
 * A Phasing turn is Act (four AP of MOVE/ATTACK) -> END_ACTION_PHASE -> income
 * and upkeep -> Prepare (`turn.phase === 'place'`, `actionsRemaining === 0`)
 * -> END_PLACE_PHASE -> hand-off. `resolveHomeCheckmate` refuses to award a
 * mate while `turn.phase !== 'place'`, so *every* home-checkmate win is
 * awarded at the Prepare boundary, after the mover's own upkeep has had its
 * chance to release the occupier. A single-stage BFS bounded by
 * `actionsRemaining` can therefore never see the HOME_FORTIFY motif — enter
 * the corner in Act, then buy the occupier's survival with a promotion in
 * Prepare — and on a Prepare root (`actionsRemaining === 0`, which canonical
 * Phasing sets on entering Prepare) it expands nothing at all.
 *
 * Stage 1 is the Act BFS over MOVE/ATTACK, bounded by `actionsRemaining`
 * because no legal MOVE or ATTACK costs zero AP. Stage 2 takes every Act
 * endpoint at which the mover occupies the enemy corner (and a Prepare root
 * directly), applies END_ACTION_PHASE and then the canonical upkeep — every
 * affordable keep-set when a PAY_UPKEEP choice is pending, because releasing a
 * unit is how a mover frees the crystals a mating promotion costs. Stage 3
 * searches the legal PROMOTE_UNIT subsets of the resulting Prepare snapshot.
 * Canonical allows at most one promotion per unit per placement phase
 * (`canPromote` refuses `promotedThisPlacement`), so a subset is a choice of
 * units, and `applyAction` re-adjudicates home checkmate after each one, which
 * is why the probe tests for a win after EVERY promotion and again at
 * END_PLACE_PHASE rather than only at the end of the subset.
 *
 * ## Completeness claim, and what bounds it
 *
 * Inside the mover's own turn the canonical routes to a mover win are:
 * elimination by an Act ATTACK (seen at the Act node); home checkmate at the
 * Prepare boundary (needs a mover home occupier); and home occupation at the
 * mover's next `startTurn` under the case's declared horizon (also needs a
 * mover home occupier). Upkeep only ever releases the *mover's* own units, so
 * it cannot eliminate the defender, and a promotion cannot either. Stage 2/3
 * is therefore run exactly where a mover home occupier exists, which is what
 * keeps the probe affordable without giving up a win it could have found.
 *
 * Out of scope, stated so it is not mistaken for coverage: BUY_UNIT in Prepare
 * (a commitment cannot arrive before the mover's next turn, and home blocks
 * every purchase rectangle), and a win produced by the scripted pass-only
 * continuation starving the defender's upkeep.
 *
 * Every bound below FAILS CLOSED: hitting one records an exhaustion reason and
 * `assertNoUncreditedWin` throws, so an unanswered case is refused rather than
 * passed.
 */
import { applyAction, transitionWithoutCheckmate } from '../../../../src/ai/simulate';
import { isLegalAction, phaseEndAction } from '../../../../src/game/legality';
import { getValidMoves } from '../../../../src/game/movement';

import { defaultUpkeepAction, unitUpkeep, upkeepActions } from '../../../../src/game/upkeep';
import { checkVictory, getHomeOccupier } from '../../../../src/game/victory';
import { analyzeHomeDefenseEvidence } from '../../../../src/game/homeCheckmate';
import { continueHorizon, replayMacro, semanticHash } from './canonical';
import type { CanonicalTrace } from './canonical';
import { evaluateDecision } from './predicates';
import type { AIAction, GameState, MacroDecision, PhasingCase, PhasingPosition, PlayerId, PositionRef } from './format';

/** Home-defence proof budget for the author-time probe. Matches the canonical
 * default used by resolveHomeCheckmate so the probe cannot be more generous
 * than the rule that would actually award the win in play. */
export const VETO_PROOF_NODES = 20000;
/** Distinct mover states the probe will expand before it refuses to answer.
 * Exhausting the bound is a refusal, never a clean bill of health. */
export const VETO_STATE_BUDGET = 200_000;
/** Canonical `upkeepActions` enumerates keep-sets exhaustively up to this many
 * rent-bearing units and degrades to four heuristic sets above it. Above the
 * bound the probe refuses rather than search a subset of the mover's choices. */
export const VETO_UPKEEP_UNIT_BOUND = 12;
/** Promotable units the probe will take subsets of from one Prepare snapshot;
 * 2^12 subsets. Above the bound the probe refuses. */
export const VETO_PROMOTION_UNIT_BOUND = 12;

/** The declared bounds, so a report can state them without re-deriving them. */
export const VETO_BOUNDS = Object.freeze({
  states: VETO_STATE_BUDGET, proofNodes: VETO_PROOF_NODES,
  upkeepUnits: VETO_UPKEEP_UNIT_BOUND, promotableUnits: VETO_PROMOTION_UNIT_BOUND,
});

export interface UncreditedWin {
  /** The mover's own actions, from the root, that reach the win. */
  actions: AIAction[];
  /** How the win is established. */
  via: 'canonical-victory' | 'home-mate';
  reason: GameState['victoryReason'] | 'home-mate';
  /** Which enumeration stage reached it; 'prepare' means the line needed the
   * mover's own upkeep and/or a promotion, which a single-stage probe misses. */
  stage: 'act' | 'prepare';
  /** Status the case's own accept predicate gives that winning line. */
  acceptStatus: 'fail' | 'indeterminate';
}
export interface VetoOutcome {
  wins: UncreditedWin[];
  /** True when a declared bound was hit: the case is refused, not cleared. */
  exhausted: boolean;
  /** Which bound, when one was hit. */
  exhaustedReason?: string;
  /** Canonical transitions charged against the state budget. */
  expanded: number;
}
export class VetoError extends Error {
  constructor(readonly caseId: string, readonly wins: UncreditedWin[], readonly exhausted: boolean, readonly exhaustedReason?: string) {
    super(exhausted
      ? `free-win veto: ${caseId} hit a declared probe bound (${exhaustedReason ?? `${VETO_STATE_BUDGET} states`}); absence of an uncredited mover win is unproven`
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

/** Every Act action the mover may take from one of its own Act states. Prepare
 * actions are enumerated by the dedicated upkeep/promotion stages instead,
 * because they need the canonical END_ACTION_PHASE transition first. */
function actActions(state: GameState): AIAction[] {
  const mover = state.turn.currentPlayer, actions: AIAction[] = [];
  for (const unit of state.board.units.filter(u => u.owner === mover)) {
    for (const to of getValidMoves(unit, state.board)) actions.push({ type: 'MOVE', unitId: unit.id, to });
    for (const enemy of state.board.units.filter(u => u.owner !== mover)) actions.push({ type: 'ATTACK', unitId: unit.id, targetPosition: enemy.position });
  }
  return actions;
}

/** Is this state worth settling? Only the two canonical routes to a terminal
 * endpoint are searched: the victory check over the board, and a home
 * occupation this state establishes. A pass-only upkeep collapse of the
 * defender is out of scope and stated as such in the v2 preregistration. */
function couldTerminate(state: GameState, mover: PlayerId): boolean {
  return state.phase === 'victory' || checkVictory(state.board).status === 'victory' || !!getHomeOccupier(state.board, mover);
}
/** Does this state establish a home occupation the defender provably cannot
 * answer? Adjudicated on the settled Prepare snapshot, the only boundary at
 * which Phasing awards home-checkmate; an occupier released by its own upkeep
 * never mates, and the canonical analysis is what says so. */
function establishesHomeMate(state: GameState, mover: PlayerId): boolean {
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

/** Is this a mover Prepare snapshot with no pending upkeep, i.e. the snapshot
 * on which promotions are legal and home checkmate is adjudicated? */
const isOpenPrepare = (state: GameState, mover: PlayerId): boolean =>
  state.phase === 'playing' && state.turn.currentPlayer === mover && state.turn.phase === 'place' && !state.upkeepPending;

/** Enumerate the root mover's own winning lines whose win the case's accept
 * predicate does not credit. An empty array with `exhausted: false` is the
 * only clean result. */
export function uncreditedMoverWins(c: MacroDecision, root: GameState, budget = VETO_STATE_BUDGET): VetoOutcome {
  if (root.phase !== 'playing') throw new Error(`veto probe requires a playing root (${c.id})`);
  const mover = root.turn.currentPlayer, wins: UncreditedWin[] = [];
  // Act and Prepare keep separate visited sets: an Act de-duplication must
  // never be able to suppress the Prepare continuation of the same position.
  const actSeen = new Set<string>([semanticHash(root)]);
  const prepareSeen = new Set<string>();
  let expanded = 0;
  let exhaustedReason: string | undefined;
  const bound = (reason: string): void => { exhaustedReason ??= reason; };
  const spend = (): boolean => {
    if (exhaustedReason) return false;
    if (++expanded > budget) { bound(`canonical state budget ${budget}`); return false; }
    return true;
  };
  const record = (state: GameState, path: AIAction[], stage: UncreditedWin['stage']): void => {
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
    wins.push({ actions: [...path], via: mate ? 'home-mate' : 'canonical-victory', stage,
      reason: mate ? 'home-mate' : trace.endpoint.victoryReason, acceptStatus: credited.status });
  };
  /** Stage 3. Subsets of the legal promotions on one open Prepare snapshot.
   * Each unit may promote at most once per placement phase, so a subset is a
   * choice of units; canonical re-adjudication after each promotion is why
   * every intermediate state is recorded, not only the full subset. */
  const promotions = (state: GameState, path: AIAction[]): void => {
    const promotable = state.board.units.filter(u => u.owner === mover && isLegalAction(state, { type: 'PROMOTE_UNIT', unitId: u.id }));
    if (promotable.length > VETO_PROMOTION_UNIT_BOUND) {
      bound(`promotable units ${promotable.length} exceeds the ${VETO_PROMOTION_UNIT_BOUND}-unit subset bound`);
      return;
    }
    const visit = (index: number, current: GameState, line: AIAction[]): void => {
      if (exhaustedReason || index === promotable.length) return;
      // Decline this unit.
      visit(index + 1, current, line);
      if (exhaustedReason) return;
      const action: AIAction = { type: 'PROMOTE_UNIT', unitId: promotable[index].id };
      // Affordability moves with the subset, so legality is re-asked here.
      if (!isLegalAction(current, action) || !spend()) return;
      const next = applyAction(current, action);
      if (semanticHash(next) === semanticHash(current)) return;
      const taken = [...line, action], key = semanticHash(next);
      if (!prepareSeen.has(key)) { prepareSeen.add(key); record(next, taken, 'prepare'); }
      // Canonical already awarded the win; no further Prepare action is legal.
      if (next.phase !== 'playing') return;
      visit(index + 1, next, taken);
    };
    visit(0, state, path);
  };
  /** Stage 2b. Settle a mover Prepare snapshot's upkeep, then promote. */
  const prepareFrom = (state: GameState, path: AIAction[]): void => {
    if (exhaustedReason || state.phase !== 'playing' || state.turn.currentPlayer !== mover || state.turn.phase !== 'place') return;
    if (!state.upkeepPending) { promotions(state, path); return; }
    const renting = state.board.units.filter(u => u.owner === mover && unitUpkeep(u) > 0);
    if (renting.length > VETO_UPKEEP_UNIT_BOUND) {
      bound(`rent-bearing units ${renting.length} exceeds the ${VETO_UPKEEP_UNIT_BOUND}-unit keep-set bound`);
      return;
    }
    for (const action of upkeepActions(state)) {
      if (exhaustedReason) return;
      if (!isLegalAction(state, action)) continue;
      if (!spend()) return;
      const next = applyAction(state, action);
      if (semanticHash(next) === semanticHash(state)) continue;
      const taken = [...path, action], key = semanticHash(next);
      if (prepareSeen.has(key)) continue;
      prepareSeen.add(key);
      record(next, taken, 'prepare');
      if (isOpenPrepare(next, mover)) promotions(next, taken);
    }
  };
  /** Stage 2a. Cross the Act->Prepare boundary the way canonical play does. */
  const enterPrepare = (state: GameState, path: AIAction[]): void => {
    const action: AIAction = { type: 'END_ACTION_PHASE' };
    if (exhaustedReason || !isLegalAction(state, action) || !spend()) return;
    const next = applyAction(state, action);
    if (semanticHash(next) === semanticHash(state)) return;
    const taken = [...path, action], key = semanticHash(next);
    if (prepareSeen.has(key)) return;
    prepareSeen.add(key);
    record(next, taken, 'prepare');
    prepareFrom(next, taken);
  };

  // The root itself: a mover that already occupies, or has already eliminated
  // the defender, wins by doing nothing but completing its turn.
  record(root, [], root.turn.phase === 'action' ? 'act' : 'prepare');
  if (root.turn.phase !== 'action') {
    prepareFrom(root, []);
    return { wins, exhausted: !!exhaustedReason, ...(exhaustedReason ? { exhaustedReason } : {}), expanded };
  }
  let frontier: { state: GameState; path: AIAction[] }[] = [{ state: root, path: [] }];
  for (let depth = 0; depth <= root.turn.actionsRemaining && frontier.length && !exhaustedReason; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      if (exhaustedReason) break;
      if (node.path.length) record(node.state, node.path, 'act');
      // Stage 2/3 from every Act endpoint at which the mover occupies the
      // enemy corner: that is the only place a Prepare action can win.
      if (node.state.phase === 'playing' && node.state.turn.phase === 'action'
        && node.state.turn.currentPlayer === mover && getHomeOccupier(node.state.board, mover))
        enterPrepare(node.state, node.path);
      if (depth === root.turn.actionsRemaining) continue;
      if (node.state.phase !== 'playing' || node.state.turn.currentPlayer !== mover || node.state.turn.phase !== 'action') continue;
      for (const action of actActions(node.state)) {
        if (!spend()) return { wins, exhausted: true, exhaustedReason, expanded };
        if (!isLegalAction(node.state, action)) continue;
        const after = applyAction(node.state, action);
        const key = semanticHash(after);
        if (key === semanticHash(node.state) || actSeen.has(key)) continue;
        actSeen.add(key);
        next.push({ state: after, path: [...node.path, action] });
      }
    }
    frontier = next;
  }
  return { wins, exhausted: !!exhaustedReason, ...(exhaustedReason ? { exhaustedReason } : {}), expanded };
}

/** Refuse a decision whose root hands the mover a win its accept cannot score.
 * `allow-root-mover-win` cases credit the win, so they pass this probe by
 * construction rather than by exemption: evaluateDecision returns pass. */
export function assertNoUncreditedWin(c: MacroDecision, root: GameState, budget = VETO_STATE_BUDGET): void {
  const outcome = uncreditedMoverWins(c, root, budget);
  if (outcome.exhausted || outcome.wins.length) throw new VetoError(c.id, outcome.wins, outcome.exhausted, outcome.exhaustedReason);
}

/** Apply the veto to every macro-decision in a v2 suite document. */
export function vetoUncreditedWins(cases: readonly PhasingCase[], resolve: (ref: PositionRef) => PhasingPosition, budget = VETO_STATE_BUDGET): void {
  for (const c of cases) if (c.kind === 'macro-decision') assertNoUncreditedWin(c, resolve(c.root).state, budget);
}
