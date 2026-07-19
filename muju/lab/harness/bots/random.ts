import type { ScriptedBot } from '../types';
import { pick } from '../rng';

/**
 * L0 — uniform random over the legal action set (the same distribution the
 * engine property tests playout uses). Floor of the ladder.
 */
export function createRandomBot(): ScriptedBot {
  return {
    kind: 'scripted',
    name: 'Random',
    chooseAction({ legal, rng }) {
      return pick(rng, legal) ?? null;
    },
  };
}
