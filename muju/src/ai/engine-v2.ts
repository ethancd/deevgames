import type { GameState, PlayerId } from '../game/types';
import type { AIResult, AIDifficulty, EvaluationWeights, AIDebugInfo } from './types';
import { DEFAULT_WEIGHTS } from './types';
import type { FullKnowledge } from './state/types';
import { observeState, extractPrivateState } from './state/observation';
import { createInitialBelief, updateBelief, maybeResample } from './belief/update';
import { beamSearchPlans } from './planner/beam';
import { runMCTS } from './search/mcts';
import { tacticalSharpen } from './eval/sharpener';

interface AIEngineConfig {
  mctsIterations: number;
  mctsTimeLimit: number;
  beamWidth: number;
  outputPlans: number;
  progressiveWideningAlpha: number;
  particleCount: number;
  resampleThreshold: number;
  tacticalDepth: number;
}

const DEFAULT_CONFIG: AIEngineConfig = {
  mctsIterations: 500,
  mctsTimeLimit: 1500,
  beamWidth: 30,
  outputPlans: 20,
  progressiveWideningAlpha: 0.5,
  particleCount: 30,
  resampleThreshold: 0.2,
  tacticalDepth: 1,
};

const DIFFICULTY_PRESETS: Record<AIDifficulty, Partial<AIEngineConfig>> = {
  easy: { mctsIterations: 100, beamWidth: 10, particleCount: 10, tacticalDepth: 0, mctsTimeLimit: 800 },
  medium: { mctsIterations: 500, beamWidth: 30, particleCount: 30, tacticalDepth: 1, mctsTimeLimit: 1500 },
  hard: { mctsIterations: 1200, beamWidth: 50, particleCount: 50, tacticalDepth: 2, mctsTimeLimit: 3000 },
};

export class AIEngineV2 {
  private config: AIEngineConfig;
  private weights: EvaluationWeights;
  private lastObservedState: GameState | null = null;
  private belief: ReturnType<typeof createInitialBelief> | null = null;

  constructor(difficulty: AIDifficulty = 'medium', weights: EvaluationWeights = DEFAULT_WEIGHTS) {
    this.config = { ...DEFAULT_CONFIG, ...DIFFICULTY_PRESETS[difficulty] };
    this.weights = weights;
  }

  setDifficulty(difficulty: AIDifficulty): void {
    this.config = { ...DEFAULT_CONFIG, ...DIFFICULTY_PRESETS[difficulty] };
  }

  setWeights(weights: Partial<EvaluationWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  getMinThinkingTime(): number {
    return Math.max(300, Math.floor(this.config.mctsTimeLimit * 0.5));
  }

  async findBestAction(state: GameState): Promise<AIResult> {
    const player = state.turn.currentPlayer;
    const knowledge = this.buildKnowledge(state, player);
    const startTime = Date.now();

    const planGenerator = (simState: GameState, currentPlayer: PlayerId) =>
      beamSearchPlans(simState, currentPlayer, {
        beamWidth: this.config.beamWidth,
        outputPlans: this.config.outputPlans,
      });

    const evaluator = (simState: GameState, forPlayer: PlayerId) =>
      tacticalSharpen(simState, forPlayer, this.config.tacticalDepth, this.weights);

    const candidatePlans = planGenerator(state, player);
    const bestPlan = runMCTS(
      knowledge,
      player,
      {
        iterations: this.config.mctsIterations,
        timeLimitMs: this.config.mctsTimeLimit,
        progressiveWideningAlpha: this.config.progressiveWideningAlpha,
      },
      planGenerator,
      evaluator
    );

    const timeMs = Date.now() - startTime;

    const debug: AIDebugInfo = {
      planCount: candidatePlans.length,
      topPlans: candidatePlans.slice(0, 5).map((plan) => ({
        id: plan.id,
        score: plan.score,
        tags: plan.tags,
        actions: plan.actions,
      })),
      config: {
        mctsIterations: this.config.mctsIterations,
        mctsTimeLimit: this.config.mctsTimeLimit,
        beamWidth: this.config.beamWidth,
        outputPlans: this.config.outputPlans,
        particleCount: this.config.particleCount,
        tacticalDepth: this.config.tacticalDepth,
      },
    };

    return {
      plan: { actions: bestPlan.actions, score: bestPlan.score },
      nodesSearched: this.config.mctsIterations,
      timeMs,
      depth: this.config.tacticalDepth,
      debug,
    };
  }

  private buildKnowledge(state: GameState, player: PlayerId): FullKnowledge {
    const observed = observeState(this.lastObservedState, state, player);
    const own = extractPrivateState(state, player);

    if (!this.belief) {
      const minResources = 0;
      const maxResources = Math.max(0, state.players[player === 'player' ? 'ai' : 'player'].resourcesGained -
        state.players[player === 'player' ? 'ai' : 'player'].resourcesSpent);
      this.belief = createInitialBelief(this.config.particleCount, minResources, maxResources);
    }

    const opponentId: PlayerId = player === 'player' ? 'ai' : 'player';
    this.belief = updateBelief(this.belief, observed.observedEvents, opponentId);
    this.belief = maybeResample(this.belief, this.config.resampleThreshold);
    this.lastObservedState = state;

    return {
      public: observed,
      own,
      opponentBelief: this.belief,
    };
  }
}
