// The Opponent seam — how the web UI gets north's moves.
//
// Stage B (src/bots.ts, tesserMinimaxBot) is built in parallel and may or
// may not exist. The seam therefore resolves in two layers:
//
//   1. A guarded dynamic import of '../src/bots.ts' via import.meta.glob —
//      glob returns {} when the module is absent, so the build never breaks
//      and nothing is even fetched until the AI's first move. When present,
//      `tesserMinimaxBot(budget)` is used with per-difficulty search budgets
//      (MINIMAX_BUDGETS below — search depth/nodes only, never rules).
//   2. A built-in greedy fallback over def.score: pick the legal action
//      maximizing score after apply, ties broken by first in legal() order.
//      Difficulty presets for the fallback: easy = slightly randomized
//      greedy, medium = pure greedy, hard = greedy with a one-reply
//      lookahead. Any failure in layer 1 (missing export, signature drift,
//      a throwing bot) falls back here per call.

import { tesser } from '../src/index.ts';
import type { TesserAction, TesserSeat, TesserState } from '../src/index.ts';
import { mulberry32, stableStringify, type Rng } from '@deev/core';

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export interface Opponent {
  name: string;
  choose(state: TesserState, seat: TesserSeat, legal: TesserAction[], rng: Rng): TesserAction;
}

// tesser.apply never draws from rng (fully deterministic game), so a single
// throwaway stream satisfies the GameDef.apply signature.
const deadRng = mulberry32(0);

function scoreOf(state: TesserState, seat: TesserSeat): number {
  return tesser.score!(state, seat);
}

/** Greedy over def.score: max score after apply; ties -> first in legal() order. */
export function greedyChoose(
  state: TesserState,
  seat: TesserSeat,
  legal: TesserAction[],
): TesserAction {
  let best = legal[0];
  let bestValue = -Infinity;
  for (const action of legal) {
    const value = scoreOf(tesser.apply(state, action, deadRng), seat);
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  return best;
}

/** Greedy with one lookahead ply: value = score after the opponent's greedy reply. */
function lookaheadChoose(
  state: TesserState,
  seat: TesserSeat,
  legal: TesserAction[],
): TesserAction {
  const opp: TesserSeat = seat === 'south' ? 'north' : 'south';
  let best = legal[0];
  let bestValue = -Infinity;
  for (const action of legal) {
    const after = tesser.apply(state, action, deadRng);
    const term = tesser.terminal(after);
    let value: number;
    if (term !== null) {
      value = term.winner === seat ? 1e6 : term.winner === opp ? -1e6 : 0;
    } else {
      const reply = greedyChoose(after, opp, tesser.legal(after, opp));
      value = scoreOf(tesser.apply(after, reply, deadRng), seat);
    }
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  return best;
}

export function greedyOpponent(difficulty: Difficulty): Opponent {
  return {
    name: `greedy-${difficulty}`,
    choose(state, seat, legal, rng) {
      if (difficulty === 'easy' && rng.next() < 0.35) return rng.pick(legal);
      if (difficulty === 'hard') return lookaheadChoose(state, seat, legal);
      return greedyChoose(state, seat, legal);
    },
  };
}

// ---------------------------------------------------------------------------
// Guarded dynamic import of Stage B. import.meta.glob is resolved at build
// time: an empty record when src/bots.ts does not exist, a lazy loader when
// it does — so the app builds and runs either way.

type BotModule = Record<string, unknown>;

interface BotLike {
  choose(ctx: { view: TesserState; seat: TesserSeat; legal: TesserAction[]; rng: Rng }): TesserAction;
}

const botModules = import.meta.glob('../src/bots.ts') as Record<string, () => Promise<BotModule>>;

// Difficulty = search budget only (platform doctrine, @deev/ai/budget.ts).
// Explicit SearchBudget-shaped objects rather than the generic 'easy'/'hard'
// preset names: @deev/ai's own docs say real games with big branching should
// pass explicit budgets, and Stage B's tuned default is {depth 3, maxNodes
// 1500} — these scale around it so 'hard' stays responsive in a tap handler.
const MINIMAX_BUDGETS: Record<Difficulty, { depth: number; maxNodes: number }> = {
  easy: { depth: 2, maxNodes: 800 },
  medium: { depth: 3, maxNodes: 1500 },
  hard: { depth: 4, maxNodes: 6000 },
};

function sameAction(a: TesserAction, b: TesserAction): boolean {
  return stableStringify(a) === stableStringify(b);
}

export async function loadOpponent(difficulty: Difficulty): Promise<Opponent> {
  const fallback = greedyOpponent(difficulty);
  const loader = botModules['../src/bots.ts'];
  if (!loader) return fallback;

  let bot: BotLike;
  try {
    const mod = await loader();
    const make = mod['tesserMinimaxBot'];
    if (typeof make !== 'function') return fallback;
    const made: unknown = (make as (budget: unknown) => unknown)(MINIMAX_BUDGETS[difficulty]);
    if (
      made === null ||
      typeof made !== 'object' ||
      typeof (made as BotLike).choose !== 'function'
    ) {
      return fallback;
    }
    bot = made as BotLike;
  } catch {
    return fallback;
  }

  return {
    name: `tesser-minimax-${difficulty}`,
    choose(state, seat, legal, rng) {
      try {
        const action = bot.choose({ view: state, seat, legal, rng });
        if (legal.some((l) => sameAction(l, action))) return action;
      } catch {
        // fall through to greedy
      }
      return fallback.choose(state, seat, legal, rng);
    },
  };
}
