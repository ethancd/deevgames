import type { RoomSnapshot } from '../src/online/types';
import type { GameState } from '../src/game/types';
import { RoomError } from './schema';

type PolicyRoom = Pick<RoomSnapshot, 'matchPolicy'> & { state?: Pick<GameState, 'variant'> };
/** Hosted analysis is Prime-only (10×10 geometry, kill clock, AI move generation).
 * MICRO MUJU rooms keep the rules oracle (legal actions, preview, undo). */
const analysisUnsupported = (room: PolicyRoom) => room.state?.variant === 'micro';

export type MatchCapability = 'analysis' | 'rules-oracle';
/** Use the trusted stored room, never a policy from tool arguments or a seat token.
 * Check before reading caches as well as before computing any assistance. */
export function allowsMatchCapability(room: PolicyRoom, capability: MatchCapability): boolean {
  if (capability === 'analysis' && analysisUnsupported(room)) return false;
  if (!room.matchPolicy) return true;
  return capability === 'analysis' ? room.matchPolicy.toolTier === 'centaur' : room.matchPolicy.toolTier !== 'bare';
}
export function assertMatchCapability(room: PolicyRoom, capability: MatchCapability): void {
  if (capability === 'analysis' && analysisUnsupported(room)) throw new RoomError(403, 'ANALYSIS_UNAVAILABLE',
    'Hosted analysis is not available for MICRO MUJU rooms. Use muju_legal_actions and muju_preview.');
  if (!allowsMatchCapability(room, capability)) throw new RoomError(403, 'MATCH_TOOL_RESTRICTED',
    `This room's immutable ${room.matchPolicy!.toolTier} match tier disables hosted ${capability}.`);
}
