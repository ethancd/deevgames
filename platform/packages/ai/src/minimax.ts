// Alpha-beta negamax over 2-seat, perfect-information, strictly-alternating
// GameDefs. Reference shape: .claude/skills/minimax-ai/SKILL.md; adapted to
// negamax (single recursive function, value negated per ply) driven by
// def.toAct to confirm whose node each recursion is at.
//
// VICTORY is a large *finite* magnitude (not Infinity) so score arithmetic
// (negation, comparisons, averaging in reports) stays finite throughout.

import type { GameDef, Result, Rng, Seat } from '@deev/core';
import { stateHash } from '@deev/core';
import type { AiBot, SearchInfo, SearchInfoRootEntry } from './bot.ts';
import { type BudgetPreset, type SearchBudget, resolveBudget } from './budget.ts';

export const VICTORY = 1e9;

/** Thrown internally when a node budget is hit mid-search; never escapes
 * searchRoot — caught per root candidate so results computed so far are
 * still returned. */
class NodeBudgetExceeded extends Error {}

export interface MinimaxOptions<S, A> {
  budget?: SearchBudget | BudgetPreset;
  /** Move-ordering hook: reorder `actions` (a copy) for better pruning. */
  orderMoves?(actions: A[], state: S, seat: Seat): A[];
  /** Opt-in transposition table keyed by @deev/core's stateHash. Absent by
   * default — this is a real feature toggle, not a plumbing detail. */
  transposition?: { maxEntries?: number };
  name?: string;
}

interface TranspositionEntry {
  depth: number;
  value: number;
  /** A pruned search only proves a BOUND on the true value, not the exact
   * value — 'lower' means "at least this" (a beta cutoff occurred), 'upper'
   * means "at most this" (alpha was never improved), 'exact' means the true
   * minimax value. Blindly reusing a bound as if it were exact under a
   * different alpha-beta window is the classic transposition-table
   * correctness bug; this flag is what avoids it. */
  flag: 'exact' | 'lower' | 'upper';
}

interface SearchRootOptions<S, A> {
  depth: number;
  /** false disables alpha-beta pruning — exposed only so tests can compare
   * against a plain-minimax baseline for node-count and move/score parity. */
  pruning?: boolean;
  orderMoves?(actions: A[], state: S, seat: Seat): A[];
  transposition?: Map<string, TranspositionEntry>;
  rng: Rng;
  maxNodes?: number;
  /** Shared across iterative-deepening depths within one choose() call so
   * maxNodes bounds the whole call, not each depth independently. */
  nodeCounter: { count: number };
}

export interface SearchRootResult<A> {
  nodes: number;
  depthReached: number;
  /** Best-first. */
  root: SearchInfoRootEntry<A>[];
}

function terminalValue(term: Result, who: Seat, opp: Seat): number {
  if (term.winner === who) return VICTORY;
  if (term.winner === opp) return -VICTORY;
  if (term.scores) {
    const a = term.scores[who] ?? 0;
    const b = term.scores[opp] ?? 0;
    const total = a + b;
    if (total !== 0) return ((a - b) / total) * 1000;
  }
  return 0;
}

/**
 * Plain alpha-beta negamax at the root, exposed (but not re-exported from
 * index.ts — search internals stay private) for the pruning-equivalence
 * test: run with `pruning: false` and `pruning: true` over the same position
 * and assert identical move/root scores with strictly fewer nodes when
 * pruning is on.
 */
export function searchRoot<S, A, C>(
  def: GameDef<S, A, C, S>,
  evalFn: (state: S, seat: Seat) => number,
  state: S,
  seat: Seat,
  opponent: Seat,
  opts: SearchRootOptions<S, A>,
): SearchRootResult<A> {
  const { depth, pruning = true, orderMoves, transposition, rng, maxNodes, nodeCounter } = opts;

  const order = (actions: A[], s: S, who: Seat): A[] =>
    orderMoves ? orderMoves(actions.slice(), s, who) : actions;

  let rngCounter = 0;
  const forkRng = (): Rng => rng.fork(`minimax:${rngCounter++}`);

  function negamax(s: S, who: Seat, opp: Seat, d: number, alpha: number, beta: number): number {
    if (maxNodes !== undefined && nodeCounter.count >= maxNodes) throw new NodeBudgetExceeded();
    nodeCounter.count++;

    const term = def.terminal(s);
    if (term) return terminalValue(term, who, opp);
    if (d === 0) return evalFn(s, who);

    // originalAlpha/originalBeta: the window this call was actually asked to
    // resolve, as received from the caller — used both to interpret a cached
    // bound below and, on write, to classify this call's own result. We
    // deliberately never narrow the *local* alpha/beta from a cached bound
    // and keep searching under it (a valid but subtler optimization) —
    // instead a cached bound either proves an immediate cutoff against the
    // original window, or we ignore it and search fresh. Simpler to keep
    // correct, and pruning depth isn't the bottleneck for this package's
    // test-sized games.
    const originalAlpha = alpha;
    const originalBeta = beta;
    const key = transposition ? `${stateHash(s)}:${who}:${d}` : undefined;
    if (key !== undefined) {
      const hit = transposition!.get(key);
      if (hit && hit.depth >= d) {
        if (hit.flag === 'exact') return hit.value;
        if (hit.flag === 'lower' && hit.value >= originalBeta) return hit.value;
        if (hit.flag === 'upper' && hit.value <= originalAlpha) return hit.value;
      }
    }

    const mover = def.toAct(s);
    if (mover.length !== 1 || mover[0] !== who) {
      throw new Error(
        `makeMinimaxBot: expected exactly one acting seat ('${who}') at this node but toAct() ` +
          `returned ${JSON.stringify(mover)} — makeMinimaxBot only supports strictly-alternating ` +
          `2-seat games.`,
      );
    }

    let legal = def.legal(s, who);
    if (legal.length === 0) {
      throw new Error(
        `makeMinimaxBot: legal() was empty for acting seat '${who}' at a non-terminal state — ` +
          `contract violation (legal is never empty for an acting seat).`,
      );
    }
    legal = order(legal, s, who);

    let best = -Infinity;
    for (const action of legal) {
      const next = def.apply(s, action, forkRng());
      const value = -negamax(next, opp, who, d - 1, -beta, -alpha);
      if (value > best) best = value;
      if (pruning) {
        if (value > alpha) alpha = value;
        if (alpha >= beta) break;
      }
    }

    if (key !== undefined) {
      const flag: TranspositionEntry['flag'] = pruning
        ? best <= originalAlpha
          ? 'upper'
          : best >= originalBeta
            ? 'lower'
            : 'exact'
        : 'exact';
      transposition!.set(key, { depth: d, value: best, flag });
    }
    return best;
  }

  const legalAtRoot = order(def.legal(state, seat), state, seat);
  const root: SearchInfoRootEntry<A>[] = [];
  for (const action of legalAtRoot) {
    try {
      const next = def.apply(state, action, forkRng());
      const value = -negamax(next, opponent, seat, depth - 1, -Infinity, Infinity);
      root.push({ action, score: value });
    } catch (e) {
      if (e instanceof NodeBudgetExceeded) break;
      throw e;
    }
  }
  root.sort((a, b) => b.score - a.score);

  return { nodes: nodeCounter.count, depthReached: depth, root };
}

/**
 * makeMinimaxBot: alpha-beta over a perfect-info, 2-seat, strictly-
 * alternating GameDef. `def` must have O = S (no observe()) — enforced at
 * construction. `ctx.view` is therefore treated as the true engine state at
 * choose()-time with no cast (the generic signature fixes O = S).
 */
export function makeMinimaxBot<S, A, C = unknown>(
  def: GameDef<S, A, C, S>,
  evalFn: (state: S, seat: Seat) => number,
  opts: MinimaxOptions<S, A> = {},
): AiBot<S, A> {
  if (def.observe !== undefined) {
    throw new Error(
      `makeMinimaxBot: '${def.id}' defines observe() — makeMinimaxBot is perfect-information only ` +
        `— use makeIsmctsBot for hidden-information games.`,
    );
  }

  const budget = resolveBudget('minimax', opts.budget);
  const transposition = opts.transposition ? new Map<string, TranspositionEntry>() : undefined;
  const maxEntries = opts.transposition?.maxEntries;

  // Lazily-discovered seat pair. We don't wait to observe the opponent in
  // toAct() across real turns (the bot needs to know it before its very
  // first search) — instead we probe one ply ahead on the first choose().
  let seatA: Seat | undefined;
  let seatB: Seat | undefined;

  const bot: AiBot<S, A> = {
    name: opts.name ?? 'Minimax',
    onGameStart(_seat, _seed) {
      // Seat identity (seatA/seatB) persists across games in a series — the
      // seats themselves don't change. We do clear the transposition table
      // per game as hygiene (state hashes are only meaningful within one
      // engine/config; a stale entry from a previous game is never wanted).
      transposition?.clear();
    },
    choose(ctx) {
      const { view, seat, legal, rng } = ctx;
      if (legal.length === 0) {
        throw new Error(
          `makeMinimaxBot: ctx.legal was empty for seat '${seat}' — contract violation (legal is ` +
            `never empty for an acting seat).`,
        );
      }
      const state = view;

      if (seatA === undefined) {
        seatA = seat;
        const probeLegal = def.legal(state, seat);
        const probeNext = def.apply(state, probeLegal[0], rng.fork('minimax-opponent-probe'));
        const nextActors = def.toAct(probeNext);
        const found = nextActors.find((s) => s !== seat);
        if (!found) {
          throw new Error(
            `makeMinimaxBot: could not determine the opponent seat for '${def.id}' from a one-ply ` +
              `probe — makeMinimaxBot only supports strictly-alternating 2-seat games.`,
          );
        }
        seatB = found;
      } else if (seat !== seatA && seat !== seatB) {
        throw new Error(
          `makeMinimaxBot: '${def.id}' produced a third seat ('${seat}', known: ${seatA}, ${seatB}) ` +
            `— makeMinimaxBot supports exactly 2-seat games.`,
        );
      }

      const opponent = (seat === seatA ? seatB : seatA) as Seat;

      const started = Date.now();
      const nodeCounter = { count: 0 };
      let root: SearchInfoRootEntry<A>[] = [];
      let depthReached = 0;

      if (budget.maxMillis !== undefined) {
        for (let d = 1; ; d++) {
          if (Date.now() - started >= budget.maxMillis) break;
          if (budget.depth !== undefined && d > budget.depth) break;
          const result = searchRoot(def, evalFn, state, seat, opponent, {
            depth: d,
            orderMoves: opts.orderMoves,
            transposition,
            rng,
            maxNodes: budget.maxNodes,
            nodeCounter,
          });
          if (result.root.length === 0) break;
          root = result.root;
          depthReached = d;
          if (root.some((r) => Math.abs(r.score) >= VICTORY)) break;
        }
      } else {
        const depth = budget.depth ?? 4;
        const result = searchRoot(def, evalFn, state, seat, opponent, {
          depth,
          orderMoves: opts.orderMoves,
          transposition,
          rng,
          maxNodes: budget.maxNodes,
          nodeCounter,
        });
        root = result.root;
        depthReached = depth;
      }

      if (transposition && maxEntries !== undefined && transposition.size > maxEntries) {
        const excess = transposition.size - maxEntries;
        const keys = transposition.keys();
        for (let i = 0; i < excess; i++) {
          const k = keys.next().value;
          if (k !== undefined) transposition.delete(k);
        }
      }

      const chosen = root[0]?.action ?? legal[0];

      const info: SearchInfo<A> = {
        algorithm: 'minimax',
        nodes: nodeCounter.count,
        elapsedMs: Date.now() - started,
        depthReached,
        root,
      };
      bot.lastSearch = info;

      return chosen;
    },
  };

  return bot;
}
