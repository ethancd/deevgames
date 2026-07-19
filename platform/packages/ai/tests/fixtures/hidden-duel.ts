// Imperfect-information fixture for ISMCTS tests: a 6-card (values 1-6),
// 3-tricks trick-taking duel. Cards are dealt 3/3 from a full 6-card deck —
// every card is always somebody's, none left over — so a seat's own hand
// plus the publicly-revealed play history *fully determines* the opponent's
// remaining hand by set complement. That's deliberate: it makes `exactBelief`
// a genuinely correct (if degenerate — uniform over a one-element set of
// consistent deals) belief, and it makes `wrongBelief`'s error isolable and
// unambiguous: wrongBelief is written to forget to exclude the seat's own
// hand from the "unknown" pool, so it sometimes credits the opponent with
// cards the seat is actually holding, then deterministically assumes the
// opponent holds the LOWEST-valued cards from that (incorrectly large) pool.
// That is a realistic implementation mistake, not a contrived one, and it
// produces a real, testable performance gap against the correct model.

import type { GameDef, Rng, Seat } from '@deev/core';
import type { BeliefModel } from '../../src/belief.ts';

const SEAT_A = 'A';
const SEAT_B = 'B';
const DECK = [1, 2, 3, 4, 5, 6];

function other(seat: Seat): Seat {
  return seat === SEAT_A ? SEAT_B : SEAT_A;
}

export interface HiddenDuelState {
  hands: Record<Seat, number[]>;
  /** Card played by the trick's leader once they've moved, before the
   * follower responds. Cleared when the trick resolves. */
  playedThisTrick: Partial<Record<Seat, number>>;
  /** Every card played by either seat so far, in play order — public. */
  revealed: number[];
  tricksWon: Record<Seat, number>;
  leader: Seat;
  toMove: Seat;
}

export type HiddenDuelAction = number; // the card value to play

// Deliberately empty: the deal is dealt fresh from the engine rng in init(),
// not fixed by config. A fixed config (e.g. odds-to-A, evens-to-B) makes one
// seat's hand card-for-card stronger than the other's, which then dominates
// game outcomes regardless of either bot's decision quality — exactly the
// kind of confound a "does belief quality affect outcomes" test must avoid.
// Re-dealing per game (each game gets its own engine seed via runSeries)
// means outcomes average over many different hand-strength matchups instead
// of being decided by one fixed, possibly lopsided, deal.
export type HiddenDuelConfig = Record<string, never>;

export interface HiddenDuelView {
  seat: Seat;
  ownHand: number[];
  opponentHandCount: number;
  playedThisTrick: Partial<Record<Seat, number>>;
  revealed: number[];
  tricksWon: Record<Seat, number>;
  leader: Seat;
  toMove: Seat;
}

export const hiddenDuel: GameDef<HiddenDuelState, HiddenDuelAction, HiddenDuelConfig, HiddenDuelView> = {
  id: 'fixture-hidden-duel',
  version: '1.0.0',
  init(_config: HiddenDuelConfig, rng: Rng): HiddenDuelState {
    const dealt = rng.shuffle(DECK);
    return {
      hands: { [SEAT_A]: dealt.slice(0, 3), [SEAT_B]: dealt.slice(3, 6) },
      playedThisTrick: {},
      revealed: [],
      tricksWon: { [SEAT_A]: 0, [SEAT_B]: 0 },
      leader: SEAT_A,
      toMove: SEAT_A,
    };
  },
  seats(_config: HiddenDuelConfig): Seat[] {
    return [SEAT_A, SEAT_B];
  },
  toAct(state: HiddenDuelState): Seat[] {
    return [state.toMove];
  },
  legal(state: HiddenDuelState, seat: Seat): HiddenDuelAction[] {
    return state.hands[seat].slice();
  },
  apply(state: HiddenDuelState, action: HiddenDuelAction, _rng: Rng): HiddenDuelState {
    const mover = state.toMove;
    const hands: Record<Seat, number[]> = {
      [SEAT_A]: state.hands[SEAT_A].slice(),
      [SEAT_B]: state.hands[SEAT_B].slice(),
    };
    hands[mover] = hands[mover].filter((c) => c !== action);
    const revealed = [...state.revealed, action];

    if (state.playedThisTrick[state.leader] === undefined) {
      // Leader just played; follower goes next.
      return {
        hands,
        playedThisTrick: { ...state.playedThisTrick, [mover]: action },
        revealed,
        tricksWon: state.tricksWon,
        leader: state.leader,
        toMove: other(mover),
      };
    }

    // Follower just played; resolve the trick.
    const leaderCard = state.playedThisTrick[state.leader]!;
    const trickWinner = action > leaderCard ? mover : state.leader;
    const tricksWon = { ...state.tricksWon, [trickWinner]: state.tricksWon[trickWinner] + 1 };
    return {
      hands,
      playedThisTrick: {},
      revealed,
      tricksWon,
      leader: trickWinner,
      toMove: trickWinner,
    };
  },
  terminal(state: HiddenDuelState) {
    if (state.hands[SEAT_A].length === 0 && state.hands[SEAT_B].length === 0) {
      const winner = state.tricksWon[SEAT_A] > state.tricksWon[SEAT_B] ? SEAT_A : SEAT_B;
      return { winner, scores: { ...state.tricksWon }, reason: 'tricks-complete' };
    }
    return null;
  },
  score(state: HiddenDuelState, seat: Seat): number {
    // Normalized to roughly [-1, 1] — makeIsmctsBot's UCT exploration
    // constant is tuned for that scale (see ismcts.ts), so an unbounded
    // evaluate()/score() would swamp exploration and lock in the first
    // decent-looking move. Tricks already banked (at most 3) dominate;
    // remaining hand total is a light tie-breaker. This gives the default
    // (no-planner) greedy rollout real per-ply signal — in particular, a
    // following seat's candidate plays are scored *after* def.apply resolves
    // that trick, so "would this card win the trick" is directly visible,
    // not just at game end.
    const opp = other(seat);
    const trickDiff = state.tricksWon[seat] - state.tricksWon[opp];
    const handDiff =
      state.hands[seat].reduce((a, b) => a + b, 0) - state.hands[opp].reduce((a, b) => a + b, 0);
    return trickDiff / 3 + (handDiff / 21) * 0.2;
  },
  observe(state: HiddenDuelState, seat: Seat): HiddenDuelView {
    const opp = other(seat);
    return {
      seat,
      ownHand: state.hands[seat].slice(),
      opponentHandCount: state.hands[opp].length,
      playedThisTrick: { ...state.playedThisTrick },
      revealed: state.revealed.slice(),
      tricksWon: { ...state.tricksWon },
      leader: state.leader,
      toMove: state.toMove,
    };
  },
};

/** The only config this fixture needs — the deal itself is dealt in init(). */
export function standardConfig(): HiddenDuelConfig {
  return {};
}

function correctUnknownPool(view: HiddenDuelView): number[] {
  const known = new Set([...view.ownHand, ...view.revealed]);
  return DECK.filter((c) => !known.has(c));
}

/** Forgets to exclude the seat's own hand — the deliberate bug. */
function buggyUnknownPool(view: HiddenDuelView): number[] {
  const known = new Set(view.revealed);
  return DECK.filter((c) => !known.has(c));
}

function worldFromHand(view: HiddenDuelView, opponentHand: number[]): HiddenDuelState {
  const opp = other(view.seat);
  return {
    hands: { [view.seat]: view.ownHand.slice(), [opp]: opponentHand },
    playedThisTrick: { ...view.playedThisTrick },
    revealed: view.revealed.slice(),
    tricksWon: { ...view.tricksWon },
    leader: view.leader,
    toMove: view.toMove,
  };
}

/** Uniform over consistent deals — here that set always has exactly one
 * element (the deck-minus-known complement), so "uniform" degenerates to
 * certainty, which is the mathematically correct posterior given a fully-
 * dealt, no-leftover deck. */
export const exactBelief: BeliefModel<HiddenDuelView, HiddenDuelState> = {
  sampleWorld(view: HiddenDuelView, _rng: Rng): HiddenDuelState {
    return worldFromHand(view, correctUnknownPool(view));
  },
};

/** Deliberately wrong: draws from a pool that still includes the seat's own
 * hand, then assumes the opponent holds the lowest-valued cards in it. */
export const wrongBelief: BeliefModel<HiddenDuelView, HiddenDuelState> = {
  sampleWorld(view: HiddenDuelView, _rng: Rng): HiddenDuelState {
    const pool = buggyUnknownPool(view).sort((a, b) => a - b);
    return worldFromHand(view, pool.slice(0, view.opponentHandCount));
  },
};

/** Trivial belief for the perfect-info-degeneration test: treats the view as
 * if it were already the full state (only valid because hands are exposed
 * from init() directly in that test's own config, not via this file). */
export function viewAsStateBelief<O, S>(): BeliefModel<O, S> {
  return {
    sampleWorld(view: O, _rng: Rng): S {
      return view as unknown as S;
    },
  };
}
