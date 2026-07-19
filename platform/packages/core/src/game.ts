// The central contract every platform game implements.
//
// Design decisions (locked in by the ultraplan review — see
// docs/game-design-dossier.md and the platform README for provenance):
//
// - toAct() answers "whose turn": alternating games return [current seat],
//   simultaneous-commitment games (Ninja Tanks shape) return all committing
//   seats, single-player games return their one seat.
// - legal() is NEVER empty for a seat in toAct() at a non-terminal state.
//   Games must reify pass/end-turn as explicit actions; there is no null-pass
//   anywhere on the platform.
// - apply() is pure and immutable, and the engine RNG stream advances ONLY
//   inside apply(). All other randomness (bots, UI) uses forked streams.
// - Simultaneous games (|toAct()| > 1): each committing seat submits an
//   action; the harness applies them in toAct()'s order (canonical seat
//   order). observe() must mask committed-but-unrevealed actions so a seat
//   cannot see the other side's commitment before resolution.

import type { Rng } from './rng.ts';

/** Stable, serializable seat id: 'white' | 'black' | 'solo' | ... */
export type Seat = string;

export interface Result {
  /** null = draw (or not applicable, e.g. pure-score single-player games). */
  winner: Seat | null;
  scores?: Record<Seat, number>;
  /** Machine-readable cause: 'elimination', 'adjudicated', 'invariant-violation', ... */
  reason: string;
}

export interface GameDef<S, A, C = unknown, O = S> {
  id: string;
  /** Bump on any logic change — engineHash is hash(id + ':' + version). */
  version: string;
  init(config: C, rng: Rng): S;
  /** Seats for a given config. Constant per config. */
  seats(config: C): Seat[];
  /** Seats that must act now. See header notes for the three shapes. */
  toAct(state: S): Seat[];
  /**
   * Legal actions for one seat. INVARIANT: non-empty for every seat in
   * toAct(state) whenever terminal(state) is null.
   */
  legal(state: S, seat: Seat): A[];
  /** Pure, immutable transition. Engine randomness is drawn only here. */
  apply(state: S, action: A, rng: Rng): S;
  terminal(state: S): Result | null;
  /**
   * Hidden-information mask: what `seat` may see. Identity when omitted
   * (perfect information, O = S).
   */
  observe?(state: S, seat: Seat): O;
  /**
   * Optional evaluation seam: higher = better for seat. Used by lab
   * adjudication, greedyBot, and @deev/ai evaluators.
   */
  score?(state: S, seat: Seat): number;
  /**
   * Undo-boundary hint: true for actions that reveal information or commit
   * an irreversible step (draw a card, submit a simultaneous move). UndoStack
   * refuses to pop across these by default.
   */
  isCommitPoint?(state: S, action: A): boolean;
}

/** The default observation for perfect-information games. */
export function observeAs<S, A, C, O>(
  def: GameDef<S, A, C, O>,
  state: S,
  seat: Seat,
): O {
  return def.observe ? def.observe(state, seat) : (state as unknown as O);
}
