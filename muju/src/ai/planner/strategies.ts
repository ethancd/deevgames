import type { GameState, PlayerId } from '../../game/types';
import type { TurnPlan } from './types';
import { getUnitDefinition } from '../../game/units';
import { getMoveCost } from '../../game/movement';
import { homeInvader } from '../tactics/home';

/** Small positional terms. Cash, unit capital and ore yield remain in the main
 * evaluation. Reachability indicates a threat; it never proves occupation wins.
 */
export function strategicValue(state: GameState, player: PlayerId): number {
  if (state.phase === 'victory') return 0;
  const enemy = player === 'white' ? 'black' : 'white';
  let score = 0;
  for (const owner of [player, enemy]) {
    const sign = owner === player ? 1 : -1, other = owner === player ? enemy : player;
    const target = state.players[other].startCorner;
    const ownUnits = state.board.units.filter(u => u.owner === owner);
    let closest = 99;
    for (const u of ownUnits) {
      const d = getUnitDefinition(u.definitionId);
      const distance = Math.abs(u.position.x - target.x) + Math.abs(u.position.y - target.y);
      const route = getMoveCost(u.position, target, d.speed, state.board);
      if (route !== null) closest = Math.min(closest, route);
      // A modest raiding prior breaks aimless wandering once local ore is dry.
      if (d.attack > 0) score += sign * Math.max(0, 7 - Math.ceil(distance / d.speed)) * 1.2;
    }
    if (state.victoryRule !== 'elimination' && closest <= 6) {
      const home = state.players[other].startCorner;
      const defenders = state.board.units.filter(u => u.owner === other &&
        Math.abs(u.position.x - home.x) + Math.abs(u.position.y - home.y) <= 2 && getUnitDefinition(u.definitionId).attack > 0);
      score += sign * Math.max(0, 6 - closest) * (defenders.length ? 0.4 : 2);
    }
  }
  if (state.victoryRule !== 'elimination' && homeInvader(state, player)) score -= 200;
  return score;
}

/** Reserve one line per purpose before filling with score-ranked candidates. */
export function reserveStrategies(plans: TurnPlan[], count: number): TurnPlan[] {
  const unique = [...new Map(plans.map(p => [p.id, p])).values()].sort((a, b) => b.score - a.score);
  const selected: TurnPlan[] = [], ids = new Set<string>();
  const add = (p?: TurnPlan) => { if (p && !ids.has(p.id) && selected.length < count) { ids.add(p.id); selected.push(p); } };
  add(unique[0]);
  for (const tag of ['defensive', 'kill', 'raid', 'mining', 'promotion_play', 'expansion'] as const) add(unique.find(p => p.tags.includes(tag)));
  for (const p of unique) add(p);
  return selected.sort((a, b) => b.score - a.score);
}
export function raidPlans(state: GameState, player: PlayerId): TurnPlan[] {
  if (state.victoryRule === 'elimination' || state.turn.phase !== 'action') return [];
  const target = state.players[player === 'white' ? 'black' : 'white'].startCorner;
  return state.board.units.filter(u => u.owner === player && u.canActThisTurn).flatMap(u => {
    const cost = getMoveCost(u.position, target, getUnitDefinition(u.definitionId).speed, state.board);
    if (cost === null || cost > state.turn.actionsRemaining) return [];
    return [{ id: `raid:${u.id}`, actions: [{ type: 'MOVE', unitId: u.id, to: target }], score: 0, tags: ['raid'] } as TurnPlan];
  });
}
