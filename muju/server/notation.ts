import type { Position } from '../src/game/types';
import type { RoomAction } from '../src/online/types';

export const square = (p: Position) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
export const squares = (positions: Position[]) => positions.map(square).join(',');
export function describeAction(action: RoomAction) {
  if (action.type === 'MOVE') return { ...action, to: square(action.to) };
  if (action.type === 'ATTACK') return { ...action, targetPosition: square(action.targetPosition) };
  if (action.type === 'BUY_UNIT') return { ...action, position: square(action.position) };
  return action;
}
