import type { ActionsPerTurn, GameState } from './types';

export const DEFAULT_ACTIONS_PER_TURN: ActionsPerTurn = 4;

export function isActionsPerTurn(value: unknown): value is ActionsPerTurn {
  return value === 4;
}

/** The budget belongs to the match, including cloned AI and undo states. */
export function getActionsPerTurn(state: Pick<GameState, 'actionsPerTurn'>): ActionsPerTurn {
  return state.actionsPerTurn ?? DEFAULT_ACTIONS_PER_TURN;
}
