import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIAction, AIDifficulty } from '../../../src/ai/types';
import { AIEngineV2 } from '../../../src/ai/engine-v2';
import { shouldResign } from '../../../src/ai/evaluation';
import type { EngineBot } from '../types';

/**
 * L3 — the real AI (AIEngineV2: belief-state MCTS over beam-searched plans).
 *
 * Semantics mirror the shipped useAI loop: resign check at turn start,
 * re-plan after every applied action and take plan.actions[0]. The default
 * has no arbitrary dispatch cap, matching the corrected useAI loop. The
 * historical cap remains opt-in for old-experiment reproduction. The engine
 * masks hidden information internally; the runner counts illegal emissions.
 */

export interface EngineBotOptions {
  difficulty: AIDifficulty;
  /**
   * Throughput preset for mass runs: caps MCTS time/iterations far below the
   * UI presets. 'ui' keeps the shipped preset untouched.
   */
  speed: 'ui' | 'fast';
  /** Reproduce the historical 20-dispatch cap; false for corrected gameplay. */
  mirrorUseAICap: boolean;
  resign: boolean;
}

const DEFAULT_OPTIONS: EngineBotOptions = {
  difficulty: 'medium',
  speed: 'fast',
  mirrorUseAICap: false,
  resign: true,
};

const FAST_OVERRIDES = {
  // keep search behavior shaped like the preset but bounded for throughput
  mctsTimeLimit: 120,
  mctsIterations: 60,
  particleCount: 10,
};

export function createEngineBot(opts: Partial<EngineBotOptions> = {}): EngineBot {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  let engine: AIEngineV2;
  let turnKey = '';
  let dispatchesThisTurn = 0;

  return {
    kind: 'engine',
    name: `AIv2-${options.difficulty}${options.speed === 'fast' ? '-fast' : ''}`,
    onGameStart() {
      engine = new AIEngineV2(options.difficulty);
      if (options.speed === 'fast') {
        engine.setConfig(FAST_OVERRIDES);
      }
      turnKey = '';
      dispatchesThisTurn = 0;
    },
    async nextAction(state: GameState, player: PlayerId): Promise<AIAction | null> {
      const key = `${state.turn.turnNumber}:${state.turn.currentPlayer}`;
      if (key !== turnKey) {
        turnKey = key;
        dispatchesThisTurn = 0;
        if (options.resign && shouldResign(state, player)) {
          return { type: 'RESIGN' };
        }
      }

      if (options.mirrorUseAICap && dispatchesThisTurn >= 20) {
        // Historical D5 approximation: null ends this phase in the runner.
        // This does not reproduce a frozen UI and is disabled by default.
        return null;
      }
      dispatchesThisTurn++;

      const result = await engine.findBestAction(state);
      if (result.plan.actions.length === 0) return null;
      return result.plan.actions[0];
    },
  };
}
