// Beam search over multi-action plans, generalizing muju's planner/beam.ts.
// A "plan" is a short sequence of actions taken by one seat while it keeps
// getting to act (toAct(end) === [seat]) — the turn-plan concept from muju's
// TurnPlan, but over any GameDef's action type.

import type { GameDef, Rng, Seat } from '@deev/core';
import { stableStringify } from '@deev/core';

export interface Plan<A> {
  id: string;
  actions: A[];
  score: number;
  tags: string[];
}

export interface TacticalTemplate<S, A> {
  name: string;
  detect(state: S, seat: Seat): boolean;
  generate(state: S, seat: Seat, rng: Rng): Plan<A>[];
}

export interface BeamSearchPlansOptions<S, A> {
  state: S;
  seat: Seat;
  rng: Rng;
  beamWidth: number;
  outputPlans: number;
  maxSteps(state: S, seat: Seat): number;
  scorePlan(plan: Plan<A>, root: S, end: S, seat: Seat): number;
  tagPlan?(plan: Plan<A>, root: S, end: S, seat: Seat): string[];
  templates?: TacticalTemplate<S, A>[];
  /** Default stableStringify. Non-injective keys silently split (two
   * genuinely-equal plans keyed differently, both survive as "different"
   * plans) or merge (two genuinely-different plans keyed alike, one is
   * silently dropped by mergePlans/dedup) votes — pick a real key if the
   * action type doesn't stringify uniquely. */
  actionKey?(action: A): string;
}

interface Node<S, A> {
  state: S;
  actions: A[];
}

function planIdOf<A>(actions: A[], actionKey: (a: A) => string): string {
  return actions.map(actionKey).join('>');
}

export function beamSearchPlans<S, A, C, O>(
  def: GameDef<S, A, C, O>,
  opts: BeamSearchPlansOptions<S, A>,
): Plan<A>[] {
  const { state: root, seat, rng, beamWidth, outputPlans, maxSteps, scorePlan, tagPlan, templates } =
    opts;
  const actionKey = opts.actionKey ?? ((a: A) => stableStringify(a));

  const forced: Plan<A>[] = [];
  if (templates) {
    for (const template of templates) {
      if (template.detect(root, seat)) {
        forced.push(...template.generate(root, seat, rng.fork(`planner-template:${template.name}`)));
      }
    }
  }

  const steps = maxSteps(root, seat);
  let beam: Node<S, A>[] = [{ state: root, actions: [] }];
  let finished: Node<S, A>[] = [];

  for (let step = 0; step < steps; step++) {
    const candidates: Node<S, A>[] = [];
    for (const node of beam) {
      const stillActing = def.toAct(node.state);
      if (stillActing.length !== 1 || stillActing[0] !== seat) {
        // This branch's seat has already ceded the turn — it can't extend
        // further; keep it as a finished candidate instead of dropping it.
        finished.push(node);
        continue;
      }
      const term = def.terminal(node.state);
      if (term) {
        finished.push(node);
        continue;
      }
      const legal = def.legal(node.state, seat);
      for (const action of legal) {
        const next = def.apply(node.state, action, rng.fork(`planner-step:${step}:${actionKey(action)}`));
        candidates.push({ state: next, actions: [...node.actions, action] });
      }
    }

    if (candidates.length === 0) break;

    const scored = candidates.map((node) => {
      const plan: Plan<A> = { id: planIdOf(node.actions, actionKey), actions: node.actions, score: 0, tags: [] };
      plan.score = scorePlan(plan, root, node.state, seat);
      plan.tags = tagPlan ? tagPlan(plan, root, node.state, seat) : [];
      return { node, plan };
    });
    scored.sort((a, b) => b.plan.score - a.plan.score);
    beam = scored.slice(0, beamWidth).map((s) => s.node);
  }

  finished.push(...beam);

  const searched: Plan<A>[] = finished.map((node) => {
    const plan: Plan<A> = { id: planIdOf(node.actions, actionKey), actions: node.actions, score: 0, tags: [] };
    plan.score = scorePlan(plan, root, node.state, seat);
    plan.tags = tagPlan ? tagPlan(plan, root, node.state, seat) : [];
    return plan;
  });

  return mergePlans(forced, searched, outputPlans);
}

/**
 * Dedupe by id, keeping `forced` entries first (ties broken in favor of the
 * forced plan), then sort by score desc and cap at `limit`.
 */
export function mergePlans<A>(forced: Plan<A>[], searched: Plan<A>[], limit: number): Plan<A>[] {
  const byId = new Map<string, Plan<A>>();
  for (const plan of forced) {
    if (!byId.has(plan.id)) byId.set(plan.id, plan);
  }
  for (const plan of searched) {
    if (!byId.has(plan.id)) byId.set(plan.id, plan);
  }
  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
