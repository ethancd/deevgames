// Re-determinized ISMCTS (information-set MCTS): every iteration samples a
// full world from the current belief, then runs one MCTS step against a
// single *shared* tree keyed by plan id (Cowling et al.'s single-tree
// re-determinization, as in muju's engine-v2.ts + search/{mcts,uct}.ts).
//
// Two deliberate departures from muju's search/uct.ts, called out here:
//  1. Progressive widening orders candidate children by PRIOR before slicing
//     to the top-K — muju iterated `node.children.values()` which is
//     insertion order (an accident of Map iteration, not a designed prior
//     ranking). Fixed here.
//  2. The root is fully seeded with all root plans before the iteration loop
//     starts (not lazily expanded one-per-visit like deeper nodes) so
//     `lastSearch.root` always reports every root candidate, matching the
//     "planner omitted -> root arity equals legal count" contract.
//
// Strategy-fusion caveat (see README): re-determinizing every iteration
// means the tree's statistics blend outcomes across information-set worlds
// that a truly optimal player would sometimes distinguish. This is the
// well-known ISMCTS strategy-fusion limitation, not a bug — it's the
// standard, practical trade-off this algorithm makes.

import type { GameDef, Rng, Seat } from '@deev/core';
import { stableStringify } from '@deev/core';
import type { AiBot, SearchInfo, SearchInfoRootEntry } from './bot.ts';
import { type BudgetPreset, type SearchBudget, resolveBudget } from './budget.ts';
import type { BeliefModel, BeliefState, Particle } from './belief.ts';
import { createBelief, maybeResample, sampleParticle } from './belief.ts';
import type { Plan } from './planner.ts';

const EXPLORATION = 1.4;
const PROGRESSIVE_WIDENING_ALPHA = 0.5;
const RESAMPLE_THRESHOLD = 0.5;
const BELIEF_PARTICLE_COUNT = 40;

interface TreeNode<A> {
  visits: number;
  totalValue: number;
  children: Map<string, TreeChild<A>>;
}

interface TreeChild<A> {
  plan: Plan<A>;
  node: TreeNode<A>;
  prior: number;
}

function createNode<A>(): TreeNode<A> {
  return { visits: 0, totalValue: 0, children: new Map() };
}

function selectChild<A>(node: TreeNode<A>, alpha: number): TreeChild<A> | null {
  if (node.children.size === 0) return null;
  const maxChildren = Math.max(1, Math.floor(Math.pow(node.visits || 1, alpha)));
  const ordered = [...node.children.values()]
    .sort((a, b) => b.prior - a.prior)
    .slice(0, maxChildren);

  let best: TreeChild<A> | null = null;
  let bestScore = -Infinity;
  for (const child of ordered) {
    const exploit = child.node.totalValue / Math.max(1, child.node.visits);
    const explore =
      EXPLORATION * Math.sqrt(Math.log(Math.max(1, node.visits)) / Math.max(1, child.node.visits));
    const priorBonus = child.prior * (1 / (1 + child.node.visits));
    const score = exploit + explore + priorBonus;
    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }
  return best;
}

export interface MakeIsmctsBotOptions<S, A, O> {
  beliefModel: BeliefModel<O, S>;
  budget?: SearchBudget | BudgetPreset;
  planner?(state: S, seat: Seat, rng: Rng): Plan<A>[];
  /** Default: def.score if defined, else a terminal-only rollout value
   * (+1 win / 0 draw / -1 loss for the root seat; 0 if the rollout was
   * truncated before reaching a terminal state). */
  evaluate?(state: S, seat: Seat): number;
  actionKey?(action: A): string;
  name?: string;
}

/**
 * Default (no planner) one-action plans, scored by one-ply-ahead evaluate()
 * and sorted best-first. This is what makes "rollout to playoutDepth picking
 * first-plan/greedy" (the plan's phrasing) actually *greedy* rather than
 * arbitrary when no planner is supplied: without this sort, `plans[0]` would
 * just be whichever action def.legal() happens to list first. With it,
 * expansion and rollout both prefer an immediately-winning move when one
 * exists, and fall back to def.legal()'s original order among ties (most
 * commonly all-zero, one-ply-ahead evaluate rarely discriminates between
 * non-terminal successors).
 */
function defaultGreedyPlans<S, A, C, O>(
  def: GameDef<S, A, C, O>,
  state: S,
  seat: Seat,
  rng: Rng,
  actionKey: (a: A) => string,
  evaluate: (state: S, seat: Seat) => number,
): Plan<A>[] {
  const actions = def.legal(state, seat);
  const scored = actions.map((action, i) => {
    const next = def.apply(state, action, rng.fork(`greedy-score:${i}`));
    return { id: actionKey(action), actions: [action], score: evaluate(next, seat), tags: [] as string[] };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function applyPlan<S, A, C, O>(def: GameDef<S, A, C, O>, state: S, plan: Plan<A>, rng: Rng): S {
  let s = state;
  for (let i = 0; i < plan.actions.length; i++) {
    s = def.apply(s, plan.actions[i], rng.fork(`ismcts-apply:${i}`));
  }
  return s;
}

export function makeIsmctsBot<S, A, O, C = unknown>(
  def: GameDef<S, A, C, O>,
  opts: MakeIsmctsBotOptions<S, A, O>,
): AiBot<O, A> {
  const budget = resolveBudget('ismcts', opts.budget);
  const actionKey = opts.actionKey ?? ((a: A) => stableStringify(a));

  const resolvedEvaluate: (state: S, seat: Seat) => number =
    opts.evaluate ??
    (def.score
      ? (state, seat) => def.score!(state, seat)
      : (state, seat) => {
          const term = def.terminal(state);
          if (!term) return 0;
          if (term.winner === seat) return 1;
          if (term.winner === null) return 0;
          return -1;
        });

  const generatePlans = (state: S, seat: Seat, rng: Rng): Plan<A>[] =>
    opts.planner
      ? opts.planner(state, seat, rng)
      : defaultGreedyPlans(def, state, seat, rng, actionKey, resolvedEvaluate);

  let prevView: O | undefined;
  let belief: BeliefState<S> | undefined;

  const bot: AiBot<O, A> = {
    name: opts.name ?? 'Ismcts',
    onGameStart(seat, seed) {
      prevView = undefined;
      belief = undefined;
      opts.beliefModel.reset?.(seat, seed);
      void seed;
    },
    choose(ctx) {
      const { view, seat, legal, rng } = ctx;
      if (legal.length === 0) {
        throw new Error(
          `makeIsmctsBot: ctx.legal was empty for seat '${seat}' — contract violation (legal is ` +
            `never empty for an acting seat).`,
        );
      }

      const canTrackEvents = opts.beliefModel.deriveEvents !== undefined && opts.beliefModel.observe !== undefined;

      if (canTrackEvents) {
        if (belief === undefined) {
          belief = createBelief(
            BELIEF_PARTICLE_COUNT,
            (r) => opts.beliefModel.sampleWorld(view, r),
            rng.fork('ismcts-belief-init'),
          );
        } else if (prevView !== undefined) {
          const events = opts.beliefModel.deriveEvents!(prevView, view);
          for (const event of events) {
            const currentBelief = belief;
            const nextParticles: Particle<S>[] = [];
            for (const p of currentBelief.particles) {
              const hidden = opts.beliefModel.observe!(p.hidden, event, rng.fork('ismcts-observe'));
              if (hidden !== null) nextParticles.push({ hidden, weight: p.weight });
            }
            belief =
              nextParticles.length > 0
                ? { particles: nextParticles }
                : createBelief(
                    BELIEF_PARTICLE_COUNT,
                    (r) => opts.beliefModel.sampleWorld(view, r),
                    rng.fork('ismcts-belief-reinit'),
                  );
          }
          belief = maybeResample(belief, RESAMPLE_THRESHOLD, rng.fork('ismcts-resample'));
        }
      }
      prevView = view;

      const sampleWorldForIteration = (r: Rng): S =>
        belief ? sampleParticle(belief, r) : opts.beliefModel.sampleWorld(view, r);

      // Root: fully seeded up front — one-action plans built from ctx.legal
      // (never def.legal(rootSample, seat): ctx.legal is the authoritative
      // legal set, guaranteeing the returned action is always a member of
      // it regardless of what a belief model's sampleWorld does) when no
      // planner is given, scored the same greedy way as defaultGreedyPlans
      // so root priors are meaningful; or the planner's own root plans over
      // one sampled world otherwise.
      const rootSample = sampleWorldForIteration(rng.fork('ismcts-root-sample'));
      const rootPlans = opts.planner
        ? opts.planner(rootSample, seat, rng.fork('ismcts-root-plans'))
        : legal
            .map((action, i) => {
              const next = def.apply(rootSample, action, rng.fork(`root-greedy-score:${i}`));
              return {
                id: actionKey(action),
                actions: [action],
                score: resolvedEvaluate(next, seat),
                tags: [] as string[],
              };
            })
            .sort((a, b) => b.score - a.score);

      const root: TreeNode<A> = createNode();
      for (const plan of rootPlans) {
        if (!root.children.has(plan.id)) {
          root.children.set(plan.id, { plan, node: createNode(), prior: plan.score });
        }
      }

      const maxIterations = budget.iterations ?? budget.determinizations ?? 300;
      const playoutDepth = budget.playoutDepth ?? 8;
      const started = Date.now();
      let nodesCreated = 1 + root.children.size;

      for (let i = 0; i < maxIterations; i++) {
        if (budget.maxMillis !== undefined && Date.now() - started >= budget.maxMillis) break;
        if (budget.maxNodes !== undefined && nodesCreated >= budget.maxNodes) break;

        const iterRng = rng.fork(`ismcts-iter:${i}`);
        let simState = sampleWorldForIteration(iterRng.fork('determinize'));
        const path: TreeNode<A>[] = [root];
        let node = root;

        // Selection
        while (node.children.size > 0) {
          const selected = selectChild(node, PROGRESSIVE_WIDENING_ALPHA);
          if (!selected) break;
          simState = applyPlan(def, simState, selected.plan, iterRng.fork('select-apply'));
          node = selected.node;
          path.push(node);
          if (def.terminal(simState)) break;
        }

        // Expansion (at most one new child per visited unexpanded node)
        if (!def.terminal(simState)) {
          const actors = def.toAct(simState);
          if (actors.length > 0) {
            const plans = generatePlans(simState, actors[0], iterRng.fork('expand-plans'));
            for (const plan of plans) {
              if (!node.children.has(plan.id)) {
                const childNode = createNode<A>();
                node.children.set(plan.id, { plan, node: childNode, prior: plan.score });
                simState = applyPlan(def, simState, plan, iterRng.fork('expand-apply'));
                node = childNode;
                path.push(node);
                nodesCreated++;
                break;
              }
            }
          }
        }

        // Rollout: first-plan/greedy to playoutDepth
        let depth = 0;
        while (!def.terminal(simState) && depth < playoutDepth) {
          const actors = def.toAct(simState);
          if (actors.length === 0) break;
          const plans = generatePlans(simState, actors[0], iterRng.fork(`rollout:${depth}`));
          if (plans.length === 0) break;
          simState = applyPlan(def, simState, plans[0], iterRng.fork(`rollout-apply:${depth}`));
          depth++;
        }

        const value = resolvedEvaluate(simState, seat);
        for (const visited of path) {
          visited.visits += 1;
          visited.totalValue += value;
        }
      }

      let bestChild: TreeChild<A> | null = null;
      for (const child of root.children.values()) {
        if (!bestChild || child.node.visits > bestChild.node.visits) bestChild = child;
      }
      const chosen = bestChild?.plan.actions[0] ?? legal[0];

      const rootEntries: SearchInfoRootEntry<A>[] = [...root.children.values()]
        .map((child) => ({
          action: child.plan.actions[0],
          score: child.node.visits > 0 ? child.node.totalValue / child.node.visits : child.prior,
          visits: child.node.visits,
        }))
        .sort((a, b) => (b.visits ?? 0) - (a.visits ?? 0) || b.score - a.score);

      const info: SearchInfo<A> = {
        algorithm: 'ismcts',
        nodes: nodesCreated,
        elapsedMs: Date.now() - started,
        root: rootEntries,
      };
      bot.lastSearch = info;

      return chosen;
    },
  };

  return bot;
}
