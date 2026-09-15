/**
 * Canonical replay of a chosen turn (DESIGN §4.17 `verify/replay.ts`, §1 step 4).
 *
 * The replica is fast; the canonical engine is the truth. Nothing the search
 * chooses reaches the UI or the ladder until it has been decoded to
 * `AIAction[]`, re-validated action by action with `isLegalAction`
 * (`src/game/legality.ts:16` — the same check the WASM host already performs,
 * `src/ai/wasm/kernel.ts:78`) and applied through `applyAction`
 * (`src/ai/simulate.ts:25`). The line is TRUNCATED at the first action the
 * canonical engine will not take, so a divergence costs the rest of the turn
 * and never an illegal dispatch.
 *
 * The final check is the `Kpos` of the re-packed end position against the
 * `endLo`/`endHi` the `Turn` claims. That catches the class of bug legality
 * alone cannot: a line every action of which is legal, but which leaves the
 * canonical engine in a different position than the replica thought — a
 * make/unmake, income or prover divergence. `divergedAt` is the index of the
 * first rejected action, or `-1` when the whole line replayed;
 * `verified` additionally requires the `Kpos` match.
 */
import { isLegalAction } from '../../../game/legality';
import type { GameState } from '../../../game/types';
import { applyAction } from '../../simulate';
import type { AIAction } from '../../types';
import type { KeepSetTable } from '../core/action';
import { PackError, Replica, allocState } from '../core/state';
import { decodeTurn, type Turn } from '../gen/turn';
import type { PackedState } from '../types';

export interface ReplayCheck {
  actions: AIAction[];
  verified: boolean;
  divergedAt: number;
  reason?: string;
  endState: GameState;
}

/** Scratch for the re-pack; `verifyTurn` is a root/PV-path function. */
const REPACKED: PackedState = allocState();

/**
 * DESIGN §4.17. Decodes `t` against `p` (the pre-turn packed state), replays it
 * through the canonical engine from `state`, and reports what survived.
 *
 * `keep` is the keep-set table the turn's `PAY_UPKEEP` index refers to; it must
 * be the same table the search generated the turn against.
 */
export function verifyTurn(rep: Replica, state: GameState, p: PackedState, t: Turn, keep: KeepSetTable): ReplayCheck {
  let decoded: AIAction[];
  try {
    decoded = decodeTurn(p, t, keep);
  } catch (err) {
    return {
      actions: [],
      verified: false,
      divergedAt: 0,
      reason: `decode failed: ${err instanceof Error ? err.message : String(err)}`,
      endState: state,
    };
  }

  const accepted: AIAction[] = [];
  let current = state;
  for (let i = 0; i < decoded.length; i++) {
    const action = decoded[i];
    if (!isLegalAction(current, action)) {
      return {
        actions: accepted,
        verified: false,
        divergedAt: i,
        reason: `isLegalAction rejected ${action.type} at index ${i}`,
        endState: current,
      };
    }
    const next = applyAction(current, action);
    if (next === current) {
      return {
        actions: accepted,
        verified: false,
        divergedAt: i,
        reason: `applyAction was a no-op for ${action.type} at index ${i}`,
        endState: current,
      };
    }
    accepted.push(action);
    current = next;
  }

  // Every action landed; does the canonical end position agree with the one
  // the replica recorded when it generated the turn? `Kpos` is defined for a
  // decided position too (the packer accepts any non-setup phase), so a turn
  // that ENDED the game is compared exactly like any other.
  try {
    rep.pack(current, REPACKED);
  } catch (err) {
    return {
      actions: accepted,
      verified: false,
      divergedAt: -1,
      reason: `re-pack failed: ${err instanceof PackError ? err.message : String(err)}`,
      endState: current,
    };
  }

  if (REPACKED.kposLo !== t.endLo || REPACKED.kposHi !== t.endHi) {
    return {
      actions: accepted,
      verified: false,
      divergedAt: -1,
      reason: `Kpos mismatch: replica ${keyHex(t.endHi, t.endLo)} vs canonical ${keyHex(REPACKED.kposHi, REPACKED.kposLo)}`,
      endState: current,
    };
  }

  return { actions: accepted, verified: true, divergedAt: -1, endState: current };
}

function keyHex(hi: number, lo: number): string {
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}
