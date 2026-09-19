import type { RoomSnapshot } from '../src/online/types';
import { RoomError } from './schema';

export type MatchCapability = 'analysis' | 'rules-oracle';
/** Use the trusted stored room, never a policy from tool arguments or a seat token.
 * Check before reading caches as well as before computing any assistance. */
export function allowsMatchCapability(room: Pick<RoomSnapshot, 'matchPolicy'>, capability: MatchCapability): boolean {
  if (!room.matchPolicy) return true;
  return capability === 'analysis' ? room.matchPolicy.toolTier === 'centaur' : room.matchPolicy.toolTier !== 'bare';
}
export function assertMatchCapability(room: Pick<RoomSnapshot, 'matchPolicy'>, capability: MatchCapability): void {
  if (!allowsMatchCapability(room, capability)) throw new RoomError(403, 'MATCH_TOOL_RESTRICTED',
    `This room's immutable ${room.matchPolicy!.toolTier} match tier disables hosted ${capability}.`);
}
