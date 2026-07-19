// TESSER Stage B bots — SPEC.md §3 Stage B.
//
// tesserMinimaxBot: @deev/ai's alpha-beta negamax over the tesser GameDef and
// the Stage B eval, with tesser-specific move ordering and the transposition
// table on.

import type { Seat } from '@deev/core';
import {
  makeMinimaxBot,
  type AiBot,
  type BudgetPreset,
  type SearchBudget,
} from '@deev/ai';
import { tesser, type TesserAction, type TesserState } from './game.ts';
import { tesserEval } from './eval.ts';

/**
 * Default Stage B budget: depth 3 with a hard node cap per move so that
 * 60-game lab series stay inside the vitest suite budget. The cap bounds the
 * whole choose() call; combined with attacks-first ordering the capped search
 * always examines the tactical candidates first. Recorded in REPORT.md.
 */
export const TESSER_MINIMAX_BUDGET: SearchBudget = { depth: 3, maxNodes: 1500 };

const TYPE_RANK: Record<TesserAction['type'], number> = {
  attack: 0,
  fold: 1,
  move: 2,
  pass: 3,
};

/**
 * Move ordering for alpha-beta: attacks first, then folds, then moves by
 * distance (steps) descending, pass last. Stable sort, so within a rank the
 * engine's deterministic legal() ordering is preserved.
 */
export function orderTesserMoves(
  actions: TesserAction[],
  _state: TesserState,
  _seat: Seat,
): TesserAction[] {
  return actions.sort((a, b) => {
    const ra = TYPE_RANK[a.type];
    const rb = TYPE_RANK[b.type];
    if (ra !== rb) return ra - rb;
    if (a.type === 'move' && b.type === 'move') return b.steps - a.steps;
    return 0;
  });
}

export function tesserMinimaxBot(
  budget: SearchBudget | BudgetPreset = TESSER_MINIMAX_BUDGET,
  name = 'tesser-minimax',
): AiBot<TesserState, TesserAction> {
  return makeMinimaxBot(tesser, tesserEval, {
    budget,
    orderMoves: orderTesserMoves,
    transposition: { maxEntries: 200_000 },
    name,
  });
}
