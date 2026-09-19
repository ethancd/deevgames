/** P1 rules-bound replay helpers. The historical ../openings.ts stays Standard
 * until the ladder owner ports its callers. Never reinterpret an old corpus. */
import { createInitialGameState } from '../../../../src/game/board';
import { isLegalAction } from '../../../../src/game/legality';
import { applyAction } from '../../../../src/ai/simulate';
import { checkInvariants } from '../../../harness/invariants';
import type { GameState } from '../../../../src/game/types';
import {
  resolveOpeningAction, withOpeningRules, gameplayDigest as boardDigest, sha256,
  type OpeningStateOptions, type OpeningSpec,
} from '../openings';

export const RULES_VERSION = 'muju-phasing-1' as const;

export function initialStateFor(options: OpeningStateOptions = {}): GameState {
  return createInitialGameState(options.resourceLayout, options.actionsPerTurn, options.blackCrystalHandicap, 'phasing');
}

export function applyOpening(opening: OpeningSpec, options: OpeningStateOptions = {}): GameState {
  if (!opening.id.startsWith('p1-')) throw new Error('P1 replay refuses a non-p1 opening id; historical corpora use Standard');
  return withOpeningRules(options, () => {
    let state = initialStateFor(options);
    for (let i = 0; i < opening.actions.length; i++) {
      const where = `P1 opening ${opening.id} action ${i}`;
      const action = resolveOpeningAction(state, opening.actions[i], where);
      if (state.phase !== 'playing' || !isLegalAction(state, action, state.turn.currentPlayer)) {
        throw new Error(`${where}: illegal action`);
      }
      const next = applyAction(state, action);
      if (next === state) throw new Error(`${where}: simulator no-op`);
      checkInvariants(next, where);
      state = next;
    }
    if (state.phase !== 'playing') throw new Error(`P1 opening ${opening.id}: terminal position`);
    return state;
  });
}

/** Stable across minted ids and ordering; pending type, owner, square AND paid
 * cost change the position. Standard and Phasing can never share a digest. */
export function gameplayDigest(state: GameState): string {
  if (state.ruleset !== 'phasing') throw new Error('P1 digest requires Phasing');
  const pending = (state.pendingSummons ?? []).map(s => ({
    owner: s.owner, definitionId: s.definitionId, x: s.position.x, y: s.position.y, cost: s.cost,
  })).sort((a, b) => a.owner.localeCompare(b.owner) || a.y - b.y || a.x - b.x || a.definitionId.localeCompare(b.definitionId) || a.cost - b.cost);
  return sha256(JSON.stringify({ rulesVersion: RULES_VERSION, board: boardDigest(state), pending }));
}

export function validateOpenings(openings: readonly OpeningSpec[], handicaps: readonly number[] = [0, 3]): void {
  for (const opening of openings) for (const blackCrystalHandicap of handicaps) {
    applyOpening(opening, { blackCrystalHandicap });
  }
}
