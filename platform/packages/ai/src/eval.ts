// Named-factor evaluation combinator, generalizing muju's ~15-factor
// DEFAULT_WEIGHTS pattern (see muju/src/ai/evaluation.ts + types.ts): every
// concrete factor is `weight * measure(state, seat)`, summed. Concrete
// per-game factors (unit value, territory, threats, ...) stay game-side —
// this module only supplies the combinator plumbing plus the one factor
// derivable from GameDef alone: optionality.

import type { GameDef, Seat } from '@deev/core';

export interface EvalFactor<S> {
  name: string;
  weight: number;
  /** Higher = better for `seat`. */
  measure(state: S, seat: Seat): number;
}

export interface ExplainEntry {
  name: string;
  raw: number;
  weighted: number;
}

/**
 * A callable (state, seat) => number carrying its factor list plus two
 * combinators:
 *  - .with(overrides): reweight by factor name (lab sweeps over weights
 *    without rebuilding the factor list). Unknown names in `overrides` are
 *    ignored; factors not named are kept at their existing weight.
 *  - .explain(state, seat): per-factor {name, raw, weighted} contributions.
 *    Summing `.weighted` across the array reproduces the eval's own value —
 *    exercised directly by the eval combinator test.
 */
export interface NamedEval<S> {
  (state: S, seat: Seat): number;
  factors: EvalFactor<S>[];
  with(overrides: Record<string, number>): NamedEval<S>;
  explain(state: S, seat: Seat): ExplainEntry[];
}

export function composeEval<S>(factors: EvalFactor<S>[]): NamedEval<S> {
  const fn = ((state: S, seat: Seat): number =>
    factors.reduce((sum, f) => sum + f.weight * f.measure(state, seat), 0)) as NamedEval<S>;

  fn.factors = factors;

  fn.with = (overrides: Record<string, number>): NamedEval<S> =>
    composeEval(
      factors.map((f) => (Object.hasOwn(overrides, f.name) ? { ...f, weight: overrides[f.name] } : f)),
    );

  fn.explain = (state: S, seat: Seat): ExplainEntry[] =>
    factors.map((f) => {
      const raw = f.measure(state, seat);
      return { name: f.name, raw, weighted: f.weight * raw };
    });

  return fn;
}

/** (a - b) / (a + b), 0-safe: returns 0 when both are 0 rather than NaN. */
export function normalizeAdvantage(a: number, b: number): number {
  const total = a + b;
  return total === 0 ? 0 : (a - b) / total;
}

/**
 * The one factor derivable from GameDef alone: mobility (the minimax-ai
 * skill's optionality principle) — `seat`'s legal-move count vs. the mean of
 * its opponents' legal-move counts, normalized to [-1, 1].
 *
 * GameDef exposes no way to list "all seats" from a bare state (seats() needs
 * `config`, which isn't available in the eval seam — see minimax.ts/ismcts.ts
 * for the same constraint). This factor therefore *discovers* the other
 * seat(s) lazily: every measure() call folds `seat` and def.toAct(state)
 * into a closure-held registry, and "opponents" means every other seat ever
 * seen by this factor instance. Until at least one other seat has been
 * observed, the opponent term is treated as neutral (contributes 0) rather
 * than guessed — call it once per seat (e.g. against a couple of positions,
 * or just let a real search warm it up) before relying on its output.
 */
export function optionalityFactor<S, A, C, O>(
  def: GameDef<S, A, C, O>,
  weight = 0.1,
): EvalFactor<S> {
  const seatsSeen = new Set<Seat>();
  return {
    name: 'optionality',
    weight,
    measure(state: S, seat: Seat): number {
      seatsSeen.add(seat);
      for (const s of def.toAct(state)) seatsSeen.add(s);

      const own = def.legal(state, seat).length;
      const opponents = [...seatsSeen].filter((s) => s !== seat);
      if (opponents.length === 0) return 0;

      const oppMean =
        opponents.reduce((sum, s) => sum + def.legal(state, s).length, 0) / opponents.length;
      return normalizeAdvantage(own, oppMean);
    },
  };
}
