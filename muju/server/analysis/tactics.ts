import type { AIAction } from '../../src/ai/types';
import { applyAction } from '../../src/ai/simulate';
import { generateAllActions } from '../../src/ai/moves';
import { getAdjacentPositions, getUnitAt, manhattanDistance } from '../../src/game/board';
import { calculateAttackPower, calculateDefense, canAttack } from '../../src/game/combat';
import { getAllSpawnPositions } from '../../src/game/spawning';
import { getMovementRange, getMoveCost, findPath } from '../../src/game/movement';
import { getAffordablePurchases } from '../../src/game/building';
import { getNextTierDefinition, getUnitDefinition } from '../../src/game/units';
import { isLegalAction } from '../../src/game/legality';
import { defaultUpkeepAction } from '../../src/game/upkeep';
import type { GameState, Unit } from '../../src/game/types';
import { getHomeOccupier, getOpponent } from '../../src/game/victory';
import { describeAction, square, squares } from '../notation';
import type { Category } from './schema';
import { actionReady, modelDescription, simulateSequence, tacticalKey, turnFor, WorkBudget, type Proof } from './core';

export interface Evidence {
  actions: AIAction[];
  after: GameState;
  category: Category;
  ap: number;
  crystals: number;
  damage: number;
  lethal: boolean;
  attackerId: string | null;
  steps: object[];
  upkeepPaid: number;
  purchases: { id: string; definitionId: string; square: string }[];
}
function category(actions: AIAction[]): Category {
  const purchase = actions.some(a => a.type === 'BUY_UNIT'), promotion = actions.some(a => a.type === 'PROMOTE_UNIT');
  const attackers = new Set(actions.filter(a => a.type === 'ATTACK').map(a => a.unitId));
  return attackers.size > 1 || (purchase && promotion) ? 'combined' : purchase ? 'purchase' : promotion ? 'promotion' : 'existing';
}

/** Safe upper bound: ignore blockers and shared spending, but charge each
 * distinct attacker's minimum approach plus hit to the shared action budget.
 * Optimistic new purchases start adjacent. This may overestimate, never certify
 * a kill; it makes distant miners cheap to rule out in the actual search. */
export function damageUpperBound(s: GameState, target: Unit, categories: Category[]): number {
  const ap = s.turn.actionsRemaining, cash = s.players[s.turn.currentPlayer].resources;
  const preparing = s.turn.phase === 'place';
  const choices: { cost: number; damage: number }[][] = [];
  for (const u of s.board.units.filter(u => u.owner === s.turn.currentPlayer)) {
    if (!preparing && (!canAttack(u) || u.attackedThisTurn?.includes(target.id))) continue;
    const variants = [u], next = getNextTierDefinition(u.definitionId);
    if (preparing && next && (categories.includes('promotion') || categories.includes('combined')) &&
      next.cost - getUnitDefinition(u.definitionId).cost <= cash) variants.push({ ...u, definitionId: next.id });
    choices.push(variants.map(v => ({ cost: Math.ceil(Math.max(0, manhattanDistance(v.position, target.position) - 1) / getUnitDefinition(v.definitionId).speed) + 1,
      damage: calculateAttackPower(v, target) })));
  }
  if (preparing && (categories.includes('purchase') || categories.includes('combined'))) {
    const available = getAffordablePurchases(cash);
    const count = Math.min(ap, Math.floor(cash / Math.min(...available.map(d => d.cost))));
    for (let i = 0; i < count; i++) choices.push(available.map(d => ({ cost: 1,
      damage: calculateAttackPower({ ...target, owner: s.turn.currentPlayer, definitionId: d.id }, target) })));
  }
  const corner = [0, 9].includes(target.position.x) && [0, 9].includes(target.position.y);
  const maxHits = corner && ap <= 4 ? Math.min(2, ap) : ap;
  let dp = Array.from({ length: maxHits + 1 }, () => Array<number>(ap + 1).fill(-Infinity)); dp[0][0] = 0;
  for (const variants of choices) {
    const next = dp.map(row => [...row]);
    for (const v of variants) for (let hit = 1; hit <= maxHits; hit++) for (let cost = v.cost; cost <= ap; cost++)
      next[hit][cost] = Math.max(next[hit][cost], dp[hit - 1][cost - v.cost] + v.damage);
    dp = next;
  }
  return Math.max(0, ...dp.flat());
}
export function evidence(source: GameState, actions: AIAction[], targetId?: string): Evidence {
  let damage = 0, upkeepPaid = 0;
  const steps: object[] = [];
  const purchases: Evidence['purchases'] = [];
  const { state: after, applied } = simulateSequence(source, actions, (before, action, next) => {
    if (action.type === 'BUY_UNIT') purchases.push({ id: getUnitAt(next.board, action.position)!.id, definitionId: action.definitionId, square: square(action.position) });
    if (action.type === 'MOVE') {
      const u = before.board.units.find(u => u.id === action.unitId)!;
      steps.push({ unitId: u.id, from: square(u.position), to: square(action.to), path: squares(findPath(u.position, action.to, before.board, 100)!),
        ap: getMoveCost(u.position, action.to, getUnitDefinition(u.definitionId).speed, before.board) });
    }
    if (action.type === 'ATTACK') {
      const attacker = before.board.units.find(u => u.id === action.unitId)!, defender = getUnitAt(before.board, action.targetPosition)!;
      const power = calculateAttackPower(attacker, defender);
      if (defender.id === targetId) damage += power;
      steps.push({ attacker: attacker.id, attackSquare: square(attacker.position), target: defender.id,
        element: getUnitDefinition(attacker.definitionId).element, tier: getUnitDefinition(attacker.definitionId).tier,
        damage: power, defense: calculateDefense(defender), ap: 1 });
    }
    if (action.type === 'PAY_UPKEEP') upkeepPaid += before.players[before.turn.currentPlayer].resources - next.players[before.turn.currentPlayer].resources;
  });
  const before = source.board.units.find(u => u.id === targetId), target = after.board.units.find(u => u.id === targetId);
  const lastAttack = applied.filter(a => a.type === 'ATTACK').at(-1);
  // These witnesses stop before handoff, so neither harvest nor the opponent's
  // upkeep can be mistaken for spending or a reset of this shared AP budget.
  return { actions: applied, after, category: category(applied), ap: source.turn.actionsRemaining - after.turn.actionsRemaining,
    crystals: source.players[source.turn.currentPlayer].resources - after.players[source.turn.currentPlayer].resources,
    damage, steps, upkeepPaid, purchases,
    lethal: !!before && !target, attackerId: lastAttack?.unitId ?? null };
}

/** Enumerate direct single-attacker lines, including every approach square and
 * each affordable single purchase/promotion. No independent attacks are summed. */
export function singleThreats(source: GameState, targetId: string, categories: Category[], budget: WorkBudget, quota = Infinity, lethalOnly = false) {
  const target = source.board.units.find(u => u.id === targetId);
  const lines: Evidence[] = [];
  const seen = new Set<string>();
  let complete = true;
  const startNodes = budget.nodes;
  const spend = () => {
    if (budget.nodes - startNodes >= quota || !budget.spend()) { complete = false; return false; }
    return true;
  };
  if (!target || target.owner === source.turn.currentPlayer || source.phase !== 'playing') return { lines, complete, omitted: [] as string[] };
  let paid = source;
  const prefix: AIAction[] = [];
  if (paid.upkeepPending) { const pay = defaultUpkeepAction(paid); paid = applyAction(paid, pay); prefix.push(pay); }
  const variants = function* (): Generator<{ state: GameState; actions: AIAction[]; unitId?: string }> {
    if (categories.includes('existing') || categories.includes('combined')) yield { state: paid, actions: prefix };
    if (paid.phase !== 'playing' || paid.turn.phase !== 'place') return;
    if (categories.includes('promotion') || categories.includes('combined')) {
      for (const u of paid.board.units.filter(u => u.owner === paid.turn.currentPlayer)) {
        const promote: AIAction = { type: 'PROMOTE_UNIT', unitId: u.id };
        if (isLegalAction(paid, promote)) yield { state: applyAction(paid, promote), actions: [...prefix, promote], unitId: u.id };
      }
    }
    if (categories.includes('purchase') || categories.includes('combined')) {
      const positions = getAllSpawnPositions(paid.turn.currentPlayer, paid.board)
        .sort((a, b) => manhattanDistance(a, target.position) - manhattanDistance(b, target.position));
      const definitions = getAffordablePurchases(paid.players[paid.turn.currentPlayer].resources).filter(def => {
        const power = calculateAttackPower({ ...target, owner: paid.turn.currentPlayer, definitionId: def.id }, target);
        return power > 0 && (!lethalOnly || power >= calculateDefense(target));
      });
      for (const position of positions) for (const def of definitions) {
        const buy: AIAction = { type: 'BUY_UNIT', definitionId: def.id, position };
        const state = applyAction(paid, buy), unitId = getUnitAt(state.board, position)!.id;
        yield { state, actions: [...prefix, buy], unitId };
      }
    }
  };
  variants: for (const variant of variants()) {
    if (!budget.available()) { complete = false; break; }
    const ready = actionReady(variant.state), state = ready.state;
    if (state.phase !== 'playing') continue;
    for (const attacker of state.board.units.filter(u => u.owner === state.turn.currentPlayer && (!variant.unitId || u.id === variant.unitId))) {
      if (!canAttack(attacker) || attacker.attackedThisTurn?.includes(target.id)) continue;
      const power = calculateAttackPower(attacker, target);
      if (power === 0 || (lethalOnly && power < calculateDefense(target))) continue;
      for (const attackSquare of getAdjacentPositions(target.position)) {
        const at = getUnitAt(state.board, attackSquare);
        if (at && at.id !== attacker.id) continue;
        const moveCost = at?.id === attacker.id ? 0 : getMoveCost(attacker.position, attackSquare, getUnitDefinition(attacker.definitionId).speed, state.board);
        if (moveCost === null || moveCost + 1 > state.turn.actionsRemaining) continue;
        if (!spend()) break variants;
        const actions: AIAction[] = [...variant.actions, ...ready.actions,
          ...(moveCost ? [{ type: 'MOVE' as const, unitId: attacker.id, to: attackSquare }] : []),
          { type: 'ATTACK', unitId: attacker.id, targetPosition: target.position }];
        const result = evidence(source, actions, targetId);
        // An approach can itself end the game by home mate, cancelling the attack.
        if (result.actions.at(-1)?.type === 'ATTACK') {
          const key = tacticalKey(result.after);
          if (seen.has(key)) budget.collapsed++;
          else { seen.add(key); lines.push(result); }
        }
      }
    }
  }
  lines.sort((a, b) => Number(b.lethal) - Number(a.lethal) || a.crystals - b.crystals || a.ap - b.ap || b.damage - a.damage);
  return { lines, complete, omitted: ['combined attacks', 'blocker clearing', 'purchase chains expanding control',
    ...(source.upkeepPending ? ['nondefault upkeep selections'] : [])] };
}

/** Exhaustive legal one-turn graph until the shared work budget is exhausted.
 * One-AP hops cover all multi-AP moves; every witness is checked by real play.
 * Search never hands over to a cooperative opponent. */
export function searchTurn(source: GameState, budget: WorkBudget, options: {
  targetId?: string; categories: Category[]; objective?: 'killTarget' | 'capturedValue' | 'occupyHome' | 'blockPurchases'; quota?: number;
}) {
  const objective = options.objective ?? 'killTarget', actor = source.turn.currentPlayer, opponent = getOpponent(actor);
  const target = source.board.units.find(u => u.id === options.targetId);
  const start = budget.nodes;
  let complete = true, found = false, best: Evidence | null = null, bestScore = 0;
  const omitted = new Set<string>();
  const seen = new Set<string>();
  const value = (s: GameState) => source.board.units.filter(u => u.owner === opponent && !s.board.units.some(v => v.id === u.id))
    .reduce((n, u) => n + getUnitDefinition(u.definitionId).cost, 0);
  const score = (s: GameState) => objective === 'killTarget' ? (target && !s.board.units.some(u => u.id === target.id) ? 1000 : target ?
    Math.max(0, calculateDefense(target) - calculateDefense(s.board.units.find(u => u.id === target.id)!)) : 0)
    : objective === 'capturedValue' ? value(s) : objective === 'occupyHome' ? Number(!!getHomeOccupier(s.board, actor))
      : Number(getAllSpawnPositions(opponent, s.board).length === 0);
  const visit = (s: GameState, actions: AIAction[]): boolean => {
    const currentScore = score(s);
    if (currentScore > bestScore) { bestScore = currentScore; if (actions.length) best = evidence(source, actions, target?.id); }
    if (objective !== 'capturedValue' && currentScore >= (objective === 'killTarget' ? 1000 : 1)) { found = true; return true; }
    if (s.phase !== 'playing' || s.turn.currentPlayer !== actor || (s.turn.phase === 'action' && s.turn.actionsRemaining === 0)) return false;
    if (actions.length >= 32) { omitted.add('sequences longer than the 32-action play batch'); return false; }
    if (objective === 'killTarget' && target) {
      const defender = s.board.units.find(u => u.id === target.id)!;
      if (damageUpperBound(s, defender, options.categories) < calculateDefense(defender)) return false;
    }
    const key = tacticalKey(s);
    if (seen.has(key)) { budget.collapsed++; return false; }
    if (budget.nodes - start >= (options.quota ?? Infinity) || !budget.spend()) { complete = false; return true; }
    seen.add(key);
    if (s.upkeepPending && s.board.units.filter(u => u.owner === actor && getUnitDefinition(u.definitionId).tier > 1).length > 12) omitted.add('upkeep subsets above 12 paid units');
    const candidates = generateAllActions(s, actor).filter(a => a.type !== 'RESIGN' && a.type !== 'END_ACTION_PHASE'
      && (a.type !== 'BUY_UNIT' || options.categories.includes('purchase') || options.categories.includes('combined'))
      && (a.type !== 'PROMOTE_UNIT' || options.categories.includes('promotion') || options.categories.includes('combined')));
    const order = (a: AIAction) => {
      if (a.type === 'ATTACK') return target && a.targetPosition.x === target.position.x && a.targetPosition.y === target.position.y ? -100 : -50;
      if (a.type === 'END_PLACE_PHASE') return -10;
      if (a.type === 'PAY_UPKEEP') return -20;
      if (a.type === 'PROMOTE_UNIT') return 0;
      const p = a.type === 'MOVE' ? a.to : a.type === 'BUY_UNIT' ? a.position : null;
      return p && target ? manhattanDistance(p, target.position) : 10;
    };
    candidates.sort((a, b) => order(a) - order(b));
    for (const action of candidates) {
      if (!budget.available()) { complete = false; return true; }
      const next = applyAction(s, action);
      if (next !== s && visit(next, [...actions, action])) return true;
    }
    return false;
  };
  if (source.phase === 'playing' && (objective !== 'killTarget' || target?.owner === opponent)) visit(source, []);
  else omitted.add('no active attacking turn or target');
  const proof: Proof = found || (objective === 'capturedValue' && bestScore > 0) ? 'proven_possible'
    : complete && !omitted.size ? 'proven_impossible' : 'unknown';
  return { proof, best: best as Evidence | null, bestScore, alreadySatisfied: found && best === null,
    optimality: objective !== 'killTarget' && complete && !found && !omitted.size ? 'proven' : 'best_found',
    search: { completeness: complete && !found && !omitted.size ? 'complete' : 'bounded', nodes: budget.nodes - start,
      cutoffReason: found ? 'witness_found' : complete ? null : budget.cutoffReason ?? 'target_quota', omittedCaseClasses: [...omitted] } };
}

export function describeEvidence(source: GameState, line: Evidence, targetId: string | undefined, full = true) {
  const attacker = line.after.board.units.find(u => u.id === line.attackerId), target = source.board.units.find(u => u.id === targetId);
  const purchase = line.purchases.find(p => p.id === line.attackerId);
  const label = purchase ? `+${purchase.definitionId}@${purchase.square}` : line.attackerId ?? '?';
  const attackCount = line.actions.filter(a => a.type === 'ATTACK').length;
  const retreats = attacker && line.after.phase === 'playing' ? getMovementRange(attacker.position,
    getUnitDefinition(attacker.definitionId).speed, line.after.turn.actionsRemaining, line.after.board) : [];
  const withdrawal = attacker && retreats.length ? retreats.map(p => ({ ...p, distance: target ? manhattanDistance(p.position, target.position) : 0 }))
    .sort((a, b) => b.distance - a.distance || b.actionsRemaining - a.actionsRemaining)[0] : null;
  const retreatAction: AIAction | null = attacker && withdrawal ? { type: 'MOVE', unitId: attacker.id, to: withdrawal.position } : null;
  const capture = source.board.units.filter(u => u.owner !== source.turn.currentPlayer && !line.after.board.units.some(v => v.id === u.id));
  return { proof: 'proven_possible', category: line.category, attacker: line.attackerId,
    line: `${label} → ${attacker ? square(attacker.position) : '?'}, ${line.ap - attackCount}+${attackCount} AP/${line.crystals - line.upkeepPaid} crystals, dmg ${line.damage} vs def ${target ? calculateDefense(target) : '?'}, ${line.lethal ? 'kill' : 'damage'}, retreat ${retreats.length}`,
    actionsSpent: line.ap, crystalsSpent: line.crystals - line.upkeepPaid, upkeepPaid: line.upkeepPaid,
    damage: line.damage, lethal: line.lethal, finalSquare: attacker ? square(attacker.position) : null,
    actionsRemaining: line.after.turn.actionsRemaining, result: line.after.phase === 'victory' ? line.after.victoryReason : null,
    captured: capture.map(u => ({ id: u.id, value: getUnitDefinition(u.definitionId).cost })),
    ...(full ? { steps: line.steps, witness: line.actions.map(describeAction), retreat: { count: retreats.length,
      squares: squares(retreats.map(p => p.position)), safety: 'not checked',
      ...(retreatAction && line.actions.length < 32 && isLegalAction(line.after, retreatAction) ? { witness: [...line.actions, retreatAction].map(describeAction) } : {}) } } : {}) };
}

export function replyTo(line: Evidence, budget: WorkBudget, deep: boolean, quota = 200) {
  if (line.after.phase !== 'playing' || !line.attackerId) return { proof: 'proven_impossible', reason: 'Game ended; no reply turn.' };
  const model = turnFor(line.after, getOpponent(line.after.turn.currentPlayer));
  if (model.state.phase !== 'playing') return { proof: 'proven_impossible', reason: `Reply prevented by ${model.state.victoryReason}.`, model: modelDescription(model) };
  const single = singleThreats(model.state, line.attackerId, ['existing', 'promotion', 'purchase'], budget, quota, true);
  let best = single.lines.find(l => l.lethal);
  const combined = !best && deep && budget.available() ? searchTurn(model.state, budget,
    { targetId: line.attackerId, categories: ['combined'], quota }) : null;
  if (combined?.best?.lethal) best = combined.best;
  return { proof: best ? 'proven_possible' : combined?.proof ?? 'unknown', optimality: 'best_found',
    assumption: 'Attacker ends now on the attack square, without withdrawing. Reply witness starts after setupActions.',
    model: modelDescription(model), ...(best ? { capture: describeEvidence(model.state, best, line.attackerId) } : {}),
    search: combined?.search ?? { completeness: 'bounded', omittedCaseClasses: single.omitted,
      cutoffReason: single.complete ? null : budget.cutoffReason ?? 'target_quota' } };
}

export function approachTable(source: GameState, target: Unit) {
  // The explicit handoff may have released this defender during outgoing upkeep.
  // An empty square has no attack witness, even if an enemy can approach it.
  if (!source.board.units.some(u => u.id === target.id)) return [];
  const ready = actionReady(source).state;
  return ready.board.units.filter(u => u.owner === ready.turn.currentPlayer && u.owner !== target.owner).flatMap(u =>
    getAdjacentPositions(target.position).filter(p => !getUnitAt(ready.board, p) || getUnitAt(ready.board, p)!.id === u.id).map(p => {
      const cost = p.x === u.position.x && p.y === u.position.y ? 0 : getMoveCost(u.position, p, getUnitDefinition(u.definitionId).speed, ready.board);
      const attackable = ready.phase === 'playing' && cost !== null && cost + 1 <= ready.turn.actionsRemaining && canAttack(u) && !u.attackedThisTurn?.includes(target.id);
      const left = attackable ? ready.turn.actionsRemaining - cost! - 1 : null;
      // Vacated origin and capture may open an exit; verify this classification.
      let retreat = 0;
      if (attackable) {
        const line = evidence(ready, [...(cost ? [{ type: 'MOVE' as const, unitId: u.id, to: p }] : []), { type: 'ATTACK', unitId: u.id, targetPosition: target.position }], target.id);
        if (line.after.phase === 'playing') retreat = getMovementRange(p, getUnitDefinition(u.definitionId).speed, left!, line.after.board).length;
      }
      return { attacker: u.id, attackSquare: square(p), moveActions: cost, attackPossible: attackable, actionsRemaining: left,
        classification: !attackable ? 'unreachable' : retreat ? 'strike-and-retreat' : 'stranded', retreatSquares: retreat };
    }));
}
