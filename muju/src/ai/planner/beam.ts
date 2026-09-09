import { incomeMovePriority } from './placement';
import type { GameState, PlayerId } from '../../game/types';
import type { TurnPlan } from './types';
import { applyAction } from '../simulate';
import { generateAllActions } from '../moves';
import { scorePartialPlan, tagPlan } from './scoring';
import { generateTemplatePlans } from './templates';
import type { SearchBudget } from '../runtime';
import { strategicValue, reserveStrategies } from './strategies';

interface BeamSearchOptions {
  beamWidth: number; outputPlans: number; maxSteps?: number;
  budget?: SearchBudget; templates?: boolean; until?: number; maxCandidates?: number;
}
export function planId(actions: TurnPlan['actions']): string { return JSON.stringify(actions); }

export function beamSearchPlans(state: GameState, player: PlayerId, options: BeamSearchOptions): TurnPlan[] {
  const { budget } = options;
  let generated = 0;
  const exhausted = () => budget?.exhausted() || generated >= (options.maxCandidates ?? Infinity) ||
    (options.until !== undefined && budget!.now() >= options.until);
  const maxSteps = options.maxSteps ?? (state.turn.phase === 'action' ? Math.max(1, state.turn.actionsRemaining + 1) : 8);
  type Prefix = { plan: TurnPlan; state: GameState };
  let beam: Prefix[] = [{ plan: { id: 'root', actions: [], score: 0, tags: [] }, state }];
  // Root templates are injected by the engine once; repeated MCTS segments can
  // opt out. Score the templates so zero-valued tactical plans cannot vanish.
  const forced = options.templates === false ? [] : generateTemplatePlans(state, player, budget);
  for (const plan of forced) { if (budget?.exhausted()) break; plan.score = scorePartialPlan(plan, state, player); }
  for (let step = 0; step < maxSteps && !exhausted(); step++) {
    const candidates: Prefix[] = [];
    outer: for (const prefix of beam) {
      if (prefix.state.turn.currentPlayer !== player || prefix.state.phase !== 'playing') { candidates.push(prefix); continue; }
      for (const action of generateAllActions(prefix.state, player).sort((a,b)=>incomeMovePriority(prefix.state,b)-incomeMovePriority(prefix.state,a))) {
        if (exhausted() || (budget && !budget.spend())) break outer;
        generated++;
        const next = applyAction(prefix.state, action), actions = [...prefix.plan.actions, action];
        const plan: TurnPlan = { id: planId(actions), actions, score: 0, tags: [] };
        if (budget) { budget.stats.candidates++; budget.stats.simulations++; budget.stats.evaluations++; if (next.turn.currentPlayer !== prefix.state.turn.currentPlayer) budget.stats.turnBoundaries++; }
        plan.score = scorePartialPlan(plan, state, player, next) + strategicValue(next, player);
        candidates.push({ plan: tagPlan(plan, state, player, next), state: next });
      }
    }
    if (!candidates.length) break;
    const selected = reserveStrategies(candidates.map(c => c.plan), options.beamWidth);
    const byId = new Map(candidates.map(c => [c.plan.id, c]));
    beam = selected.map(p => byId.get(p.id)!);
  }
  return reserveStrategies([...forced, ...beam.map(p => p.plan)].filter(p => p.actions.length), options.outputPlans);
}
