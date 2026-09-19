import { createInitialGameState, createUnit } from '../../src/game/board';
import { UNIT_DEFINITIONS } from '../../src/game/units';
import { isLegalAction } from '../../src/game/legality';
import type { GameState, PlayerId } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';

/** Deliberately independent of spawning, affordability and AI generators. Tests
 * enumerate every catalogue entry and board square, then ask canonical legality.
 * This is the ordinary Prepare universe: not RESIGN, UNDO or upkeep selection. */
export function exhaustivePrepare(state: GameState, player = state.turn.currentPlayer): AIAction[] {
  const candidates: AIAction[] = [];
  for (const def of UNIT_DEFINITIONS) for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    candidates.push({ type: 'BUY_UNIT', definitionId: def.id, position: { x, y } });
  }
  candidates.push(...state.board.units.map(u => ({ type: 'PROMOTE_UNIT' as const, unitId: u.id })),
    { type: 'END_PLACE_PHASE' }, { type: 'END_ACTION_PHASE' });
  return candidates.filter(action => isLegalAction(state, action, player));
}

export function mixedPrepare(ruleset: 'standard' | 'phasing' = 'phasing', player: PlayerId = 'white') {
  const state = createInitialGameState(undefined, 4, 0, ruleset);
  state.turn.phase = 'place'; state.turn.currentPlayer = player;
  state.players[player].resources = state.players[player].resourcesGained = 20;
  const other = player === 'white' ? 'black' : 'white';
  const point = (x: number, y: number) => player === 'white' ? { x, y } : { x: 9 - x, y: 9 - y };
  state.board.units = [
    { ...createUnit('plant_1', player, point(4, 4)), id: 'anchor' },
    { ...createUnit('fire_1', player, point(1, 0)), id: 'friendly-fire' },
    { ...createUnit('plant_1', player, point(0, 1)), id: 'friendly-plant' },
    { ...createUnit('fire_1', other, point(5, 4)), id: 'enemy', canActThisTurn: false },
  ];
  return state;
}
export const actionKeys = (actions: unknown[]) => actions.map(action => JSON.stringify(action)).sort();
