import type { AIDifficulty, EvaluationWeights } from './types';
import { AIEngineV2 } from './engine-v2';

export class AIEngine extends AIEngineV2 {
  constructor(difficulty: AIDifficulty = 'medium', weights?: EvaluationWeights) {
    super(difficulty, weights);
  }
}

export function createAI(difficulty: AIDifficulty = 'medium'): AIEngine {
  return new AIEngine(difficulty);
}
