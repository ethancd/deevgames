import type { GameState, PlayerId, Position } from '../../game/types';
import { getMovementRange } from '../../game/movement';
import { getActionsPerTurn, isPhasing } from '../../game/rules';
import { isValidSpawnPosition } from '../../game/spawning';
import { getUnitDefinition } from '../../game/units';

const reachCache = new WeakMap<GameState, Map<PlayerId, Position[]>>();

/** Public next-Act reach. Reset flags are intentional: the enemy gets a fresh
 * turn before our summons arrive. Traffic is respected; combat is not proved.
 */
function enemyReach(state: GameState, owner: PlayerId): Position[] {
  let byOwner = reachCache.get(state);
  if (!byOwner) { byOwner = new Map(); reachCache.set(state, byOwner); }
  const cached = byOwner.get(owner);
  if (cached) return cached;
  const squares = new Map<string, Position>();
  for (const u of state.board.units.filter(u => u.owner !== owner)) {
    const positions = [u.position, ...getMovementRange(u.position,
      getUnitDefinition(u.definitionId).speed, getActionsPerTurn(state), state.board).map(p => p.position)];
    for (const p of positions) squares.set(`${p.x},${p.y}`, p);
  }
  const result = [...squares.values()]; byOwner.set(owner, result); return result;
}

/** Every rectangle supporting sq contains the corner-to-sq rectangle. An
 * enemy that can stop there (including sq) can disrupt all those supports.
 * This is a risk filter, not a claim that the enemy will survive or choose it.
 */
export function summonDisruptable(state: GameState, owner: PlayerId, sq: Position): boolean {
  if (!isPhasing(state)) return false;
  if (!isValidSpawnPosition(sq, owner, state.board)) return true;
  const home = state.players[owner].startCorner;
  return enemyReach(state, owner).some(p =>
    p.x >= Math.min(home.x, sq.x) && p.x <= Math.max(home.x, sq.x) &&
    p.y >= Math.min(home.y, sq.y) && p.y <= Math.max(home.y, sq.y));
}

export function pendingMaterial(state: GameState, owner: PlayerId): number {
  return (state.pendingSummons ?? []).filter(s => s.owner === owner).reduce((sum, s) =>
    sum + s.cost * (summonDisruptable(state, owner, s.position) ? 0.5 : 0.9), 0);
}

/** Expected future income, discounted one turn; never current-turn mining. */
export function pendingIncome(state: GameState, owner: PlayerId): number {
  return (state.pendingSummons ?? []).filter(s => s.owner === owner).reduce((sum, s) =>
    sum + (summonDisruptable(state, owner, s.position) ? 0 : 0.9 * Math.min(
      getUnitDefinition(s.definitionId).mining, state.board.cells[s.position.y][s.position.x].resourceLayers)), 0);
}

/** A disruption forces a refund, not a material capture. Reward only tempo. */
export function disruptionPressure(state: GameState, player: PlayerId): number {
  return (state.pendingSummons ?? []).filter(s => s.owner !== player &&
    !isValidSpawnPosition(s.position, s.owner, state.board)).reduce((n, s) => n + 0.6 * s.cost, 0);
}
