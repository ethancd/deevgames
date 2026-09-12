import type { AIAction } from '../ai/types';
import type { BoardState, GameState, PlayerId, Position } from './types';
import { getUnitDefinition } from './units';

export interface ReplayFrame {
  board: BoardState;
  action: AIAction;
  label: string;
  position?: Position;
  unitId?: string;
}
export interface TurnReplay {
  player: PlayerId;
  turnNumber: number;
  initialBoard: BoardState;
  frames: ReplayFrame[];
}
export interface ReplayRecording { current: TurnReplay | null; last: TurnReplay | null }
export const emptyRecording = (): ReplayRecording => ({ current: null, last: null });
const square = (p: Position) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;

/** Record actual engine results; playback never runs actions against the live game. */
export function recordAction(recording: ReplayRecording, before: GameState, action: AIAction, after: GameState): ReplayRecording {
  if (before === after) return recording;
  let current = recording.current;
  if (!current || current.player !== before.turn.currentPlayer || current.turnNumber !== before.turn.turnNumber) {
    current = { player: before.turn.currentPlayer, turnNumber: before.turn.turnNumber, initialBoard: before.board, frames: [] };
  }
  const unit = 'unitId' in action ? before.board.units.find(u => u.id === action.unitId) : undefined;
  const name = unit ? getUnitDefinition(unit.definitionId).name : 'Unit';
  let label = '', position: Position | undefined, unitId = unit?.id;
  switch (action.type) {
    case 'BUY_UNIT':
      position = action.position;
      unitId = after.board.units.find(u => u.position.x === position!.x && u.position.y === position!.y)?.id;
      label = `Placed ${getUnitDefinition(action.definitionId).name} at ${square(position)}`; break;
    case 'PROMOTE_UNIT':
      position = unit?.position;
      label = `Promoted ${name}${position ? ` at ${square(position)}` : ''}`; break;
    case 'MOVE': position = action.to; label = `${name} moved to ${square(position)}`; break;
    case 'ATTACK': position = action.targetPosition; label = `${name} attacked ${square(position)}`; break;
    case 'PAY_UPKEEP': label = 'Paid upkeep and released unkept units'; break;
  }
  if (label) current = { ...current, frames: [...current.frames, { board: after.board, action, label, position, unitId }] };
  if (action.type === 'END_ACTION_PHASE' || before.turn.currentPlayer !== after.turn.currentPlayer || before.turn.turnNumber !== after.turn.turnNumber) {
    return { current: null, last: current };
  }
  return { ...recording, current };
}

export function rewindRecording(recording: ReplayRecording, length: number): ReplayRecording {
  return { ...recording, current: recording.current ? { ...recording.current, frames: recording.current.frames.slice(0, length) } : null };
}
