// Seeded match driver producing self-describing transcripts.

import type { GameDef, Seat, Result } from './game.ts';
import { mulberry32, type Rng } from './rng.ts';
import { engineHash, configHash, stateHash } from './hash.ts';

export interface Policy<S, A, O = S> {
  /** Called with this seat's observation; must return one of `legal`. */
  choose(view: O, seat: Seat, legal: A[], rng: Rng): A;
}

export interface TranscriptEntry<A> {
  seat: Seat;
  action: A;
}

export interface Transcript<A, C = unknown> {
  schema: 'deev-transcript-v1';
  gameId: string;
  gameVersion: string;
  engineHash: string;
  configHash: string;
  config: C;
  seed: number;
  actions: TranscriptEntry<A>[];
  result: Result;
  finalStateHash: string;
}

export interface RunMatchOptions<S> {
  /** Hard ply cap; the match is adjudicated when it's hit. Default 10_000. */
  maxPlies?: number;
  /** Called when maxPlies is hit. Default: draw with reason 'adjudicated:max-plies'. */
  adjudicate?: (state: S) => Result;
}

/**
 * Run one seeded match. The engine stream (advanced only in apply) derives
 * from `seed`; each seat's policy gets its own forked stream, so policy
 * randomness can never perturb engine randomness.
 *
 * Simultaneous games: when |toAct| > 1, every acting seat chooses against the
 * same pre-commitment state (each seeing only its own observe() view), then
 * actions apply in toAct() order.
 */
export function runMatch<S, A, C, O>(
  def: GameDef<S, A, C, O>,
  config: C,
  seed: number,
  policies: Record<Seat, Policy<S, A, O>>,
  options: RunMatchOptions<S> = {},
): Transcript<A, C> {
  const maxPlies = options.maxPlies ?? 10_000;
  const engineRng = mulberry32(seed);
  const seatRngs = new Map<Seat, Rng>();
  for (const seat of def.seats(config)) {
    seatRngs.set(seat, mulberry32(seed).fork(`policy:${seat}`));
  }

  let state = def.init(config, engineRng);
  const actions: TranscriptEntry<A>[] = [];
  let result: Result | null = def.terminal(state);
  let plies = 0;

  while (result === null) {
    if (plies >= maxPlies) {
      result = options.adjudicate
        ? options.adjudicate(state)
        : { winner: null, reason: 'adjudicated:max-plies' };
      break;
    }
    const acting = def.toAct(state);
    if (acting.length === 0) {
      throw new Error(`${def.id}: toAct() returned no seats at a non-terminal state`);
    }
    // Simultaneous commitment: everyone chooses against the same state.
    const chosen: TranscriptEntry<A>[] = acting.map((seat) => {
      const legal = def.legal(state, seat);
      if (legal.length === 0) {
        throw new Error(
          `${def.id}: legal() empty for acting seat '${seat}' at a non-terminal state — ` +
            `games must reify pass/end-turn as an explicit action`,
        );
      }
      const policy = policies[seat];
      if (!policy) throw new Error(`runMatch: no policy for seat '${seat}'`);
      const view = def.observe ? def.observe(state, seat) : (state as unknown as O);
      const action = policy.choose(view, seat, legal, seatRngs.get(seat) ?? mulberry32(seed));
      return { seat, action };
    });
    for (const entry of chosen) {
      state = def.apply(state, entry.action, engineRng);
      actions.push(entry);
      plies++;
      result = def.terminal(state);
      if (result !== null) break; // remaining simultaneous commitments moot
    }
  }

  return {
    schema: 'deev-transcript-v1',
    gameId: def.id,
    gameVersion: def.version,
    engineHash: engineHash(def),
    configHash: configHash(config),
    config,
    seed,
    actions,
    result,
    finalStateHash: stateHash(state),
  };
}
