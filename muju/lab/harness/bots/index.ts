import type { Bot } from '../types';
import { createRandomBot } from './random';
import { createGreedyBot } from './greedy';
import { createRushBot, createExpandBot, createBalancedBot } from './archetypes';
import { createTurtleBot, createTier1SpamBot, createMiningDenialBot, createAntiRushBot } from './probes';
import { createEngineBot } from './engine';
import { createMonoElementBot } from './mono';

/**
 * Bot registry. Names are the public identifiers used in experiment configs
 * and result rows; keep them stable.
 *
 * Ladder: Random (L0) < Greedy (L1) < Rush/Expand/Balanced (L2) < AIv2-* (L3)
 * Probes: Turtle, Tier1Spam, MiningDenial, AntiRush
 */
const FACTORIES: Record<string, () => Bot> = {
  Random: createRandomBot,
  Greedy: createGreedyBot,
  Rush: createRushBot,
  Expand: createExpandBot,
  Balanced: createBalancedBot,
  Turtle: createTurtleBot,
  Tier1Spam: createTier1SpamBot,
  MiningDenial: createMiningDenialBot,
  AntiRush: createAntiRushBot,
  'Mono-fire': () => createMonoElementBot('fire'),
  'Mono-lightning': () => createMonoElementBot('lightning'),
  'Mono-water': () => createMonoElementBot('water'),
  'Mono-shadow': () => createMonoElementBot('shadow'),
  'Mono-plant': () => createMonoElementBot('plant'),
  'Mono-metal': () => createMonoElementBot('metal'),
  'AIv2-easy-fast': () => createEngineBot({ difficulty: 'easy', speed: 'fast' }),
  'AIv2-medium-fast': () => createEngineBot({ difficulty: 'medium', speed: 'fast' }),
  'AIv2-hard-fast': () => createEngineBot({ difficulty: 'hard', speed: 'fast' }),
  // UI-speed presets — confirmation subsets only (orders of magnitude slower)
  'AIv2-easy': () => createEngineBot({ difficulty: 'easy', speed: 'ui' }),
  'AIv2-medium': () => createEngineBot({ difficulty: 'medium', speed: 'ui' }),
  'AIv2-hard': () => createEngineBot({ difficulty: 'hard', speed: 'ui' }),
};

export function createBot(name: string): Bot {
  const factory = FACTORIES[name];
  if (!factory) {
    throw new Error(`Unknown bot "${name}". Available: ${Object.keys(FACTORIES).join(', ')}`);
  }
  return factory();
}

export function botNames(): string[] {
  return Object.keys(FACTORIES);
}
