import type { Bot } from '../types';
import { createRandomBot } from './random';
import { createGreedyBot } from './greedy';
import { createRushBot, createExpandBot, createBalancedBot } from './archetypes';
import { createTurtleBot, createTier1SpamBot, createMiningDenialBot, createAntiRushBot } from './probes';
import { createEngineBot } from './engine';
import { createMonoElementBot } from './mono';
import { createClockHeistBot } from './clockheist';
import { createHardBot } from '../../hard-ai/bots/hard';

/**
 * Bot registry. Names are the public identifiers used in experiment configs
 * and result rows; keep them stable.
 *
 * Ladder: Random (L0) < Greedy (L1) < Rush/Expand/Balanced (L2) < AIv2-* (L3)
 *         < Hard-* (L4, the replica search of `src/ai/hard/`)
 * Probes: Turtle, Tier1Spam, MiningDenial, AntiRush
 * Kill-clock detector: ClockHeist (STRATEGOS W1.12, `clockheist.ts`'s header
 * for the full behaviour and why its name must never match `/AntiRush|Guard/`).
 *
 * `Hard-25k`/`Hard-400k` are fixed-WORK presets (deterministic, machine
 * independent); `Hard-wall-3000` is the shipped desktop wall-clock budget and
 * `Hard-mobile` the phone profile at its own wall clock (DESIGN §6.3, §7.7).
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
  ClockHeist: createClockHeistBot,
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
  // M14: the hard engine (DESIGN §7.7).
  'Hard-25k': () => createHardBot({ work: { mode: 'fixed', units: 25_000 }, profile: 'lab', name: 'Hard-25k' }),
  'Hard-400k': () => createHardBot({ work: { mode: 'fixed', units: 400_000 }, profile: 'lab', name: 'Hard-400k' }),
  'Hard-wall-3000': () => createHardBot({ work: { mode: 'wall', ms: 3000 }, profile: 'desktop', name: 'Hard-wall-3000' }),
  'Hard-mobile': () => createHardBot({ work: { mode: 'wall', ms: 1500 }, profile: 'phone', name: 'Hard-mobile' }),
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
