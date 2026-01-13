# Muju AI Engine Guide

## Overview

The AI stack is composed of a public/private observation layer, belief modeling, beam-planned turn generation, and an MCTS-based search loop. The core engine implementation lives in `muju/src/ai/engine-v2.ts`, with weights and evaluation logic in `muju/src/ai/types.ts` and `muju/src/ai/evaluation.ts`.

## Tuning evaluation weights

The evaluation weights live in `muju/src/ai/types.ts` under `DEFAULT_WEIGHTS`. You can adjust these values to emphasize different strategic priorities.

Example: favor resource advantage and mining over direct combat.

```ts
import { DEFAULT_WEIGHTS } from './types';

const customWeights = {
  ...DEFAULT_WEIGHTS,
  resourceAdvantage: 0.8,
  miningPotential: 0.5,
  threatLevel: 0.2,
};
```

To use custom weights in the engine:

```ts
const ai = new AIEngine('medium', customWeights);
```

Key weights to adjust:

- `unitValue`: material advantage
- `resourceAdvantage`: current stockpile lead
- `territoryControl`: open spawn zones
- `miningPotential`: accessible mining options
- `threatLevel`: immediate kill threats
- `mobility`: number of options next turn
- `centerControl`: board centralization
- `unitHealth`: defensive durability
- `killThreatsReceived`: penalties for enemy kill threats
- `combinedAttackPotential`: combined kill setups
- `spawnDenialPressure`: enemy units in your spawn zone
- `spawnInfiltration`: your units in enemy spawn zone
- `queueValue`: discounted value of queued units
- `stepEfficiency`: ability to use remaining action points
- `techTreeProgress`: tier unlock progression

## Difficulty presets

Difficulty is driven by the configuration in `muju/src/ai/engine-v2.ts`. Each preset changes the size of the search budget and tactical depth:

- **Easy**: lower MCTS iterations, smaller beam width, fewer belief particles, no tactical sharpening.
- **Medium**: moderate MCTS iterations, wider beam, more particles, 1-ply tactical sharpening.
- **Hard**: larger MCTS iterations/time, wider beam, more particles, deeper tactical sharpening.

You can update these presets in the `DIFFICULTY_PRESETS` constant.

## AI Console

The game screen includes an AI console panel that lists the top candidate plans and search parameters. It reads debug information returned by `AIEngineV2.findBestAction` and is rendered via `muju/src/components/AIConsole.tsx`. You can expand the debug payload in `AIEngineV2` if you want additional diagnostics.
