// Search budgets: the ONLY knob for difficulty on this platform.
//
// Difficulty = budget, never rules. A "hard" bot must never see extra
// information, extra actions, or different rules than an "easy" bot — it
// only gets to look further/longer. This is enforced by the type system:
// SearchBudget is pure numbers (depth/time/iteration counts), nothing about
// game logic can hide in here. If a game wants a genuinely different-feeling
// AI, that's a different evalFn or a different game rule, not a budget.

export interface SearchBudget {
  /** Wall-clock cap in ms. When set, minimax uses iterative deepening and
   * ISMCTS's choose() loop stops early — see each module for exact use. */
  maxMillis?: number;
  /** Hard cap on search nodes/iterations for one choose() call. */
  maxNodes?: number;
  /** Fixed search depth (minimax). Ignored by ISMCTS. */
  depth?: number;
  /** Number of re-determinizations (ISMCTS). See ismcts.ts: this package runs
   * one shared tree and re-samples a world every iteration, so `iterations`
   * is the authoritative loop bound; `determinizations` is accepted as an
   * alias when `iterations` is omitted (documented in ismcts.ts). */
  determinizations?: number;
  /** ISMCTS iteration count. */
  iterations?: number;
  /** ISMCTS rollout depth after tree expansion. */
  playoutDepth?: number;
}

export type BudgetPreset = 'easy' | 'medium' | 'hard' | 'max';

/**
 * Minimax presets: search depth only. Depths are chosen so 'max' stays well
 * under the ~90s suite budget on tic-tac-toe/nim-sized games; real games with
 * bigger branching factors should pass an explicit SearchBudget instead.
 */
export const MINIMAX_BUDGETS: Record<BudgetPreset, SearchBudget> = {
  easy: { depth: 2 },
  medium: { depth: 4 },
  hard: { depth: 6 },
  max: { depth: 9 },
};

/** ISMCTS presets: iteration/determinization/rollout-depth counts only. */
export const ISMCTS_BUDGETS: Record<BudgetPreset, SearchBudget> = {
  easy: { iterations: 80, playoutDepth: 4 },
  medium: { iterations: 300, playoutDepth: 8 },
  hard: { iterations: 800, playoutDepth: 12 },
  max: { iterations: 2000, playoutDepth: 16 },
};

/**
 * Resolve a caller-supplied budget: a preset name, an explicit SearchBudget,
 * or undefined (defaults to 'medium' for the given algorithm).
 */
export function resolveBudget(
  algo: 'minimax' | 'ismcts',
  budgetOrPreset?: SearchBudget | BudgetPreset,
): SearchBudget {
  const table = algo === 'minimax' ? MINIMAX_BUDGETS : ISMCTS_BUDGETS;
  if (budgetOrPreset === undefined) return table.medium;
  if (typeof budgetOrPreset === 'string') return table[budgetOrPreset];
  return budgetOrPreset;
}
