import type { GameState, PlayerId, Unit } from './types';
import type { AIAction } from '../ai/types';
import { getHomeOccupier, getOpponent } from './victory';
import { manhattanDistance, resetUnitActions } from './board';
import { calculateAttackPower, calculateDefense, canAttack, getAttackCount, getValidAttacks } from './combat';
import { getValidMoves } from './movement';
import { getNextTierDefinition, getUnitDefinition } from './units';
import { getActionsPerTurn } from './rules';
import { unitUpkeep } from './upkeep';

type Transition = (state: GameState, action: AIAction) => GameState;
export type HomeDefense = 'rescue' | 'mate' | 'unknown';
export interface HomeDefenseEvidence {
  result: HomeDefense;
  nodes: number;
  cutoffReason: 'node_limit' | 'interrupted' | null;
  method: 'no_occupier' | 'damage_bound' | 'search';
  /** Starts before the defender's upkeep, with review enabled. */
  witness?: AIAction[];
  categories?: string[];
}
const PROOF_NODES = 20000;

/** An optimistic damage bound: ignore blockers and shared promotion/upkeep costs,
 * but charge each attacker's minimum movement and attack against the shared budget.
 * Every real rescue satisfies this bound; passing it alone never proves a rescue. */
function enoughPossibleDamage(state: GameState, target: Unit, preparing: boolean): boolean {
  const actions = state.turn.actionsRemaining, cash = state.players[state.turn.currentPlayer].resources;
  // A corner has two adjacent squares. A third distinct attacker needs both an
  // exit move and an entry move: three attacks cost at least five actions.
  let power = Array.from({ length: 3 }, () => Array<number>(actions + 1).fill(-Infinity)); power[0][0] = 0;
  for (const unit of state.board.units) {
    if (unit.owner !== state.turn.currentPlayer || (!preparing && (!canAttack(unit) || unit.attackedThisTurn?.includes(target.id)))) continue;
    const rent = preparing ? unitUpkeep(unit) : 0;
    if (rent > cash) continue;
    const choices = [unit], next = getNextTierDefinition(unit.definitionId);
    if (preparing && next && rent + next.cost - getUnitDefinition(unit.definitionId).cost <= cash) choices.push({ ...unit, definitionId: next.id });
    const updated = power.map(row => [...row]);
    for (const attacker of choices) {
      const distance = Math.max(0, manhattanDistance(attacker.position, target.position) - 1);
      const cost = Math.ceil(distance / getUnitDefinition(attacker.definitionId).speed) + 1;
      for (let hits = 1; hits <= 2; hits++) for (let used = cost; used <= actions; used++) {
        updated[hits][used] = Math.max(updated[hits][used], power[hits - 1][used - cost] + calculateAttackPower(attacker, target));
      }
    }
    power = updated;
  }
  return power.slice(1).some(row => row.some(damage => damage >= calculateDefense(target)));
}

/** Prove whether an invader can be removed during the defender's full next turn.
 * Home blocks ALL purchase rectangles, so the complete reply consists of upkeep
 * keep/release choices, at most one promotion per unit, then four shared actions.
 * Work is deterministic on every client. Exhaustion preserves the reply turn;
 * it is never interpreted as a win. The transition omits this check to avoid
 * recursively adjudicating hypothetical positions inside the proof. */
export function analyzeHomeDefense(state: GameState, invader: PlayerId, transition: Transition, maxNodes = PROOF_NODES): HomeDefense {
  return searchHomeDefense(state, invader, transition, maxNodes, () => false, false).result;
}

/** Same prover as adjudication, with its work and rescuing line exposed. The
 * optional interrupt is analysis-only; authoritative adjudication remains deterministic. */
export function analyzeHomeDefenseEvidence(state: GameState, invader: PlayerId, transition: Transition,
  maxNodes = PROOF_NODES, interrupted: () => boolean = () => false): HomeDefenseEvidence {
  return searchHomeDefense(state, invader, transition, maxNodes, interrupted, true);
}

function searchHomeDefense(state: GameState, invader: PlayerId, transition: Transition,
  maxNodes: number, interrupted: () => boolean, includeWitness: boolean): HomeDefenseEvidence {
  const target = getHomeOccupier(state.board, invader);
  if (!target) return { result: 'rescue', nodes: 0, cutoffReason: null, method: 'no_occupier' };
  const defender = getOpponent(invader), actions = getActionsPerTurn(state);
  const ready: GameState = { ...state, board: resetUnitActions(state.board, defender), upkeepPending: false,
    turn: { ...state.turn, currentPlayer: defender, phase: 'action', actionsRemaining: actions } };
  if (!enoughPossibleDamage(ready, target, true)) return { result: 'mate', nodes: 0, cutoffReason: null, method: 'damage_bound' };

  let nodes = 0, exhausted = false;
  let cutoffReason: HomeDefenseEvidence['cutoffReason'] = null;
  let witness: AIAction[] | undefined;
  const spend = () => {
    if (interrupted() || nodes >= maxNodes) {
      exhausted = true; cutoffReason = nodes >= maxNodes ? 'node_limit' : 'interrupted'; return false;
    }
    nodes++; return true;
  };
  const failed = new Set<string>();
  const indices = new Map(state.board.units.map((unit, index) => [unit.id, index]));
  const key = (s: GameState) => `${s.turn.actionsRemaining}:` + s.board.units.map(u =>
    `${indices.get(u.id)},${u.definitionId},${u.position.x + 10 * u.position.y},${u.damageTaken},${getAttackCount(u)},${+!!u.lastAttackKilled},${(u.attackedThisTurn ?? []).map(id => indices.get(id)).join('.')}`).join(';');

  const act = (s: GameState, line: AIAction[]): boolean => {
    const occupier = s.board.units.find(u => u.id === target.id);
    if (!occupier) { if (includeWitness) witness = line; return true; }
    if (s.phase !== 'playing' || !enoughPossibleDamage(s, occupier, false)) return false;
    const signature = key(s);
    if (failed.has(signature)) return false;
    if (!spend()) return false;
    const owned = s.board.units.filter(u => u.owner === defender);
    // Try direct damage first, but also search attacks that clear enemy blockers.
    const attacks = owned.flatMap(u => getValidAttacks(u, s.board).map(position => ({ type: 'ATTACK' as const, unitId: u.id, targetPosition: position })));
    attacks.sort((a, b) => manhattanDistance(a.targetPosition, target.position) - manhattanDistance(b.targetPosition, target.position));
    for (const action of attacks) {
      const next = transition(s, action);
      if (next !== s && act(next, includeWitness ? [...line, action] : line)) return true;
      if (exhausted) return false;
    }
    if (s.turn.actionsRemaining > 1) {
      // Every longer legal move can be split into these one-action hops. Include
      // every direction and every friendly unit: moving a blocker can be essential.
      const moves = owned.flatMap(u => getValidMoves(u, s.board).map(to => ({ type: 'MOVE' as const, unitId: u.id, to })));
      moves.sort((a, b) => manhattanDistance(a.to, target.position) - manhattanDistance(b.to, target.position));
      for (const action of moves) {
        const next = transition(s, action);
        if (next !== s && act(next, includeWitness ? [...line, action] : line)) return true;
        if (exhausted) return false;
      }
    }
    failed.add(signature);
    return false;
  };

  const owned = ready.board.units.filter(u => u.owner === defender)
    .sort((a, b) => manhattanDistance(a.position, target.position) - manhattanDistance(b.position, target.position));
  const enemy = ready.board.units.filter(u => u.owner !== defender);
  // These choices commute: charge upkeep at the old tier, then promotion. Visiting
  // each unit once covers all affordable sets without permutation duplicates.
  const prepare = (index: number, cash: number, kept: Unit[], promotions: AIAction[]): boolean => {
    if (!spend()) return false;
    if (index === owned.length) {
      const rescued = act({ ...ready,
        board: { ...ready.board, units: [...enemy, ...kept] },
        players: { ...ready.players, [defender]: { ...ready.players[defender], resources: cash } } }, []);
      if (rescued && includeWitness) {
        // Build preparation only for the successful branch, keeping adjudication
        // work unchanged on the many failed leaves. Phase endings can be automatic.
        let prepared: GameState = { ...state, upkeepPending: true, turn: { ...ready.turn, phase: 'place' } };
        const line: AIAction[] = [{ type: 'PAY_UPKEEP', keepUnitIds: kept.map(u => u.id) }, ...promotions];
        for (const action of line) prepared = transition(prepared, action);
        if (prepared.turn.phase === 'place' && !prepared.upkeepPending) line.push({ type: 'END_PLACE_PHASE' });
        witness = [...line, ...witness!];
      }
      return rescued;
    }
    const unit = owned[index], definition = getUnitDefinition(unit.definitionId), rent = unitUpkeep(unit);
    if (rent <= cash) {
      if (prepare(index + 1, cash - rent, [...kept, unit], promotions)) return true;
      if (exhausted) return false;
      const promoted = getNextTierDefinition(definition.id), cost = promoted ? promoted.cost - definition.cost : Infinity;
      if (promoted && rent + cost <= cash && prepare(index + 1, cash - rent - cost,
        [...kept, { ...unit, definitionId: promoted.id, promotedThisPlacement: true }],
        includeWitness ? [...promotions, { type: 'PROMOTE_UNIT', unitId: unit.id }] : promotions)) return true;
      if (exhausted) return false;
    }
    // Tier 1 is mandatory, even when it blocks a rescuing attacker.
    return definition.tier > 1 && prepare(index + 1, cash, kept, promotions);
  };
  const rescued = prepare(0, ready.players[defender].resources, [], []);
  const categories = new Set<string>();
  if (witness) {
    categories.add('existing');
    if (witness.some(a => a.type === 'PROMOTE_UNIT')) categories.add('promotion');
    if (witness.some(a => a.type === 'PAY_UPKEEP' && a.keepUnitIds.length < owned.length)) categories.add('upkeep_choice');
    if (witness.some(a => a.type === 'ATTACK' && (a.targetPosition.x !== target.position.x || a.targetPosition.y !== target.position.y))) categories.add('blocker_clearing');
    const hitters = new Set(witness.filter(a => a.type === 'ATTACK' && a.targetPosition.x === target.position.x && a.targetPosition.y === target.position.y).map(a => 'unitId' in a ? a.unitId : ''));
    if (witness.some(a => a.type === 'MOVE' && !hitters.has(a.unitId))) categories.add('blocker_clearing');
  }
  return { result: rescued ? 'rescue' : exhausted ? 'unknown' : 'mate', nodes, cutoffReason, method: 'search',
    ...(witness ? { witness, categories: [...categories] } : {}) };
}

export function resolveHomeCheckmate(state: GameState, transition: Transition): GameState {
  const invader = state.turn.currentPlayer;
  if (state.phase !== 'playing' || state.upkeepPending || state.victoryRule === 'elimination' || !getHomeOccupier(state.board, invader)) return state;
  // An earlier invasion wins when the defender's turn starts, before any rescue
  // would be required. A counter-invasion cannot steal that established win.
  if (getHomeOccupier(state.board, getOpponent(invader))) return state;
  if (analyzeHomeDefense(state, invader, transition) !== 'mate') return state;
  return { ...state, phase: 'victory', winner: invader, victoryReason: 'home-checkmate',
    upkeepPending: false, selectedUnit: null, validMoves: [], validAttacks: [] };
}
