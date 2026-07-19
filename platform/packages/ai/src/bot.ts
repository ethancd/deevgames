// The lab-compatible bot shape every @deev/ai factory returns.
//
// AiBot extends lab's ScriptedBot *structurally* — no adapter, no cast. Any
// AiBot can be handed directly to @deev/lab's runSeries because TypeScript's
// structural typing accepts it wherever a ScriptedBot<O, A> is expected: the
// extra `lastSearch` diagnostics field is simply additional, optional data
// lab never looks at.

import type { ScriptedBot } from '@deev/lab';

/** One root-level candidate, best-first once placed in SearchInfo.root. */
export interface SearchInfoRootEntry<A> {
  action: A;
  score: number;
  /** MCTS visit count; absent for minimax (visits aren't a minimax concept). */
  visits?: number;
}

export interface SearchInfo<A> {
  algorithm: 'minimax' | 'ismcts';
  nodes: number;
  elapsedMs: number;
  /** Minimax: depth actually completed. ISMCTS: omitted (no notion of depth). */
  depthReached?: number;
  /** Root candidates sorted best-first. */
  root: Array<SearchInfoRootEntry<A>>;
}

/**
 * The bot type every @deev/ai factory returns. `O` is the bot's observation
 * type (S for perfect-info minimax bots; the game's masked view type for
 * ISMCTS bots) and `A` is the action type — matching lab's ScriptedBot<O, A>
 * exactly, so `bots: [makeMinimaxBot(...), randomBot()]` type-checks in
 * runSeries with zero casts.
 */
export interface AiBot<O, A> extends ScriptedBot<O, A> {
  /** Diagnostics from the most recent choose() call. Undefined before the
   * bot's first move. */
  lastSearch?: SearchInfo<A>;
}
