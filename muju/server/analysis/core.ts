import type { AIAction } from '../../src/ai/types';
import { applyAction } from '../../src/ai/simulate';
import { isLegalAction } from '../../src/game/legality';
import type { GameState, PlayerId } from '../../src/game/types';
import type { RoomAction } from '../../src/online/types';
import { defaultUpkeepAction } from '../../src/game/upkeep';
import { describeAction } from '../notation';
import { RoomError } from '../schema';
import { createHash } from 'node:crypto';

export type Proof = 'proven_possible' | 'proven_impossible' | 'unknown';
export class WorkBudget {
  readonly started = performance.now();
  nodes = 0;
  collapsed = 0;
  cutoffReason: 'node_limit' | 'time_limit' | 'cancelled' | null = null;
  private childCutoffs = new Set<string>();
  constructor(readonly maxNodes: number, readonly maxMs: number, private signal?: AbortSignal) {}
  get remainingMs() { return Math.max(0, this.maxMs - (performance.now() - this.started)); }
  fork(maxNodes: number, maxMs: number) {
    return new WorkBudget(Math.max(0, Math.min(maxNodes, this.maxNodes - this.nodes)), Math.max(0, Math.min(maxMs, this.remainingMs)), this.signal);
  }
  absorb(child: WorkBudget) {
    this.nodes += child.nodes; this.collapsed += child.collapsed;
    if (child.cutoffReason) this.childCutoffs.add(child.cutoffReason);
    for (const reason of child.childCutoffs) this.childCutoffs.add(reason);
  }
  available() {
    if (this.cutoffReason) return false;
    if (this.signal?.aborted) this.cutoffReason = 'cancelled';
    else if (performance.now() - this.started >= this.maxMs) this.cutoffReason = 'time_limit';
    else if (this.nodes >= this.maxNodes) this.cutoffReason = 'node_limit';
    return this.cutoffReason === null;
  }
  spend() { if (!this.available()) return false; this.nodes++; return true; }
  report(complete = true, omittedCaseClasses: string[] = []) {
    return { completeness: complete && !this.cutoffReason && !omittedCaseClasses.length ? 'complete' : 'bounded',
      nodes: this.nodes, maxNodes: this.maxNodes, maxMs: this.maxMs, elapsedMs: Math.round((performance.now() - this.started) * 10) / 10,
      cutoffReason: this.cutoffReason, subsearchCutoffs: [...this.childCutoffs], omittedCaseClasses, collapsed: this.collapsed };
  }
}

/** Same single-seat validation and home-mate cancellation as RoomStore.preview.
 * Room-only undo/preferences require private history and are deliberately rejected. */
export function simulateSequence(source: GameState, actions: RoomAction[], onTransition?: (before: GameState, action: AIAction, after: GameState) => void) {
  let state = source;
  const applied: AIAction[] = [], player = source.turn.currentPlayer;
  for (const [index, action] of actions.entries()) {
    if (action.type === 'UNDO' || action.type === 'SET_UPKEEP_REVIEW') {
      throw new RoomError(422, 'UNSUPPORTED_HYPOTHETICAL', `${action.type} requires the room preview tool; analysis accepts board actions only.`);
    }
    if (!isLegalAction(state, action, player)) throw new RoomError(422, 'ILLEGAL_ACTION', `Hypothetical action ${index + 1} (${action.type}) is illegal. No room changes were made.`);
    const before = state;
    state = applyAction(state, action); applied.push(action); onTransition?.(before, action, state);
    if (state.phase === 'victory' && state.victoryReason === 'home-checkmate') break;
  }
  return { state, applied };
}

export interface TurnModel {
  state: GameState;
  setupActions: AIAction[];
  assumptions: string[];
}
/** Use actual turn transitions; never give the incoming attacker its future harvest. */
export function turnFor(source: GameState, player: PlayerId): TurnModel {
  if (source.turn.currentPlayer === player || source.phase !== 'playing') return { state: source, setupActions: [], assumptions: ['current state; no income, healing or action reset added'] };
  let state = source;
  const setupActions: AIAction[] = [];
  const step = (action: AIAction) => { state = applyAction(state, action); setupActions.push(action); };
  if (state.upkeepPending) step(defaultUpkeepAction(state));
  if (state.phase === 'playing' && state.turn.phase === 'place') step({ type: 'END_PLACE_PHASE' });
  if (state.phase === 'playing') step({ type: 'END_ACTION_PHASE' });
  return { state, setupActions, assumptions: [
    'current player ends now; pending upkeep uses the engine default keep-set',
    'outgoing harvest credited; incoming upkeep/healing/AP reset follow engine; incoming harvest not credited',
    'automatic upkeep is retained; voluntary undo of that payment is not searched',
  ] };
}
export function modelDescription(model: TurnModel) {
  const s = model.state;
  return { stateKind: model.setupActions.length ? 'opponentNextTurn' : 'current', actor: s.turn.currentPlayer,
    turn: s.turn.turnNumber, phase: s.upkeepPending ? 'upkeep' : s.turn.phase, status: s.phase,
    treasury: s.players[s.turn.currentPlayer].resources, setupActions: model.setupActions.map(describeAction), assumptions: model.assumptions };
}
export function actionReady(source: GameState) {
  let state = source;
  const actions: AIAction[] = [];
  if (state.phase === 'playing' && state.upkeepPending) {
    const action = defaultUpkeepAction(state); state = applyAction(state, action); actions.push(action);
  }
  if (state.phase === 'playing' && state.turn.phase === 'place') {
    const action: AIAction = { type: 'END_PLACE_PHASE' }; state = applyAction(state, action); actions.push(action);
  }
  return { state, actions };
}

/** All fields that affect legal continuations. UI/history telemetry is excluded. */
export function tacticalKey(s: GameState): string {
  return createHash('sha256').update(JSON.stringify([s.phase, s.winner, s.turn, !!s.upkeepPending, s.players.white.resources, s.players.black.resources,
    s.progressThisTurn, s.inactivityPlies, s.board.units.map(u => [u.id, u.definitionId, u.owner, u.position.x, u.position.y,
      u.damageTaken, u.canActThisTurn, u.hasAttacked, u.placedThisTurn, u.promotedThisPlacement, u.lastAttackKilled, u.attackedThisTurn])])).digest('hex');
}
