import type { GameState, PlayerId } from '../../game/types';
import type { AIAction } from '../types';
import type { TacticalSolver, TacticalResult } from '../wasm/kernel';
import { canPossiblyRemove } from '../wasm/kernel';
import { getMovementRange } from '../../game/movement';
import { getUnitDefinition } from '../../game/units';
import { generateAttackActions, generatePromoteActions } from '../moves';
import { applyAction } from '../simulate';
import { isLegalAction } from '../../game/legality';

export function homeInvader(state: GameState, player: PlayerId) {
  const home = state.players[player].startCorner;
  return state.board.units.find(u => u.owner !== player && u.position.x === home.x && u.position.y === home.y);
}

/** Authoritative-JS reference and bounded fallback. Omitting mining is complete:
 * mined money cannot fund promotions until a later turn; reinforcements cannot
 * spawn while home is occupied. Ending the turn cannot remove a target.
 */
export const referenceTactics: TacticalSolver = (state, targetId, maxNodes, budget) => {
  let nodes = 0, cutoff = false;
  const rootPlayer = state.turn.currentPlayer;
  const result = (status: TacticalResult['status'], actions: AIAction[] = []): TacticalResult => ({ status, actions, nodes, scope: 'current-turn target removal; all moves/attacks; home-blocked promotions' });
  if (state.upkeepPending || state.phase !== 'playing' || state.turn.phase === 'queue' ||
    (state.turn.phase === 'place' && homeInvader(state, rootPlayer)?.id !== targetId)) return result('unknown');
  const visit = (s: GameState, path: AIAction[], limit: number): AIAction[] | null => {
    if (!s.board.units.some(u => u.id === targetId)) return path;
    if (s.phase !== 'playing' || s.turn.currentPlayer !== rootPlayer) return null;
    if (nodes >= maxNodes || budget.exhausted()) { cutoff = true; return null; } nodes++;
    if (s.turn.phase === 'place') {
      for (const a of [...generatePromoteActions(s, rootPlayer), { type: 'END_PLACE_PHASE' } as AIAction]) {
        const next = visit(applyAction(s, a), [...path, a], limit); if (next) return next; if (cutoff) return null;
      }
      return null;
    }
    if (s.turn.phase !== 'action' || !limit || !canPossiblyRemove({ ...s, turn: { ...s.turn, actionsRemaining: limit } }, targetId)) return null;
    const actions = generateAttackActions(s, rootPlayer).map(a => ({ action: a, cost: 1 }));
    for (const u of s.board.units.filter(u => u.owner === rootPlayer && u.canActThisTurn)) {
      for (const p of getMovementRange(u.position, getUnitDefinition(u.definitionId).speed, limit - 1, s.board)) {
        actions.push({ action: { type: 'MOVE', unitId: u.id, to: p.position }, cost: limit - 1 - p.actionsRemaining });
      }
    }
    for (const { action, cost } of actions) {
      if (!isLegalAction(s, action)) continue;
      const found = visit(applyAction(s, action), [...path, action], limit - cost);
      if (found) return found; if (cutoff) return null;
    }
    return null;
  };
  const available = state.turn.phase === 'place' ? 6 : state.turn.actionsRemaining;
  for (let cost = 1; cost <= available; cost++) {
    const witness = visit(state, [], cost);
    if (witness) { budget.stats.tacticalNodes += nodes; return result('proved', witness); }
    if (cutoff) break;
  }
  budget.stats.tacticalNodes += nodes;
  return result(cutoff ? 'unknown' : 'disproved');
};
