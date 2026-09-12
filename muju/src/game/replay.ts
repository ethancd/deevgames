import type { AIAction } from '../ai/types';
import type { BoardState, GameState, PlayerId, Position } from './types';
import { calculateDefense } from './combat';
import { BOARD_SIZE } from './board';
import { executeMove, findPath } from './movement';
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

/** A movement command can spend several actions. Show each speed-sized hop. */
function splitMoveFrame(before: BoardState, frame: ReplayFrame): ReplayFrame[] {
  const action = frame.action;
  if (action.type !== 'MOVE') return [frame];
  const unit = before.units.find(u => u.id === action.unitId);
  if (!unit) return [frame];
  const { speed, name } = getUnitDefinition(unit.definitionId);
  const path = findPath(unit.position, action.to, before, BOARD_SIZE * BOARD_SIZE);
  if (!path || path.length <= speed) return [frame];
  const frames: ReplayFrame[] = [];
  let from = unit.position;
  for (let offset = 0; offset < path.length; offset += speed) {
    const position = path[Math.min(offset + speed, path.length) - 1];
    frames.push({ ...frame, action: { ...action, to: position }, position, unitId: unit.id,
      board: offset + speed >= path.length ? frame.board : executeMove(before, unit.id, position),
      label: `${name}: ${square(from)} → ${square(position)}` });
    from = position;
  }
  return frames;
}

/** Also expand replays saved by older servers, without changing their snapshots. */
export function expandReplayMoves(replay: TurnReplay): TurnReplay {
  let before = replay.initialBoard;
  const frames = replay.frames.flatMap(frame => {
    const expanded = splitMoveFrame(before, frame);
    before = frame.board;
    return expanded;
  });
  return { ...replay, frames };
}

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
      const promoted = after.board.units.find(u => u.id === unitId);
      label = `Promoted ${name} to ${promoted ? getUnitDefinition(promoted.definitionId).name : 'next tier'}${position ? ` at ${square(position)}` : ''}`; break;
    case 'MOVE': position = action.to; label = `${name}: ${unit ? `${square(unit.position)} → ` : ''}${square(position)}`; break;
    case 'ATTACK': {
      position = action.targetPosition;
      const target = before.board.units.find(u => u.position.x === position!.x && u.position.y === position!.y);
      const survivor = target && after.board.units.find(u => u.id === target.id);
      label = `${name} attacked ${target ? getUnitDefinition(target.definitionId).name : square(position)} at ${square(position)} · ${survivor ? `${calculateDefense(survivor)} defense left` : 'eliminated'}`; break;
    }
    case 'PAY_UPKEEP': label = 'Paid upkeep and released unkept units'; break;
  }
  if (label) current = { ...current, frames: [...current.frames,
    ...splitMoveFrame(before.board, { board: after.board, action, label, position, unitId })] };
  if (action.type === 'END_ACTION_PHASE' || before.turn.currentPlayer !== after.turn.currentPlayer || before.turn.turnNumber !== after.turn.turnNumber) {
    return { current: null, last: current };
  }
  return { ...recording, current };
}

export function rewindRecording(recording: ReplayRecording, length: number): ReplayRecording {
  return { ...recording, current: recording.current ? { ...recording.current, frames: recording.current.frames.slice(0, length) } : null };
}
