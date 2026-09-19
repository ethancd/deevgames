import type { ScriptedBot } from '../types';
import { pick } from '../rng';
import { phaseEndAction } from '../../../src/game/legality';
import { safeCommitSquares, disruptedByMove } from './bot-utils';

/** L0: random legal play, with only the common Phasing commit/deny awareness. */
export function createRandomBot(): ScriptedBot {
  return {
    kind: 'scripted', name: 'Random',
    chooseAction({ view, legal, rng }) {
      const safe = view.phase === 'place' ? safeCommitSquares(view) : new Set<string>();
      const hasSafeBuy = legal.some(a => a.type === 'BUY_UNIT' && safe.has(`${a.position.x},${a.position.y}`));
      const candidates = legal.filter(a => a.type !== 'BUY_UNIT' || !hasSafeBuy || safe.has(`${a.position.x},${a.position.y}`));
      // Remain a random floor, with a small bias to use the new public signal.
      const disrupt = candidates.filter(a => a.type === 'MOVE' && disruptedByMove(view, a) > 0);
      const action = pick(rng, disrupt.length && rng() < 0.25 ? disrupt : candidates);
      return !action || action.type === 'END_ACTION_PHASE' || action.type === 'END_PLACE_PHASE'
        ? phaseEndAction(view.state) : action;
    },
  };
}
