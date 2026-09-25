import type { ActionsPerTurn, GameState, Ruleset } from './types';

/** MICRO MUJU (rules revision `micro-muju-1`). Prime states never carry `variant`. */
export const isMicro = (state: Pick<GameState, 'variant'>): boolean => state.variant === 'micro';

export const isRuleset = (value: unknown): value is Ruleset => value === 'standard' || value === 'phasing';
export const isPhasing = (state: Pick<GameState, 'ruleset'>): boolean => state.ruleset === 'phasing';
export const rulesetLabel = (state: Pick<GameState, 'ruleset'>): string => isPhasing(state) ? 'Phasing' : 'Standard';

export const MAX_BLACK_CRYSTAL_HANDICAP = 20;

export function isBlackCrystalHandicap(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_BLACK_CRYSTAL_HANDICAP;
}

export const DEFAULT_ACTIONS_PER_TURN: ActionsPerTurn = 4;

/** Prime's budget. Micro's two-action budget is validated by `game/micro.ts`. */
export function isActionsPerTurn(value: unknown): value is ActionsPerTurn {
  return value === 4;
}

/** The budget belongs to the match, including cloned AI and undo states. */
export function getActionsPerTurn(state: Pick<GameState, 'actionsPerTurn'>): ActionsPerTurn {
  return state.actionsPerTurn ?? DEFAULT_ACTIONS_PER_TURN;
}
