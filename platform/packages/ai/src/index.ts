// The two factories + composition toolkit. Search internals (searchRoot's
// pruning flag, the ISMCTS tree node shapes) stay private — import them
// directly from the module file if you're writing a test inside this
// package.

export type { AiBot, SearchInfo, SearchInfoRootEntry } from './bot.ts';

export type { SearchBudget, BudgetPreset } from './budget.ts';
export { MINIMAX_BUDGETS, ISMCTS_BUDGETS, resolveBudget } from './budget.ts';

export type { EvalFactor, ExplainEntry, NamedEval } from './eval.ts';
export { composeEval, normalizeAdvantage, optionalityFactor } from './eval.ts';

export type { MinimaxOptions } from './minimax.ts';
export { makeMinimaxBot, VICTORY } from './minimax.ts';

export type { Plan, TacticalTemplate, BeamSearchPlansOptions } from './planner.ts';
export { beamSearchPlans, mergePlans } from './planner.ts';

export type { Particle, BeliefState, BeliefModel } from './belief.ts';
export { createBelief, effectiveSampleSize, maybeResample, sampleParticle } from './belief.ts';

export type { MakeIsmctsBotOptions } from './ismcts.ts';
export { makeIsmctsBot } from './ismcts.ts';
