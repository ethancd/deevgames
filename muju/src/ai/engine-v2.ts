import { placementPlans } from './planner/placement';
import { upkeepActions } from '../game/upkeep';
import { evaluatePosition } from './evaluation';
import type { GameState, PlayerId } from '../game/types';
import type { AIResult, AIDifficulty, EvaluationWeights, AIDebugInfo } from './types';
import { DEFAULT_WEIGHTS } from './types';
import { beamSearchPlans } from './planner/beam';
import { raidPlans, strategicValue, reserveStrategies } from './planner/strategies';
import { scorePartialPlan } from './planner/scoring';
import { runMCTS } from './search/mcts';
import { tacticalSharpen } from './eval/sharpener';
import { isLegalAction, phaseEndAction } from '../game/legality';
import { applyAction, applyActions } from './simulate';
import { generateAttackActions } from './moves';
import { SearchBudget, seededRandom, type RNG } from './runtime';
import { homeInvader, referenceTactics } from './tactics/home';
import type { TacticalSolver } from './wasm/kernel';
import type { TurnPlan } from './planner/types';
import { endTurn } from '../game/turn';
import { getUnitAt, getUnitById } from '../game/board';
import { canBeEliminated } from '../game/combat';
import { getUnitDefinition } from '../game/units';

interface AIEngineConfig {
  mctsIterations: number; mctsTimeLimit: number; beamWidth: number; outputPlans: number;
  progressiveWideningAlpha: number;
  tacticalDepth: number; tacticalNodes: number; fixedWork: number;
}
const DEFAULT_CONFIG: AIEngineConfig = {
  mctsIterations: 500, mctsTimeLimit: 1500, beamWidth: 30, outputPlans: 20,
  progressiveWideningAlpha: 0.5,
  tacticalDepth: 1, tacticalNodes: 100000, fixedWork: 0,
};
const DIFFICULTY_PRESETS: Record<AIDifficulty, Partial<AIEngineConfig>> = {
  easy: { mctsIterations: 100, beamWidth: 10, tacticalDepth: 0, mctsTimeLimit: 800, tacticalNodes: 5000 },
  medium: { mctsIterations: 500, beamWidth: 30, tacticalDepth: 1, mctsTimeLimit: 1500, tacticalNodes: 100000 },
  hard: { mctsIterations: 1200, beamWidth: 50, tacticalDepth: 2, mctsTimeLimit: 3000, tacticalNodes: 600000 },
};
export const TURN_BUDGET_MS: Record<AIDifficulty, number> = { easy: 1800, medium: 4000, hard: 8000 };

export class AIEngineV2 {
  private config: AIEngineConfig;
  private weights: EvaluationWeights;
  private rng: RNG = seededRandom(1);
  private solver: TacticalSolver = referenceTactics;
  private lastIntent: TurnPlan | null = null;
  constructor(difficulty: AIDifficulty = 'medium', weights: EvaluationWeights = DEFAULT_WEIGHTS) {
    this.config = { ...DEFAULT_CONFIG, ...DIFFICULTY_PRESETS[difficulty] }; this.weights = weights;
  }
  setDifficulty(difficulty: AIDifficulty): void { this.config = { ...DEFAULT_CONFIG, ...DIFFICULTY_PRESETS[difficulty] }; }
  setConfig(overrides: Partial<AIEngineConfig>): void { this.config = { ...this.config, ...overrides }; }
  setSeed(seed: number): void { this.rng = seededRandom(seed); this.lastIntent = null; }
  setTacticalSolver(solver: TacticalSolver): void { this.solver = solver; }
  setWeights(weights: Partial<EvaluationWeights>): void { this.weights = { ...this.weights, ...weights }; }
  getMinThinkingTime(): number { return 300; }

  async findBestAction(state: GameState, decisionMs = this.config.mctsTimeLimit): Promise<AIResult> {
    const budget = new SearchBudget(this.config.fixedWork ? Infinity : Math.min(decisionMs, this.config.mctsTimeLimit), this.config.fixedWork || Infinity);
    const player = state.turn.currentPlayer, opponent = player === 'white' ? 'black' : 'white';
    // Perfect information: every plan searches the real public state.
    if(state.upkeepPending) {
      const view=state;
      const plans=upkeepActions(view).map((action,i)=>{
        const next=applyAction(view,action);
        return {id:`upkeep-${i}`,actions:[action],score:evaluatePosition(next,player,this.weights),tags:[] as TurnPlan['tags']};
      }).sort((a,b)=>b.score-a.score);
      // Preserve an affordable home rescue before comparing material. All
      // proofs run on the paid, healed board, never the pre-upkeep position.
      const invader=homeInvader(view,player);
      if(invader && view.victoryRule!=='elimination')for(const plan of plans.slice(0,32)){
        const paid=applyActions(view,plan.actions);
        if(paid.phase==='victory')continue;
        const rescue=this.solver(paid,invader.id,3000,new SearchBudget(Infinity,3000));
        if(rescue.status==='proved'){plan.score+=100000;break;}
      }
      plans.sort((a,b)=>b.score-a.score);
      const best=plans[0];
      const stats=budget.finish();
      return {plan:{actions:best.actions,score:best.score},nodesSearched:plans.length,timeMs:stats.elapsedMs,depth:0,
        debug:{planCount:plans.length,topPlans:plans.slice(0,5),config:this.config},stats};
    }
    const observed = state;
    let bestPlan: TurnPlan | undefined;
    const rootPlans: TurnPlan[] = placementPlans(observed, player, budget);
    const attacks = generateAttackActions(observed, player)
      .filter(a => a.type === 'ATTACK').filter(a => isLegalAction(observed, a));
    const win = attacks.find(a => applyAction(observed, a).winner === player);
    if (win) bestPlan = { id: 'immediate-victory', actions: [win], score: 1000000, tags: ['kill'] };
    const invader = observed.victoryRule !== 'elimination' ? homeInvader(observed, player) : undefined;
    if (!bestPlan && invader && !budget.exhausted()) {
      const rescue = this.solver(observed, invader.id, this.config.tacticalNodes, budget);
      budget.stats.tacticalStatus = rescue.status;
      if (rescue.status === 'proved') bestPlan = { id: 'home-rescue', actions: rescue.actions, score: 100000, tags: ['defensive'] };
    }
    // Combination kills and invasions are protected root candidates. The kernel
    // also serves ordinary combat, not just the emergency override.
    if (!bestPlan && !budget.exhausted()) {
      for (const target of observed.board.units.filter(u => u.owner === opponent)) {
        if (budget.exhausted()) break;
        const tactic = this.solver(observed, target.id, Math.min(this.config.tacticalNodes, 3000), budget);
        if (tactic.status === 'proved') {
          const plan: TurnPlan = { id: `combination:${target.id}`, actions: tactic.actions, score: 0, tags: ['kill'] };
          const next = applyActions(observed, plan.actions);
          if (next.winner === player) { bestPlan = { ...plan, score: 1000000 }; break; }
          plan.score = scorePartialPlan(plan, observed, player, next) + strategicValue(next, player); rootPlans.push(plan);
        }
      }
      for (const raid of raidPlans(observed, player)) {
        if (budget.exhausted()) break;
        const next = applyActions(observed, raid.actions);
        // Test the defender's actual public bank and current position.
        const reply = endTurn(next);
        if (reply.phase === 'victory') continue; // opponent wins a home race first
        const mover = raid.actions[0];
        if (mover.type !== 'MOVE') continue;
        const defense = this.solver(reply, mover.unitId, Math.min(this.config.tacticalNodes, 20000), budget);
        raid.score = scorePartialPlan(raid, observed, player, next) + (defense.status === 'disproved' ? 5000 : defense.status === 'proved' ? -100 : -10);
        if (defense.status === 'disproved') { bestPlan = raid; break; }
        rootPlans.push(raid);
      }
    }
    const generator = (sim: GameState, current: PlayerId) => {
      const view = sim;
      return beamSearchPlans(view, current, { beamWidth: this.config.beamWidth, outputPlans: this.config.outputPlans, budget, templates: false,
        until: sim === observed && Number.isFinite(budget.milliseconds) ? budget.started + budget.milliseconds * 0.45 : undefined,
        maxCandidates: sim === observed && this.config.fixedWork ? Math.floor(this.config.fixedWork / 3) : undefined });
    };
    let candidates = rootPlans;
    if (!bestPlan && !budget.exhausted()) {
      candidates = reserveStrategies([...rootPlans, ...generator(observed, player)], this.config.outputPlans);
      // Check the final occupation in each root plan against the defender's
      // entire reply, including affordable promotions. This also catches a raid
      // reached by a multi-step beam line, not only a direct home move.
      for (const plan of candidates) {
        if (budget.exhausted()) {
          const home = observed.players[opponent].startCorner;
          if (plan.actions.some(a => a.type === 'MOVE' && a.to.x === home.x && a.to.y === home.y)) plan.score -= 100;
          continue;
        }
        const next = applyActions(observed, plan.actions);
        const occupier = homeInvader(next, opponent);
        if (!occupier || next.phase === 'victory') continue;
        if (budget.exhausted()) { plan.score -= 100; continue; }
        const reply = next.turn.currentPlayer === player ? endTurn(next) : next;
        if (reply.phase === 'victory') { plan.score = -1000000; continue; }
        const answer = this.solver(reply, occupier.id, Math.min(this.config.tacticalNodes, 20000), budget);
        if (answer.status === 'disproved') plan.score += 5000;
        else if (answer.status === 'proved') plan.score -= 150;
        else plan.score -= 50;
      }
      candidates.sort((a, b) => b.score - a.score);
      // Reconsider previous intent as a prior only if its FIRST action remains
      // legal; no stale suffix is dispatched without a fresh search.
      if (this.lastIntent && candidates.some(p => p.id === this.lastIntent?.id)) candidates.sort((a,b) => (b.score + (b.id === this.lastIntent?.id ? 0.2 : 0)) - (a.score + (a.id === this.lastIntent?.id ? 0.2 : 0)));
      bestPlan = runMCTS(observed, player, { iterations: this.config.mctsIterations,
        timeLimitMs: this.config.fixedWork ? Infinity : decisionMs, progressiveWideningAlpha: this.config.progressiveWideningAlpha,
        budget, rng: this.rng, rootPlans: candidates }, generator,
        (sim, p) => { return tacticalSharpen(sim, p, this.config.tacticalDepth, this.weights, budget) + strategicValue(sim, p); });
    }
    bestPlan ??= candidates[0];
    if (!bestPlan) {
      // A deadline is not a reason to discard an immediate capture. This small,
      // fresh legality check also completes move-and-kill lines when the caller
      // has no search time left; it never replays a cached plan suffix.
      const capture = attacks.map(action => {
        const target = getUnitAt(observed.board, action.targetPosition)!;
        const attacker = getUnitById(observed.board, action.unitId)!;
        return {
          action,
          lethal: canBeEliminated(target, attacker),
          value: getUnitDefinition(target.definitionId).cost + (target.id === invader?.id ? 100000 : 0),
        };
      }).filter(candidate => candidate.lethal).sort((a, b) => b.value - a.value)[0];
      bestPlan = capture
        ? { id: 'budget-capture', actions: [capture.action], score: capture.value, tags: ['kill'] }
        : { id: 'budget-fallback', actions: [phaseEndAction(observed)], score: 0, tags: ['passive'] };
    }
    const actions: AIResult['plan']['actions'] = []; let current: GameState = observed;
    for (const action of bestPlan.actions) {
      if (current.turn.currentPlayer !== player || !isLegalAction(current, action)) break;
      actions.push(action); current = applyAction(current, action);
    }
    if (!actions.length && observed.phase === 'playing') actions.push(phaseEndAction(observed));
    this.lastIntent = bestPlan;
    const debug: AIDebugInfo = { planCount: candidates.length, topPlans: [bestPlan, ...candidates.filter(p => p.id !== bestPlan!.id)].slice(0, 5), config: this.config };
    const stats = budget.finish();
    return { plan: { actions, score: bestPlan.score }, nodesSearched: stats.iterations, timeMs: stats.elapsedMs, depth: this.config.tacticalDepth, debug, stats };
  }
}
