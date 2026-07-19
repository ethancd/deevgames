// Bot policy union for the lab: both halves of muju's harness, generalized
// over any @deev/core GameDef.
//
// - ScriptedBot: sees only its observe()-masked view + the pre-filtered legal
//   set. No null-pass — legal is never empty for an acting seat (the platform
//   invariant), so a ScriptedBot always returns one of `legal`.
// - RawBot: sees the full engine state and does its own thing (a real AI
//   engine's own internal masking/belief layer). It returns `A | null`; null
//   means "the engine emitted nothing" and is never treated as a pass — see
//   runner.ts for exactly how that's handled.

import type { GameDef, Rng, Seat } from '@deev/core';

export interface ScriptedBotContext<O, A> {
  view: O;
  seat: Seat;
  legal: A[];
  rng: Rng;
}

export interface ScriptedBot<O, A> {
  name: string;
  choose(ctx: ScriptedBotContext<O, A>): A;
  onGameStart?(seat: Seat, seed: number): void;
}

export interface RawBot<S, A> {
  name: string;
  /** null = "the engine emitted nothing this ply" — never a pass. */
  nextAction(state: S, seat: Seat): Promise<A | null>;
  onGameStart?(seat: Seat, seed: number): void;
}

export type Bot<S, A, O = S> = ScriptedBot<O, A> | RawBot<S, A>;

export function isRawBot<S, A, O>(bot: Bot<S, A, O>): bot is RawBot<S, A> {
  return typeof (bot as RawBot<S, A>).nextAction === 'function';
}

/** L0 — uniform random over whatever legal set it's handed. */
export function randomBot<O, A>(name = 'Random'): ScriptedBot<O, A> {
  return {
    name,
    choose({ legal, rng }) {
      return rng.pick(legal);
    },
  };
}

/**
 * L1 — one-ply greedy: scores every legal action by applying it and running
 * (scoreFn ?? def.score) on the successor, then picks the argmax (first max
 * wins ties, deterministic given the rng's fork ordering).
 *
 * Perfect-info only: requires def.observe to be undefined (O = S), because
 * scoring successors means calling def.apply on the bot's `view`, which must
 * therefore already be the full state. Each preview apply uses a scratch rng
 * forked off the bot's own stream (`rng.fork('greedy-preview:<i>')`) so
 * previewing candidate moves can never perturb the bot's real stream or the
 * engine's — forking is an observation, not a draw (see @deev/core's rng
 * docs), and every candidate gets an independent fork so preview order can't
 * leak into which preview "used up" randomness.
 */
export function greedyBot<S, A, C = unknown>(
  def: GameDef<S, A, C, S>,
  scoreFn?: (state: S, seat: Seat) => number,
  name = 'Greedy',
): ScriptedBot<S, A> {
  if (def.observe !== undefined) {
    throw new Error(
      `greedyBot: '${def.id}' defines observe() — greedyBot requires perfect information (O = S). ` +
        `Use an imperfect-information-aware bot instead (e.g. @deev/ai's makeIsmctsBot).`,
    );
  }
  const score = scoreFn ?? def.score;
  if (!score) {
    throw new Error(
      `greedyBot: '${def.id}' has neither a scoreFn argument nor def.score — nothing to rank successors by.`,
    );
  }
  return {
    name,
    choose({ view, seat, legal, rng }) {
      let bestAction = legal[0];
      let bestScore = -Infinity;
      legal.forEach((action, i) => {
        const previewRng = rng.fork(`greedy-preview:${i}`);
        const next = def.apply(view, action, previewRng);
        const s = score(next, seat);
        if (s > bestScore) {
          bestScore = s;
          bestAction = action;
        }
      });
      return bestAction;
    },
  };
}
