import type { AIAction } from '../ai/types';
import type { GameState } from './types';
import { describeTransition, movementStep } from './moveHistory';
import { automaticUpkeepUndo } from './turn';

export interface AnalysisFrame { state: GameState; label: string; turn: string }
export interface LocalGameHistory { frames: AnalysisFrame[]; complete: boolean }
export const turnKey = (state: GameState) => `${state.turn.turnNumber}.${state.turn.currentPlayer}`;
export const localFrame = (state: GameState, label = 'Starting position'): AnalysisFrame => ({
  state: { ...state, selectedUnit: null, validMoves: [], validAttacks: [] }, label, turn: turnKey(state),
});
export const startHistory = (state: GameState, complete: boolean): LocalGameHistory => ({
  frames: [localFrame(state, complete ? 'Starting position' : 'First recorded position')], complete,
});

/** Keep local games and private variations on the same step-by-step timeline. */
export function analysisFrames(before: GameState, action: AIAction, after: GameState): AnalysisFrame[] {
  if (before === after) return [];
  const events = describeTransition(before, action, after);
  if (!events.length) return [localFrame(after, action.type === 'END_PLACE_PHASE' ? 'Start actions' : action.type)];
  return events.flatMap(event => {
    const steps = event.kind === 'move' ? event.ap : 1;
    return Array.from({ length: steps }, (_, i) => {
      const step = i + 1;
      const snapshot = event.kind === 'mining' ? automaticUpkeepUndo(before, after) ?? after : movementStep(before, after, event, step);
      return localFrame(snapshot, `${event.notation}${steps > 1 ? ` · step ${step}/${steps}` : ''}`);
    });
  });
}
