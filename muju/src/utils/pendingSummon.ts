import type { BoardState, PendingSummon } from '../game/types';
import { isValidSpawnPosition } from '../game/spawning';

/**
 * Whether a pending (Phasing) summon would currently fail to arrive if its
 * owner's turn started right now: its square is occupied, or every spawn
 * rectangle that could support it is gone or enemy-blocked. Pure function of
 * the live board, so callers can re-derive it on every state change (e.g. to
 * fade a doomed commitment during the opponent's turn) instead of caching it.
 *
 * Lives under utils, not game: the Phasing suite bundle pins every file under
 * src/game by hash, and this is a UI-only reading of the engine's spawn rule.
 */
export function isPendingSummonDoomed(
  summon: Pick<PendingSummon, 'position' | 'owner'>,
  board: BoardState
): boolean {
  return !isValidSpawnPosition(summon.position, summon.owner, board);
}
